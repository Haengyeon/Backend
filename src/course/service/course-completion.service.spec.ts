// 코스를 닫을 때 매칭 사이클도 같이 닫는다.
//
// 새 매칭은 "끝나지 않은 매칭이 있으면" 막히므로(endedAt: null 검사),
// 여기서 안 닫으면 여행을 다녀오고도 다음 매칭을 영영 못 한다.
import { CourseCompletionService } from './course-completion.service';
import { CourseAccessService } from './course-access.service';
import { CourseRewardService } from './course-reward.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '../../generated/prisma/enums';

const COURSE_ID = 'course-1';
const MATCHING_A = 'matching-a';
const MATCHING_B = 'matching-b';

function buildService(changedCount = 1) {
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

  const prisma = {
    $transaction: jest.fn((run: (t: typeof tx) => unknown) => run(tx)),
  } as unknown as PrismaService;

  const reward = {
    grantCompletionRewards: jest
      .fn()
      .mockResolvedValue({ stamps: [], pointsAfter: 1000 }),
  } as unknown as CourseRewardService;

  const service = new CourseCompletionService(
    prisma,
    {} as CourseAccessService,
    reward,
  );

  return { service, tx, reward };
}

describe('completeCourse', () => {
  it('두 사람 몫의 보상을 준다', async () => {
    const { service, reward } = buildService();

    await service.completeCourse(COURSE_ID, 'me', 'partner');

    expect(reward.grantCompletionRewards).toHaveBeenCalledTimes(2);
  });

  it('매칭 사이클을 닫아 다음 매칭을 열어 준다', async () => {
    // 완료가 시간으로 걸리는 이상 재매칭도 시간으로 열려야 한다.
    // 후기를 조건으로 걸면 안 쓴 사람이 영영 갇힌다
    const { service, tx } = buildService();

    await service.completeCourse(COURSE_ID, 'me', 'partner');

    const arg = tx.matching.updateMany.mock.calls[0][0];
    expect(arg.where.id.in).toEqual([MATCHING_A, MATCHING_B]);
    expect(arg.data.endedAt).toBeInstanceOf(Date);
    // 3회 거절로 이미 닫힌 매칭은 건드리지 않는다
    expect(arg.where.endedAt).toBeNull();
  });

  it('이미 완료된 코스면 아무것도 하지 않는다', async () => {
    // 두 사람이 동시에 닫으려 하면 늦은 쪽은 바뀐 행이 0이다
    const { service, tx, reward } = buildService(0);

    const result = await service.completeCourse(COURSE_ID, 'me', 'partner');

    expect(result).toBeNull();
    expect(reward.grantCompletionRewards).not.toHaveBeenCalled();
    expect(tx.matching.updateMany).not.toHaveBeenCalled();
  });
});
