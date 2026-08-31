// 여행일이 된 코스를 "다녀오는 중"으로 바꾸는 시계.
//
// 몇 번을 돌려도 결과가 같아야 한다. 자정에 서버가 내려가 있었으면
// 다음 시간에 따라잡아야 하고, 이미 바꾼 코스를 또 건드리면 안 된다.
import { CourseScheduleService } from './course-schedule.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '../../generated/prisma/enums';

function buildService(count = 0) {
  const updateMany = jest.fn().mockResolvedValue({ count });
  const prisma = { course: { updateMany } } as unknown as PrismaService;
  return { service: new CourseScheduleService(prisma), updateMany };
}

describe('CourseScheduleService', () => {
  it('여행일이 오늘이거나 지난 "예정" 코스만 진행중으로 바꾼다', async () => {
    const { service, updateMany } = buildService(2);

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

    const kstDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    expect(lte.toISOString().slice(0, 10)).toBe(kstDate);
  });

  it('바꿀 코스가 없으면 조용히 지나간다', async () => {
    const { service, updateMany } = buildService(0);

    await expect(service.startTodaysCourses()).resolves.not.toThrow();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
