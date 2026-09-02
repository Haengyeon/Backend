// 쌓인 포인트를 읽는다.
//
// 적립은 여기서 하지 않는다. 코스를 완료할 때 CourseRewardService가 트랜잭션
// 안에서 계정과 내역을 함께 쓰고, 이 서비스는 그렇게 쌓인 것을 읽기만 한다.
// 지급 시점이 완료라 조회에서 다시 계산할 일이 없다.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PointHistoryResponseDto,
  PointResponseDto,
} from '../dto/response/point-response.dto';

export const POINT_HISTORY_DEFAULT_LIMIT = 20;
export const POINT_HISTORY_MAX_LIMIT = 50;

/**
 * 코스가 걸리지 않은 적립에 쓸 사유 문구.
 *
 * 지금은 코스 완료뿐이라 여기 걸릴 일이 없다. 출석이나 친구 초대처럼
 * 코스 밖에서 주는 포인트가 생기면 그때 문구가 이 표에서 나온다.
 */
const REASON_LABEL: Record<string, string> = {
  COURSE_COMPLETE: '코스 완료',
};

@Injectable()
export class PointService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 마이페이지 포인트.
   *
   * 계정은 첫 적립 때 만들어진다. 아직 코스를 끝낸 적 없는 사람은 계정이 없고,
   * 그건 오류가 아니라 0원이다.
   */
  async getPoints(userId: string): Promise<PointResponseDto> {
    const account = await this.prisma.pointAccount.findUnique({
      where: { userId },
      select: { balance: true },
    });

    return { points: account?.balance ?? 0 };
  }

  /** 적립 내역. 최근 것부터 커서 페이징. */
  async getHistory(
    userId: string,
    limit: number = POINT_HISTORY_DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<PointHistoryResponseDto> {
    const take = Math.min(Math.max(limit, 1), POINT_HISTORY_MAX_LIMIT);

    // 한 건 더 받아서 다음 페이지가 있는지 본다
    const rows = await this.prisma.pointTransaction.findMany({
      where: { pointAccount: { userId } },
      // 같은 순간에 두 건이 들어올 수 있어(코스 두 개가 한 시계에 닫히는 경우)
      // id로 한 번 더 갈라 커서가 밀리지 않게 한다
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { course: { select: { title: true } } },
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const items = page.map((row) => ({
      id: row.id,
      type: row.type,
      amount: row.amount,
      pointsAfter: row.balanceAfter,
      // 사유 자리에는 코스 이름을 보여준다. "서울 로컬 맛집 코스"가
      // 'COURSE_COMPLETE'보다 어떤 여행으로 받은 포인트인지 훨씬 분명하다.
      reason:
        row.course?.title ?? REASON_LABEL[row.reasonCode] ?? row.reasonCode,
      reasonCode: row.reasonCode,
      courseId: row.courseId,
      createdAt: row.createdAt,
    }));

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    };
  }
}
