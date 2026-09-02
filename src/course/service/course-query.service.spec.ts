// 홈의 완료 카드("여행이 완료되었어요")가 언제 내려가는지.
//
// 내려가는 길은 셋이다 — 후기 작성, 완료 후 24시간, "다시 매칭하기".
// 앞의 둘은 코스 자체의 조건이라 쿼리에 그대로 들어간다. 문제는 세 번째로,
// 서버는 버튼이 눌렸다는 신호를 따로 받지 않는다. 코스가 완료될 때 그 코스의
// 매칭이 모두 닫히므로(endedAt), "열린 매칭이 있다"를 "사용자가 스스로 다음
// 사이클을 열었다"로 읽는다.
import { CourseQueryService } from './course-query.service';
import { CourseReviewService } from './course-review.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '../../generated/prisma/enums';

const USER_ID = 'user-1';

type CourseWhere = {
  OR: {
    status?: unknown;
    completedAt?: { gte: Date };
    reviews?: { none: { userId: string } };
    matchAttempt?: { partnerReviews: { none: { reviewerId: string } } };
  }[];
};

function buildService(openMatching: { id: string } | null) {
  const mock = {
    matching: { findFirst: jest.fn().mockResolvedValue(openMatching) },
    course: { findFirst: jest.fn().mockResolvedValue(null) },
    matchAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const service = new CourseQueryService(
    mock as unknown as PrismaService,
    {} as CourseReviewService,
  );

  const branches = () =>
    (mock.course.findFirst.mock.calls[0][0] as { where: CourseWhere }).where.OR;

  return { service, mock, branches };
}

describe('getCurrent - 완료 카드', () => {
  it('열린 매칭이 없으면 완료 카드 조건이 쿼리에 들어간다', async () => {
    const { service, branches } = buildService(null);

    await service.getCurrent(USER_ID);

    const completed = branches().find(
      (b) => b.status === CourseStatus.COMPLETED,
    );
    expect(completed).toBeDefined();
    // 내 후기가 있으면 카드는 할 일을 다 한 것이다
    expect(completed!.matchAttempt).toEqual({
      partnerReviews: { none: { reviewerId: USER_ID } },
    });
  });

  it('"후기를 썼다"의 기준은 코스 한줄평이 아니라 상대 후기다', async () => {
    // 한줄평(course.reviews)은 선택이라, 그걸로 보면 상대 후기만 쓰고
    // 한줄평을 건너뛴 사람에게 "후기 쓰러 가기" 카드가 계속 남는다
    const { service, branches } = buildService(null);

    await service.getCurrent(USER_ID);

    const completed = branches().find(
      (b) => b.status === CourseStatus.COMPLETED,
    );
    expect(completed!.reviews).toBeUndefined();
  });

  it('"다시 매칭하기"를 눌러 새 매칭이 열려 있으면 완료 카드가 빠진다', async () => {
    // 안 빼면 매칭을 걸어 놓고 홈에 돌아왔을 때 지난 여행 카드가 그대로 남는다
    const { service, mock, branches } = buildService({ id: 'matching-new' });

    await service.getCurrent(USER_ID);

    expect(mock.matching.findFirst).toHaveBeenCalledWith({
      where: { userId: USER_ID, endedAt: null },
      select: { id: true },
    });
    expect(branches().some((b) => b.status === CourseStatus.COMPLETED)).toBe(
      false,
    );
  });

  it('진행중인 코스는 새 매칭이 열려 있어도 그대로 나온다', async () => {
    // 여행 전/당일에는 매칭이 아직 안 닫혀 있어 열린 매칭이 늘 있다.
    // 완료 카드만 가려야지 진행중 코스까지 가리면 안 된다
    const { service, branches } = buildService({ id: 'matching-open' });

    await service.getCurrent(USER_ID);

    expect(branches()).toHaveLength(1);
    expect(branches()[0].status).toEqual({
      in: [CourseStatus.UPCOMING, CourseStatus.IN_PROGRESS],
    });
  });

  it('완료 카드는 완료된 시각부터 24시간까지만', async () => {
    // 가만히 있은 시간이 아니라 completedAt부터 흐르는 시계다
    const { service, branches } = buildService(null);

    await service.getCurrent(USER_ID);

    const completed = branches().find(
      (b) => b.status === CourseStatus.COMPLETED,
    );
    const hoursAgo =
      (Date.now() - completed!.completedAt!.gte.getTime()) / (60 * 60 * 1000);
    expect(hoursAgo).toBeCloseTo(24, 1);
  });
});
