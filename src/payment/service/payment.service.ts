import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import {PrismaService} from "../../prisma/prisma.service";
import {KakaoPayClient} from "./kakao-pay.client";
import {MatchAttemptStatus, MatchingStatus, PaymentStatus} from "../../generated/prisma/enums";
import { CourseGeneratorService } from '../../course/algorithm/course-generator.service';
import {ChatRoomService} from "../../chat/service/chat-room.service";

const PAYMENT_AMOUNT = 25_000; //1인당 결제 금액
const ITEM_NAME = '행연 참가비';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
      private readonly prisma: PrismaService,
      private readonly kakaoPay: KakaoPayClient,
      private readonly courseGenerator: CourseGeneratorService,
      private readonly chatRoom: ChatRoomService,
  ) {}

  //결제준비: 카카오에 tid 발급받고 결제창 url 반환
  async ready(userId: string,  matchAttemptId: string) {
    await this.findPayableAttempt(userId, matchAttemptId);
    const existing = await this.prisma.payment.findUnique({
      where: {
        matchAttemptId_userId: {matchAttemptId, userId},
      },
    });

    if (existing?.status === PaymentStatus.APPROVED) {
      throw new ConflictException('이미 결제를 완료했습니다.');
    }

    // 결제창을 닫고 다시 시도하는 경우도 있으니 READY 상태면 tid만 새로 발급받아 갱신.
    const payment = existing
        ? existing
        : await this.prisma.payment.create({
          data: {
            matchAttemptId,
            userId,
            amount: PAYMENT_AMOUNT,
            status: PaymentStatus.READY,
          },
        });
    const result = await this.kakaoPay.ready({
      partnerOrderId: payment.id,
      partnerUserId: userId,
      itemName: ITEM_NAME,
      totalAmount: PAYMENT_AMOUNT,
      approvalUrl: this.buildRedirectUrl('APPROVAL', payment.id),
      cancelUrl: this.buildRedirectUrl('CANCEL', payment.id),
      failUrl: this.buildRedirectUrl('FAIL', payment.id),
    });

    await this.prisma.payment.update({
      where: {id: payment.id},
      data: { kakaoPayTid: result.tid, status: PaymentStatus.READY},
    });

    return {
      paymentId: payment.id,
      tid: result.tid,
      nextRedirectPcUrl: result.next_redirect_pc_url,
      nextRedirectMobileUrl: result.next_redirect_mobile_url,
      nextRedirectAppUrl: result.next_redirect_app_url,
    };
  }

  // 결제승인 : 프론트가 리다이렉트 받고 결제 토큰 넘겨주면 최종승인
  async approve(userId: string, paymentId: string, pgToken: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('결제 정보를 찾을 수 없습니다.');
    }

    if (payment.userId !== userId) {
      throw new ForbiddenException('해당 결제에 대한 권한이 없습니다');
    }

    if (payment.status === PaymentStatus.APPROVED) {
      throw new ConflictException('이미 결제를 완료했습니다.');
    }

    if (!payment.kakaoPayTid) {
      throw new BadRequestException('결제 준비가 완료되지 않았습니다.');
    }

    // 마감 이후 승인 시도 차단
    await this.findPayableAttempt(userId, payment.matchAttemptId);

    const result = await this.kakaoPay.approve({
      tid: payment.kakaoPayTid,
      partnerOrderId: payment.id,
      partnerUserId: userId,
      pgToken,
    });

    const approvedAt = KakaoPayClient.parseKakaoDateTime(result.approved_at);

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.APPROVED,
        approvedAt,
      },
    });

    const confirmed = await this.confirmIfBothPaid(payment.matchAttemptId);

    return {
      paymentId: payment.id,
      status: PaymentStatus.APPROVED,
      matchAttemptId: payment.matchAttemptId,
      matchConfirmed: confirmed,
    };
  }

  // 양쪽 모두 결제 마치면 매칭 확정
  private async confirmIfBothPaid(matchAttemptId: string): Promise<boolean> {
    const attempt = await this.prisma.matchAttempt.findUniqueOrThrow({
      where: { id: matchAttemptId },
      include: {
        payments: {
          where: { status: PaymentStatus.APPROVED },
          select: { userId: true },
        },
      },
    });

    if (attempt.status !== MatchAttemptStatus.PAYMENT_PENDING) return false;
    if (attempt.payments.length < 2) return false;

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.matchAttempt.update({
        where: { id: matchAttemptId },
        data: {
          status: MatchAttemptStatus.CONFIRMED,
          confirmedAt: now,
        },
      });

      await tx.matching.updateMany({
        where : {
          id: { in: [attempt.matchingAId, attempt.matchingBId] },
        },
        data: { status: MatchingStatus.CONFIRMED },
      });

      // 확정과 동시에 채팅방 생성 (여행 전날 00시 KST에 스케줄러가 열어줌)
      await this.chatRoom.createForConfirmedAttempt(tx, {
        matchAttemptId,
        travelDate: attempt.travelDate,
        userIds: attempt.payments.map((p) => p.userId),
      });
    });

    this.logger.log(`매칭 확정: attempt=${matchAttemptId}`);

    // 확정되면 코스를 만든다.
    // TourAPI 호출이 섞여 있어 시간이 걸리므로 결제 응답을 막지 않고 던져 둔다.
    // 실패하면 코스 없이 지나가므로 POST /api/v1/courses/regenerate로 다시 시도한다.
    this.courseGenerator
      .generateForMatchAttempt(matchAttemptId)
      .catch((error) =>
        this.logger.error('매칭 확정 후 코스 생성 중 오류', error as Error),
      );

    return true;
  }

  //결제 가능한 상태인지 검증
  private async findPayableAttempt(userId: string, matchAttemptId: string) {
    const attempt = await this.prisma.matchAttempt.findUnique({
      where: { id: matchAttemptId },
      include: {
        matchingA: { select: {userId: true }},
        matchingB: { select: {userId: true} },
      },
    });

    if (!attempt) {
      throw new NotFoundException('매칭 시도를 찾을 수 없습니다.');
    }

    const isParty =
        attempt.matchingA.userId === userId ||
        attempt.matchingB.userId === userId;

    if (!isParty) {
      throw new ForbiddenException('해당 매칭에 대한 권한이 없습니다.');
    }

    if (attempt.status !== MatchAttemptStatus.PAYMENT_PENDING) {
      throw new ConflictException('결제 가능한 상태가 아닙니다.');
    }

    if (attempt.paymentDeadlineAt && new Date() > attempt.paymentDeadlineAt) {
      throw new BadRequestException('결제 마감 시한이 지났습니다.');
    }

    return attempt;
  }

// 카카오 결제 후 사용자를 돌려보낼 주소(프론트도메인)
  private buildRedirectUrl(
      kind: 'APPROVAL' | 'CANCEL' | 'FAIL',
      paymentId: string,
  ): string {
    const base = process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000';

    const path = {
      APPROVAL: '/payments/success',
      CANCEL: '/payments/cancel',
      FAIL: '/payments/fail',
    }[kind];

    return `${base}${path}?paymentId=${paymentId}`;
  }
}