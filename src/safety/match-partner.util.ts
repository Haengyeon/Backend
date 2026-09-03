// 신고와 차단이 공유하는 선행조건 검증.
//
// 둘 다 "실제 매칭되었던 상대"만 대상으로 삼을 수 있다.
// 그래서 두 API 모두 대상 userId가 아니라 matchAttemptId를 받고, 대상은 여기서 서버가 도출한다.
//
// MatchAttempt에는 userId가 없어서 matchingA / matchingB를 타고 들어가야 한다.
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MatchPartner {
  /** 신고·차단 대상 */
  partnerUserId: string;

  /** 채팅방은 양쪽 결제가 끝나야 생긴다. 응답 전 단계의 매칭에는 아직 없다 */
  chatRoomId: string | null;
}

/**
 * matchAttempt의 상대를 찾는다. 요청자가 그 매칭의 참여자가 아니면 403.
 *
 * MatchAttempt의 상태는 보지 않는다. 매칭 제안을 받은 직후(WAITING_RESPONSE)
 * 상대 프로필이 부적절해서 신고하는 경우가 신고 사유 중 하나(INAPPROPRIATE_PROFILE)라,
 */
export async function resolveMatchPartner(
  prisma: PrismaService,
  userId: string,
  matchAttemptId: string,
): Promise<MatchPartner> {
  const attempt = await prisma.matchAttempt.findUnique({
    where: { id: matchAttemptId },
    select: {
      matchingA: { select: { userId: true } },
      matchingB: { select: { userId: true } },
      chatRoom: { select: { id: true } },
    },
  });

  if (!attempt) {
    throw new NotFoundException('매칭 이력을 찾을 수 없습니다.');
  }

  const { matchingA, matchingB } = attempt;
  const isSideA = matchingA.userId === userId;
  const isSideB = matchingB.userId === userId;

  if (!isSideA && !isSideB) {
    throw new ForbiddenException('해당 매칭의 참여자가 아닙니다.');
  }

  const partnerUserId = isSideA ? matchingB.userId : matchingA.userId;

  // 상대를 서버가 도출하므로 본인이 대상으로 잡히는 일은 원래 없다.
  // 매칭 엔진이 자기 자신을 후보로 잡는 버그가 생겼을 때를 위한 방어코드.
  if (partnerUserId === userId) {
    throw new ForbiddenException('자기 자신은 신고·차단할 수 없습니다.');
  }

  return { partnerUserId, chatRoomId: attempt.chatRoom?.id ?? null };
}
