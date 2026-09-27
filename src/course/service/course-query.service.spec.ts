// 홈의 완료 카드("여행이 완료되었어요")가 언제 내려가는지.
//
// 내려가는 길은 셋이다 — 후기 작성, 완료 후 24시간, "다시 매칭하기".
// 앞의 둘은 코스 자체의 조건이라 쿼리에 그대로 들어간다. 문제는 세 번째로,
// 서버는 버튼이 눌렸다는 신호를 따로 받지 않는다. 코스가 완료될 때 그 코스의
// 매칭이 모두 닫히므로(endedAt), "열린 매칭이 있다"를 "사용자가 스스로 다음
// 사이클을 열었다"로 읽는다.
import { ForbiddenException } from '@nestjs/common';
import { CourseQueryService } from './course-query.service';
import { CourseReviewService } from './course-review.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
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

  // 이 테스트는 사진 경로를 타지 않아 서명은 빈 결과로 충분하다
  const storage = {
    signMany: jest.fn().mockResolvedValue(new Map<string, string>()),
  } as unknown as StorageService;

  const service = new CourseQueryService(
    mock as unknown as PrismaService,
    storage,
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

// 개발용 전체 조회(GET /courses/:courseId/full)는 여행일 잠금만 푼다.
describe('getDetail - 개발용 전체 조회', () => {
  // 여행일이 한참 남아 평소라면 LOCKED인 코스
  const lockedCourse = {
    id: 'course-1',
    matchAttemptId: 'attempt-1',
    title: '서울 야경 데이트 코스',
    description: null,
    region: 'SEOUL',
    theme: 'NIGHT_DATE',
    travelDate: new Date('2099-01-01'),
    thumbnailUrl: null,
    durationMinutes: 240,
    totalDistanceKm: 5.2,
    status: CourseStatus.UPCOMING,
    video: null,
    completionRequests: [],
    matchAttempt: {
      isExperience: false,
      matchingA: { userId: USER_ID, user: { profile: null } },
      matchingB: { userId: 'partner-1', user: { profile: null } },
    },
    spots: [
      {
        id: 'spot-1',
        contentId: null,
        order: 1,
        role: null,
        name: '서울스카이',
        category: null,
        description: null,
        address: '서울 송파구',
        sigunguCode: null,
        legalSigunguCode: null,
        latitude: 37.5,
        longitude: 127.1,
        imageUrl: null,
        stayMinutes: 60,
        moveMinutesFromPrevious: null,
        missions: [
          {
            id: 'mission-1',
            title: '야경 사진 찍기',
            description: null,
            isRequired: true,
            photos: [],
          },
        ],
      },
    ],
  };

  function buildDetailService(course: object = lockedCourse) {
    const prisma = {
      course: { findUnique: jest.fn().mockResolvedValue(course) },
    };
    const storage = {
      signMany: jest.fn().mockResolvedValue(new Map<string, string>()),
    } as unknown as StorageService;
    const review = {
      getMyReviews: jest.fn().mockResolvedValue({}),
    } as unknown as CourseReviewService;

    return new CourseQueryService(
      prisma as unknown as PrismaService,
      storage,
      review,
    );
  }

  it('평소 조회는 여행일 전이라 장소를 가린다', async () => {
    const detail = await buildDetailService().getDetail(USER_ID, 'course-1');

    expect(detail.viewType).toBe('LOCKED');
    expect(detail.spots).toBeUndefined();
  });

  it('ignoreLock이면 여행일 전에도 장소와 미션까지 준다', async () => {
    const detail = await buildDetailService().getDetail(USER_ID, 'course-1', {
      ignoreLock: true,
    });

    expect(detail.viewType).toBe('FULL');
    expect(detail.spots?.[0].name).toBe('서울스카이');
    expect(detail.spots?.[0].mission?.title).toBe('야경 사진 찍기');
  });

  it('참여자가 아니면 ignoreLock이어도 막는다', async () => {
    await expect(
      buildDetailService().getDetail('stranger', 'course-1', {
        ignoreLock: true,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // 완료 버튼은 누르는 사람의 사진·한마디가 2개 이상이어야 켜진다.
  // 스팟마다 사진을 나눠 담아, 두 사람이 코스를 도는 모양 그대로 만든다.
  describe('완료 버튼 활성화(available)', () => {
    const photo = (userId: string, comment: string | null, n: number) => ({
      id: `photo-${userId}-${n}`,
      userId,
      imageUrl: `mission-photos/${userId}-${n}.jpg`,
      comment,
      createdAt: new Date(),
    });

    const withPhotos = (
      base: Omit<typeof lockedCourse, 'status'> & { status: CourseStatus },
      photosBySpot: ReturnType<typeof photo>[][],
    ) => ({
      ...base,
      spots: photosBySpot.map((photos, i) => ({
        ...base.spots[0],
        id: `spot-${i + 1}`,
        order: i + 1,
        missions: [
          { ...base.spots[0].missions[0], id: `mission-${i + 1}`, photos },
        ],
      })),
    });

    const today = {
      ...lockedCourse,
      travelDate: new Date(),
      status: CourseStatus.IN_PROGRESS,
    };

    it('내 사진과 한마디가 2개 이상이면 켠다', async () => {
      const course = withPhotos(today, [
        [photo(USER_ID, '첫 번째 한마디', 1)],
        [photo(USER_ID, '두 번째 한마디', 2)],
      ]);

      const detail = await buildDetailService(course).getDetail(
        USER_ID,
        'course-1',
      );

      expect(detail.completionRequest?.available).toBe(true);
    });

    it('상대가 다 채웠어도 내 한마디가 모자라면 끈다', async () => {
      const course = withPhotos(today, [
        [photo(USER_ID, '한마디', 1), photo('partner-1', '상대 한마디', 1)],
        [photo(USER_ID, null, 2), photo('partner-1', '상대 한마디', 2)],
      ]);

      const detail = await buildDetailService(course).getDetail(
        USER_ID,
        'course-1',
      );

      expect(detail.completionRequest?.available).toBe(false);
    });

    it('여행일 전에는 사진이 있어도 끈다', async () => {
      const course = withPhotos(lockedCourse, [
        [photo(USER_ID, '한마디', 1)],
        [photo(USER_ID, '한마디', 2)],
      ]);

      const detail = await buildDetailService(course).getDetail(
        USER_ID,
        'course-1',
        { ignoreLock: true },
      );

      expect(detail.completionRequest?.available).toBe(false);
    });
  });
});
