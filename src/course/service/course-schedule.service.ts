// 시간이 지나면 저절로 바뀌어야 하는 것들.
//
// 코스는 여행일이 되면 "다녀오는 중"이 되고 여행일이 지나면 "완료"가 되어야 하는데,
// 아무도 버튼을 누르지 않는다. 사용자가 조회할 때 슬쩍 바꾸는 방법도 있지만,
// 그러면 아무도 안 열어 본 코스는 영영 예정 상태로 남아 관리자 화면이나 통계에서
// 어긋난다. 그래서 시계로 바꾼다.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '../../generated/prisma/enums';
import { kstToday } from '../course-date.util';
import { CourseCompletionService } from './course-completion.service';

/** 아직 안 끝난 코스. 취소된 코스는 완료로 넘기지 않는다 */
const OPEN_STATUSES = [CourseStatus.UPCOMING, CourseStatus.IN_PROGRESS];

@Injectable()
export class CourseScheduleService {
  private readonly logger = new Logger(CourseScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: CourseCompletionService,
  ) {}

  /**
   * 여행일이 된 코스를 "다녀오는 중"으로 바꾼다.
   *
   * 자정에 한 번만 돌리면 그때 서버가 내려가 있었을 때 통째로 놓친다.
   * 매시간 돌리되 "아직 예정이면서 여행일이 지난 것"을 조건으로 잡아,
   * 몇 번을 돌아도 결과가 같고 놓친 것은 다음 시간에 따라잡게 했다.
   */
  @Cron('0 * * * *', { timeZone: 'Asia/Seoul' })
  async startTodaysCourses() {
    // travelDate는 날짜만 저장되므로 UTC 자정으로 맞춰 비교한다
    const today = new Date(`${kstToday()}T00:00:00.000Z`);

    const changed = await this.prisma.course.updateMany({
      where: {
        status: CourseStatus.UPCOMING,
        travelDate: { lte: today },
      },
      data: { status: CourseStatus.IN_PROGRESS, startedAt: new Date() },
    });

    if (changed.count > 0) {
      this.logger.log(`여행일이 된 코스 ${changed.count}건을 진행중으로 바꿈`);
    }
  }

  /**
   * 여행일이 지난 코스를 완료로 바꾸고 두 사람에게 보상을 준다.
   *
   * 완료 기준이 인증샷 8장이던 때는 한 장만 빠져도 코스가 열린 채 남았다.
   * 이제는 하루가 지나면 끝난 것으로 본다.
   *
   * updateMany로 한 번에 닫지 않는 이유는 완료가 상태 변경만이 아니라서다.
   * 스탬프와 포인트를 코스마다, 두 사람 각각에게 트랜잭션 안에서 줘야 한다.
   * 한 건이 실패해도 나머지는 닫고, 실패한 건은 다음 시간에 다시 잡힌다.
   */
  @Cron('0 * * * *', { timeZone: 'Asia/Seoul' })
  async completeFinishedCourses() {
    // travelDate는 날짜만 저장되므로 UTC 자정으로 맞춰 비교한다.
    // lt(미만)이라 여행 당일은 걸리지 않는다 — 하루가 지나야 완료다.
    const today = new Date(`${kstToday()}T00:00:00.000Z`);

    const courses = await this.prisma.course.findMany({
      where: {
        status: { in: OPEN_STATUSES },
        travelDate: { lt: today },
      },
      select: {
        id: true,
        matchAttempt: {
          select: {
            matchingA: { select: { userId: true } },
            matchingB: { select: { userId: true } },
          },
        },
      },
    });

    let closed = 0;
    for (const course of courses) {
      const { matchingA, matchingB } = course.matchAttempt;

      try {
        // 보상은 안에서 두 사람 몫이 다 나간다. 반환값은 요청자 기준이라 여기선 버린다
        const completed = await this.completion.completeCourse(
          course.id,
          matchingA.userId,
          matchingB.userId,
        );
        if (completed) closed++;
      } catch (error) {
        this.logger.error(
          `코스 완료 처리에 실패했습니다. course=${course.id} — 다음 시간에 다시 시도합니다`,
          error as Error,
        );
      }
    }

    if (closed > 0) {
      this.logger.log(`여행이 끝난 코스 ${closed}건을 완료로 바꿈`);
    }
  }
}
