// 시간이 지나면 저절로 바뀌어야 하는 것들.
//
// 코스는 여행일이 되면 "다녀오는 중"이 되어야 하는데, 아무도 버튼을 누르지 않는다.
// 사용자가 조회할 때 슬쩍 바꾸는 방법도 있지만, 그러면 아무도 안 열어 본 코스는
// 영영 예정 상태로 남아 관리자 화면이나 통계에서 어긋난다. 그래서 시계로 바꾼다.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '../../generated/prisma/enums';
import { kstToday } from '../course-date.util';

@Injectable()
export class CourseScheduleService {
  private readonly logger = new Logger(CourseScheduleService.name);

  constructor(private readonly prisma: PrismaService) {}

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
}
