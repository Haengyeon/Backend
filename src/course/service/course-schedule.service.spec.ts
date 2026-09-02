// 코스 상태를 시간으로 넘기는 시계.
//   여행일이 되면   -> 다녀오는 중
//   여행일이 지나면 -> 완료 (+ 두 사람 보상)
//
// 몇 번을 돌려도 결과가 같아야 한다. 자정에 서버가 내려가 있었으면
// 다음 시간에 따라잡아야 하고, 이미 바꾼 코스를 또 건드리면 안 된다.
import { CourseScheduleService } from './course-schedule.service';
import { CourseCompletionService } from './course-completion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '../../generated/prisma/enums';

/** 오늘 날짜(KST)를 UTC 자정으로 맞춘 문자열 */
const kstToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const courseRow = (id: string) => ({
  id,
  matchAttempt: {
    matchingA: { userId: `${id}-a` },
    matchingB: { userId: `${id}-b` },
  },
});

function buildService(options: { count?: number; finished?: string[] } = {}) {
  const updateMany = jest.fn().mockResolvedValue({ count: options.count ?? 0 });
  const findMany = jest
    .fn()
    .mockResolvedValue((options.finished ?? []).map(courseRow));

  const prisma = {
    course: { updateMany, findMany },
  } as unknown as PrismaService;

  const completeCourse = jest.fn().mockResolvedValue({ id: 'done' });
  const completion = { completeCourse } as unknown as CourseCompletionService;

  return {
    service: new CourseScheduleService(prisma, completion),
    updateMany,
    findMany,
    completeCourse,
  };
}

describe('startTodaysCourses — 여행일이 오면 진행중으로', () => {
  it('여행일이 오늘이거나 지난 "예정" 코스만 진행중으로 바꾼다', async () => {
    const { service, updateMany } = buildService({ count: 2 });

    await service.startTodaysCourses();

    const arg = updateMany.mock.calls[0][0];
    expect(arg.where.status).toBe(CourseStatus.UPCOMING);
    expect(arg.data.status).toBe(CourseStatus.IN_PROGRESS);
    expect(arg.data.startedAt).toBeInstanceOf(Date);
    // 아직 안 온 여행일은 건드리지 않는다
    expect(arg.where.travelDate).toHaveProperty('lte');
  });

  it('기준 날짜는 서버 시간대가 아니라 한국 날짜다', async () => {
    const { service, updateMany } = buildService();

    await service.startTodaysCourses();

    const { lte } = updateMany.mock.calls[0][0].where.travelDate as {
      lte: Date;
    };
    // travelDate는 날짜만 저장되므로 UTC 자정으로 맞춰 비교해야 어긋나지 않는다
    expect(lte.toISOString()).toMatch(/T00:00:00\.000Z$/);
    expect(lte.toISOString().slice(0, 10)).toBe(kstToday());
  });

  it('바꿀 코스가 없으면 조용히 지나간다', async () => {
    const { service, updateMany } = buildService({ count: 0 });

    await expect(service.startTodaysCourses()).resolves.not.toThrow();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('completeFinishedCourses — 하루가 지나면 완료', () => {
  it('여행 당일은 두고 지난 코스만 잡는다', async () => {
    const { service, findMany } = buildService();

    await service.completeFinishedCourses();

    const { where } = findMany.mock.calls[0][0];
    // lte였다면 여행 당일 코스까지 끝내 버린다
    const { lt } = where.travelDate as { lt: Date };
    expect(lt.toISOString()).toMatch(/T00:00:00\.000Z$/);
    expect(lt.toISOString().slice(0, 10)).toBe(kstToday());
  });

  it('아직 안 끝난 코스만 본다. 취소·완료된 코스는 건드리지 않는다', async () => {
    const { service, findMany } = buildService();

    await service.completeFinishedCourses();

    const { where } = findMany.mock.calls[0][0];
    expect(where.status.in).toEqual([
      CourseStatus.UPCOMING,
      CourseStatus.IN_PROGRESS,
    ]);
  });

  it('코스마다 두 사람 몫으로 완료 처리를 부른다', async () => {
    const { service, completeCourse } = buildService({
      finished: ['course-1', 'course-2'],
    });

    await service.completeFinishedCourses();

    expect(completeCourse).toHaveBeenCalledTimes(2);
    expect(completeCourse).toHaveBeenCalledWith(
      'course-1',
      'course-1-a',
      'course-1-b',
    );
    expect(completeCourse).toHaveBeenCalledWith(
      'course-2',
      'course-2-a',
      'course-2-b',
    );
  });

  it('한 건이 터져도 나머지는 닫는다', async () => {
    const { service, completeCourse } = buildService({
      finished: ['course-1', 'course-2'],
    });
    completeCourse
      .mockRejectedValueOnce(new Error('DB 연결 끊김'))
      .mockResolvedValueOnce({ id: 'course-2' });

    await expect(service.completeFinishedCourses()).resolves.not.toThrow();

    expect(completeCourse).toHaveBeenCalledTimes(2);
  });

  it('닫을 코스가 없으면 완료 처리를 부르지 않는다', async () => {
    const { service, completeCourse } = buildService();

    await service.completeFinishedCourses();

    expect(completeCourse).not.toHaveBeenCalled();
  });
});
