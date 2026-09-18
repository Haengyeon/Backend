import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { PaymentStatus } from '../../generated/prisma/enums';
import { MATCHING_PAYMENT_AMOUNT } from '../../common/payment.constant';

/**
 * 더미 상대의 결제를 대신 처리한다.
 *
 * 더미는 실제 카카오 계정이 없어 결제창을 띄울 수 없다.
 * 그래서 결제 대기 상태가 되는 순간 이미 결제를 마친 것으로 기록해 두고,
 * 실제 사용자가 결제를 끝내면 confirmIfBothPaid가 양쪽 APPROVED를 확인해
 * 매칭이 확정된다. 이후 채팅방과 코스 생성도 평소 흐름 그대로 진행된다.
 *
 * MatchAttemptService가 DummyMatchingService를 직접 부르면 순환 참조가 되므로
 * 결제 부분만 따로 떼어 둔다.
 */
@Injectable()
export class DummyPaymentService {
    private readonly logger = new Logger(DummyPaymentService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * 매칭 시도의 양쪽을 확인해 더미인 쪽의 결제를 완료 처리한다.
     * 실제 사용자만 있는 매칭이면 아무것도 하지 않는다.
     */
    async payForDummies(matchAttemptId: string): Promise<void> {
        if (process.env.DEMO_MATCHING_ENABLED !== 'true') return;

        const attempt = await this.prisma.matchAttempt.findUnique({
            where: { id: matchAttemptId },
            select: {
                matchingA: {
                    select: {
                        userId: true,
                        user: { select: { isDummy: true } },
                    },
                },
                matchingB: {
                    select: {
                        userId: true,
                        user: { select: { isDummy: true } },
                    },
                },
            },
        });

        if (!attempt) return;

        const dummySides = [attempt.matchingA, attempt.matchingB].filter(
            (side) => side.user.isDummy,
        );

        for (const side of dummySides) {
            try {
                await this.prisma.payment.upsert({
                    where: {
                        matchAttemptId_userId: {
                            matchAttemptId,
                            userId: side.userId,
                        },
                    },
                    update: {
                        status: PaymentStatus.APPROVED,
                        approvedAt: new Date(),
                    },
                    create: {
                        matchAttemptId,
                        userId: side.userId,
                        amount: MATCHING_PAYMENT_AMOUNT,
                        status: PaymentStatus.APPROVED,
                        approvedAt: new Date(),
                        // 카카오를 거치지 않았으므로 거래번호가 없다.
                        // 환불 로직도 tid가 없으면 건너뛰도록 되어 있어 안전하다.
                        kakaoPayTid: null,
                    },
                });

                this.logger.log(
                    `더미 결제 완료 처리: attempt=${matchAttemptId}, dummy=${side.userId}`,
                );
            } catch (error) {
                // 결제 기록에 실패해도 실제 사용자의 결제 흐름은 막지 않는다
                this.logger.error(
                    `더미 결제 처리 실패: dummy=${side.userId}`,
                    error as Error,
                );
            }
        }
    }
}