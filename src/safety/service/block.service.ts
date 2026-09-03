// 차단. 신고를 접수하면 함께 처리된다.
//
// 차단 전용 엔드포인트는 없다. 신고 버튼 하나로 둘 다 일어나는 구조라,
// 서버가 한 트랜잭션으로 묶어야 "신고는 됐는데 차단이 안 된" 상태가 안 생긴다.
// 차단 한 번으로 두 가지가 동시에 끊긴다.
//   - 지금 열려 있는 대화: 채팅방을 DISABLED로
//   - 앞으로의 만남: 매칭 후보에서 서로 제외 (findExcludedUserIds)
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { ChatRoomStatus } from '../../generated/prisma/enums';
import { SAFETY_USER_SELECT, toSafetyUser } from '../safety-user.util';
import {
  BlockListResponseDto,
  BlockResponseDto,
} from '../dto/response/block-response.dto';

const BLOCK_INCLUDE = {
  blockedUser: { select: SAFETY_USER_SELECT },
} as const;

/** BLOCK_INCLUDE로 읽어 온 차단 한 건에서 응답에 쓰는 부분 */
type BlockWithTarget = {
  id: string;
  createdAt: Date;
  blockedUser: {
    id: string;
    profile: { name: string; profileImageUrl: string } | null;
  };
};

@Injectable()
export class BlockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 차단 처리. 신고 트랜잭션 안에서 호출된다.
   *
   * 별도 엔드포인트는 두지 않는다. 차단은 신고를 통해서만 일어나고,
   * 그래야 "신고했는데 차단이 안 된" 중간 상태가 생기지 않는다.
   * (차단 전용 버튼이 생기면 이 메서드를 감싸는 엔드포인트를 다시 열면 된다)
   *
   * 이미 차단된 상대면 아무것도 하지 않는다. 신고는 되고 차단은 이미 되어 있는
   * 상황에서 유니크 위반으로 트랜잭션 전체가 롤백되면 신고까지 날아간다.
   */
  async applyBlock(
    tx: Pick<PrismaService, 'userBlock' | 'chatRoom'>,
    params: {
      blockingUserId: string;
      blockedUserId: string;
      matchAttemptId: string;
      chatRoomId: string | null;
    },
  ): Promise<void> {
    const already = await tx.userBlock.findUnique({
      where: {
        blockingUserId_blockedUserId: {
          blockingUserId: params.blockingUserId,
          blockedUserId: params.blockedUserId,
        },
      },
      select: { id: true },
    });

    if (!already) {
      await tx.userBlock.create({
        data: {
          matchAttemptId: params.matchAttemptId,
          blockingUserId: params.blockingUserId,
          blockedUserId: params.blockedUserId,
        },
      });
    }

    // 채팅방은 양쪽 결제가 끝나야 생긴다. 결제 전 매칭에는 끊을 대화 자체가 없다.
    if (params.chatRoomId) {
      await tx.chatRoom.update({
        where: { id: params.chatRoomId },
        data: { status: ChatRoomStatus.DISABLED },
      });
    }
  }

  /**
   * 내가 차단한 유저 목록. 나를 차단한 사람은 보이지 않는다 —
   * 그걸 보여주면 차단당한 사실 자체가 알려진다.
   *
   * 페이징하지 않는다(신고 내역과 같은 이유).
   */
  async findMine(userId: string): Promise<BlockListResponseDto> {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockingUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: BLOCK_INCLUDE,
    });

    return { items: blocks.map((block) => this.toDto(block)) };
  }

  /**
   * 매칭 후보에서 빼야 할 사용자들. MatchingEngineService가 쓴다.
   *
   * 내가 차단한 쪽과 나를 차단한 쪽 모두 제외한다. 한 방향만 막으면 차단당한
   * 사람이 새 Matching을 만들었을 때 상대가 후보로 다시 떠서 차단이 우회된다.
   *
   * 거절 쿨다운과 달리 기간 조건이 없다. 차단은 기한 없이 유지된다.
   */
  async findExcludedUserIds(userId: string): Promise<string[]> {
    const blocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [{ blockingUserId: userId }, { blockedUserId: userId }],
      },
      select: { blockingUserId: true, blockedUserId: true },
    });

    const userIds = blocks.flatMap((block) => [
      block.blockingUserId,
      block.blockedUserId,
    ]);

    // 내 userId도 섞여 들어가지만 엔진이 어차피 별도로 제외한다
    return [...new Set(userIds)];
  }

  private toDto(block: BlockWithTarget): BlockResponseDto {
    return {
      blockId: block.id,
      blockedUser: toSafetyUser(block.blockedUser),
      createdAt: block.createdAt,
    };
  }
}
