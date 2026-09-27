// 코스 완료와 당일 완료 버튼.
//
// 코스를 닫을 때 매칭 사이클도 같이 닫는다. 새 매칭은 "끝나지 않은 매칭이 있으면"
// 막히므로(endedAt: null 검사), 여기서 안 닫으면 여행을 다녀오고도 다음 매칭을 영영 못 한다.
// 완료 버튼은 두 사람이 다 눌러야 닫힌다.
import { ConflictException } from '@nestjs/common';
import { CourseCompletionService } from './course-completion.service';
import { CourseAccessService } from './course-access.service';
import { CourseRewardService } from './course-reward.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotificationService,
  NotificationType,
} from '../../notification/service/notification.service';
import { CourseStatus } from '../../generated/prisma/enums';

const COURSE_ID = 'course-1';
const MATCHING_A = 'matching-a';
const MATCHING_B = 'matching-b';

/** 오늘이 여행일인 진행중 코스 */
const course = {
  id: COURSE_ID,
  status: CourseStatus.IN_PROGRESS as CourseStatus,
  travelDate: new Date(),
  matchAttempt: {
    isExperience: false,
    matchingA: { userId: 'me' },
    matchingB: { userId: 'partner' },
  },
};

function buildService({
  changedCount = 1,
  loaded = course,
  photoCount = 3,
  partnerRequested = false,
  alreadyRequested = false,
}: {
  changedCount?: number;
  loaded?: typeof course;
  photoCount?: number;
  partnerRequested?: boolean;
  alreadyRequested?: boolean;
} = {}) {
  const tx = {
    course: {
      updateMany: jest.fn().mockResolvedValue({ count: changedCount }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: COURSE_ID,
        status: CourseStatus.COMPLETED,
        completedAt: new Date(),
        region: 'SEOUL',
        spots: [{ sigunguCode: '24', legalSigunguCode: '11140' }],
        matchAttempt: {
          matchingA: { id: MATCHING_A },
          matchingB: { id: MATCHING_B },
        },
      }),
    },
    matching: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };

  const createRequest = jest
    .fn()
    .mockResolvedValue({ count: alreadyRequested ? 0 : 1 });

  const prisma = {
    $transaction: jest.fn((run: (t: typeof tx) => unknown) => run(tx)),
    courseMissionPhoto: { count: jest.fn().mockResolvedValue(photoCount) },
    courseCompletionRequest: {
      createMany: createRequest,
      count: jest.fn().mockResolvedValue(partnerRequested ? 1 : 0),
    },
  } as unknown as PrismaService;

  const access = {
    loadCourseForUser: jest.fn().mockResolvedValue(loaded),
    resolvePartnerId: jest.fn().mockReturnValue('partner'),
  } as unknown as CourseAccessService;

  const reward = {
    grantCompletionRewards: jest
      .fn()
      .mockResolvedValue({ stamps: [], pointsAfter: 1000 }),
  } as unknown as CourseRewardService;

  const notify = jest.fn().mockResolvedValue(undefined);
  const notification = { send: notify } as unknown as NotificationService;

  const service = new CourseCompletionService(
    prisma,
    access,
    reward,
    notification,
  );

  return { service, tx, reward, createRequest, notify };
}

describe('completeCourse', () => {
  it('두 사람 몫의 보상을 준다', async () => {
    const { service, reward } = buildService();

    await service.completeCourse(COURSE_ID, 'me', 'partner');

    expect(reward.grantCompletionRewards).toHaveBeenCalledTimes(2);
  });

  it('매칭 사이클을 닫아 다음 매칭을 열어 준다', async () => {
    // 당일에 닫히든(사진·한마디, 완료 버튼) 다음 날 시계가 닫든, 완료되는 순간 다시 매칭할 수 있어야 한다.
    // 후기를 조건으로 걸면 안 쓴 사람이 영영 갇힌다
    const { service, tx } = buildService();

    await service.completeCourse(COURSE_ID, 'me', 'partner');

    const arg = tx.matching.updateMany.mock.calls[0][0];
    expect(arg.where.id.in).toEqual([MATCHING_A, MATCHING_B]);
    expect(arg.data.endedAt).toBeInstanceOf(Date);
    // 3회 거절로 이미 닫힌 매칭은 건드리지 않는다
    expect(arg.where.endedAt).toBeNull();
  });

  it('체험 코스는 닫지 않는다 - 가상 상대와의 체험에 보상이 쌓이면 안 된다', async () => {
    const { service, tx } = buildService();

    await service.completeCourse(COURSE_ID, 'me', 'partner');

    // 사진·한마디, 완료 버튼, 시계가 모두 이 조건을 지난다
    const arg = tx.course.updateMany.mock.calls[0][0];
    expect(arg.where.matchAttempt).toEqual({ isExperience: false });
  });

  it('이미 완료된 코스면 아무것도 하지 않는다', async () => {
    // 두 사람이 동시에 닫으려 하면 늦은 쪽은 바뀐 행이 0이다
    const { service, tx, reward } = buildService({ changedCount: 0 });

    const result = await service.completeCourse(COURSE_ID, 'me', 'partner');

    expect(result).toBeNull();
    expect(reward.grantCompletionRewards).not.toHaveBeenCalled();
    expect(tx.matching.updateMany).not.toHaveBeenCalled();
  });
});

describe('requestCompletion — 당일 완료 버튼', () => {
  it('혼자 누르면 기록만 하고 상대에게 알린다', async () => {
    const { service, tx, notify } = buildService();

    const result = await service.requestCompletion('me', COURSE_ID);

    expect(result).toEqual({
      completed: false,
      partnerRequested: false,
      completion: null,
    });
    expect(notify).toHaveBeenCalledWith(
      'partner',
      NotificationType.COURSE_COMPLETION_REQUESTED,
    );
    expect(tx.course.updateMany).not.toHaveBeenCalled();
  });

  it('상대가 이미 눌렀으면 그 자리에서 코스를 닫는다', async () => {
    const { service, reward, notify } = buildService({
      partnerRequested: true,
    });

    const result = await service.requestCompletion('me', COURSE_ID);

    expect(result.completed).toBe(true);
    expect(result.completion?.earnedPoints).toBe(1000);
    // 같이 걸은 코스라 보상은 두 사람 몫이다
    expect(reward.grantCompletionRewards).toHaveBeenCalledTimes(2);
    expect(notify).not.toHaveBeenCalled();
  });

  it('두 번 눌러도 상대 알림은 한 번만 간다', async () => {
    const { service, notify } = buildService({ alreadyRequested: true });

    await service.requestCompletion('me', COURSE_ID);

    expect(notify).not.toHaveBeenCalled();
  });

  it('인증샷이 2장 이하면 사진을 더 올리라고 막는다', async () => {
    const { service, createRequest } = buildService({ photoCount: 2 });

    await expect(service.requestCompletion('me', COURSE_ID)).rejects.toThrow(
      '사진을 더 올려주세요',
    );
    // 막히면 누른 기록도 남기지 않는다
    expect(createRequest).not.toHaveBeenCalled();
  });

  it('여행일 전에는 누를 수 없다', async () => {
    const later = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const { service } = buildService({
      loaded: { ...course, travelDate: later },
    });

    await expect(service.requestCompletion('me', COURSE_ID)).rejects.toThrow(
      '여행 당일부터 완료할 수 있어요',
    );
  });

  it('체험 코스는 버튼으로 끝내지 않는다', async () => {
    const { service } = buildService({
      loaded: {
        ...course,
        matchAttempt: { ...course.matchAttempt, isExperience: true },
      },
    });

    await expect(service.requestCompletion('me', COURSE_ID)).rejects.toThrow(
      '체험 코스는',
    );
  });

  it('이미 완료된 코스면 409', async () => {
    const { service } = buildService({
      loaded: { ...course, status: CourseStatus.COMPLETED },
    });

    await expect(service.requestCompletion('me', COURSE_ID)).rejects.toThrow(
      ConflictException,
    );
  });
});
