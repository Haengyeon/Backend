// 신고 접수와 내가 접수한 신고 조회.
//
// 여기서 하는 일은 접수까지다. 신고가 쌓였다고 계정을 정지시키거나 매칭을 막지
// 않는다. 신고는 상대에게 불이익을 주는 데 쓰일 수 있어서(경쟁 상대를 밀어내려고
// 허위로 넣는 식) 반드시 운영자 검토를 거치게 두고, 사용자가 스스로 관계를
// 끊고 싶으면 그건 차단(BlockService)이 한다.
import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { isUniqueViolation } from '../../common/prisma-error.util';
import { ReportReasonCode, ReportStatus } from '../../generated/prisma/enums';
import { resolveMatchPartner } from '../match-partner.util';
import { BlockService } from './block.service';
import { SAFETY_USER_SELECT, toSafetyUser } from '../safety-user.util';
import { CreateReportDto } from '../dto/request/create-report.dto';
import {
  ReportListResponseDto,
  ReportResponseDto,
} from '../dto/response/report-response.dto';

/** 내역 화면에 그대로 쓰는 사유 문구. 접수 화면의 선택지와 같은 말이어야 한다 */
const REASON_LABEL: Record<ReportReasonCode, string> = {
  [ReportReasonCode.INAPPROPRIATE_PROFILE]: '부적절한 프로필',
  [ReportReasonCode.NO_SHOW]: '노쇼',
  [ReportReasonCode.ABUSE_HARASSMENT]: '폭언·희롱',
  [ReportReasonCode.SEXUAL_HARASSMENT]: '성희롱·성적 불쾌감',
  [ReportReasonCode.SUSPECTED_FRAUD]: '사기 의심',
  [ReportReasonCode.OTHER]: '기타',
};

/**
 * 이 건수부터 로그 레벨을 올려 눈에 띄게 한다.
 *
 * 여기서 계정을 정지시키지는 않는다. 신고 버튼 하나로 차단까지 함께 처리하는
 * 구조라 "악질이어서"가 아니라 "그냥 안 맞아서" 눌린 신고가 섞여 들어오고,
 * 매칭 서비스는 거절 앙심 신고도 흔하다. 몇 명만 모이면 아무나 지울 수 있게 된다.
 * 그래서 자동 제재 대신 사람이 먼저 보도록 표시만 남긴다.
 */
const REVIEW_THRESHOLD = 3;

const REPORT_INCLUDE = {
  reportedUser: { select: SAFETY_USER_SELECT },
} as const;

/** REPORT_INCLUDE로 읽어 온 신고 한 건에서 응답에 쓰는 부분 */
type ReportWithTarget = {
  id: string;
  matchAttemptId: string;
  reasonCode: ReportReasonCode;
  description: string | null;
  status: ReportStatus;
  createdAt: Date;
  reportedUser: {
    id: string;
    profile: { name: string; profileImageUrl: string } | null;
  };
};

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlockService,
  ) {}

  /**
   * 신고 접수. 차단까지 함께 처리한다.
   *
   * 대상은 matchAttemptId에서 서버가 찾는다. 상태는 스키마 기본값인 PENDING으로
   * 들어가고, 이게 곧 운영자 검토 대기열이다.
   *
   * 신고와 차단을 한 트랜잭션으로 묶는 이유는 중간 상태를 없애기 위해서다.
   * 클라이언트가 두 API를 연달아 부르는 방식이면 두 번째 호출이 실패했을 때
   * "신고는 접수됐는데 상대는 계속 매칭에 뜨는" 상태가 남는다.
   */
  async create(
    userId: string,
    dto: CreateReportDto,
  ): Promise<ReportResponseDto> {
    const { partnerUserId, chatRoomId } = await resolveMatchPartner(
      this.prisma,
      userId,
      dto.matchAttemptId,
    );

    try {
      const report = await this.prisma.$transaction(async (tx) => {
        const created = await tx.report.create({
          data: {
            matchAttemptId: dto.matchAttemptId,
            reporterId: userId,
            reportedUserId: partnerUserId,
            reasonCode: dto.reasonCode,
            description: dto.description ?? null,
          },
          include: REPORT_INCLUDE,
        });

        await this.blocks.applyBlock(tx, {
          blockingUserId: userId,
          blockedUserId: partnerUserId,
          matchAttemptId: dto.matchAttemptId,
          chatRoomId,
        });

        return created;
      });

      // 같은 사람이 반복해서 신고당하는 걸 운영자가 알아채려면 어딘가에 드러나야 한다.
      // 검토 화면이 아직 없어서 지금은 서버 로그가 그 자리다. 누적 건수를 같이 남기면
      // 로그를 훑는 것만으로 반복 대상이 눈에 띈다.
      //
      // 이 값을 응답에 실어 주지는 않는다. 신고한 사람에게 "이 사람 3번 신고당했어요"를
      // 알려주면 신고가 남을 판단하는 근거로 쓰이게 된다.
      const receivedCount = await this.prisma.report.count({
        where: { reportedUserId: partnerUserId },
      });
      const line =
        `신고 접수: 대상=${partnerUserId} (누적 ${receivedCount}건), ` +
        `사유=${dto.reasonCode}, 매칭=${dto.matchAttemptId}`;

      if (receivedCount >= REVIEW_THRESHOLD) {
        this.logger.warn(`[검토 필요] ${line}`);
      } else {
        this.logger.log(line);
      }

      return this.toDto(report);
    } catch (error) {
      // @@unique([reporterId, matchAttemptId]) — 한 매칭 건당 한 번만 신고할 수 있다.
      // 사유를 바꿔 다시 넣는 것도 같은 건에 대한 중복이라 막는다.
      if (isUniqueViolation(error)) {
        throw new ConflictException('이미 신고한 매칭입니다.');
      }
      throw error;
    }
  }

  /**
   * 내가 접수한 신고 내역. 내가 신고당한 건은 보이지 않는다.
   *
   * 페이징하지 않는다 — 신고는 매칭 건당 한 번뿐이라 한 사람이 쌓을 수 있는
   * 최대치가 지금까지 만난 상대 수고, 그 정도는 한 번에 내려도 된다.
   */
  async findMine(userId: string): Promise<ReportListResponseDto> {
    const reports = await this.prisma.report.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'desc' },
      include: REPORT_INCLUDE,
    });

    return { items: reports.map((report) => this.toDto(report)) };
  }

  private toDto(report: ReportWithTarget): ReportResponseDto {
    return {
      reportId: report.id,
      matchAttemptId: report.matchAttemptId,
      reportedUser: toSafetyUser(report.reportedUser),
      reasonCode: report.reasonCode,
      reason: REASON_LABEL[report.reasonCode] ?? report.reasonCode,
      description: report.description,
      status: report.status,
      createdAt: report.createdAt,
    };
  }
}
