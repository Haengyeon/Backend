// 코스 완료 처리.
//
// 완료는 버튼이 아니라 조건이다. 필수 미션이 다 차는 순간(= 마지막 인증샷이
// 올라오는 순간) 인증샷 서비스가 이 서비스를 불러 코스를 닫는다.
// 완료를 별도 API로 두면 먼저 누른 사람만 보상을 받게 되어 그렇게 하지 않았다.
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '../../generated/prisma/enums';
import { CourseCompletionResponseDto } from '../dto/response/course-progress-response.dto';
import { CourseAccessService } from './course-access.service';
import {
  COURSE_COMPLETE_POINT,
  CourseRewardService,
} from './course-reward.service';

/** 미션 하나가 끝나려면 두 사람이 모두 올려야 한다 */
const PHOTOS_PER_MISSION = 2;

@Injectable()
export class CourseCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly reward: CourseRewardService,
  ) {}

  /**
   * 수동 완료 처리.
   *
   * 보통은 마지막 인증샷이 올라올 때 자동으로 끝나므로 이 API를 부를 일이
   * 없다. 자동 처리가 실패해 코스가 열린 채 남았을 때를 위한 뒷문이다.
   */
  async complete(
    userId: string,
    courseId: string,
  ): Promise<CourseCompletionResponseDto> {
    const course = await this.access.loadCourseForUser(courseId, userId);

    if (course.status === CourseStatus.COMPLETED) {
      throw new ConflictException('이미 완료된 코스입니다');
    }
    if (course.status === CourseStatus.CANCELLED) {
      throw new BadRequestException('취소된 코스는 완료할 수 없어요');
    }

    const progress = await this.missionProgress(courseId);
    if (!progress.allRequiredDone) {
      throw new BadRequestException(
        '필수 미션을 모두 완료해야 코스를 마칠 수 있어요',
      );
    }

    const completed = await this.completeCourse(
      courseId,
      userId,
      this.access.resolvePartnerId(course, userId),
    );

    // 위에서 상태를 확인한 뒤 여기 오기까지 상대가 끝냈을 수 있다
    if (!completed) {
      throw new ConflictException('이미 완료된 코스입니다');
    }

    return completed;
  }

  /**
   * 코스를 닫고 두 사람에게 보상을 준다.
   *
   * 마지막 인증샷이 올라올 때 자동으로 불린다. 두 사람이 동시에 올리면
   * 완료 처리가 두 번 돌 수 있어, 상태를 조건부로 바꾸고 바뀐 행이 없으면
   * 이미 끝난 것으로 보고 물러난다. 먼저 통과한 쪽이 두 사람 몫을 모두
   * 지급하므로 물러나도 보상이 새지 않는다.
   *
   * @returns 요청자 기준 완료 결과. 이미 완료돼 있었으면 null
   */
  async completeCourse(
    courseId: string,
    userId: string,
    partnerId: string,
  ): Promise<CourseCompletionResponseDto | null> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.course.updateMany({
        where: { id: courseId, status: { not: CourseStatus.COMPLETED } },
        data: { status: CourseStatus.COMPLETED, completedAt: new Date() },
      });

      if (changed.count === 0) return null;

      const completed = await tx.course.findUniqueOrThrow({
        where: { id: courseId },
        select: { id: true, status: true, completedAt: true, region: true },
      });

      // 같이 걸은 코스라 보상도 둘 다 받는다
      const mine = await this.reward.grantCompletionRewards(
        tx,
        userId,
        completed,
      );
      await this.reward.grantCompletionRewards(tx, partnerId, completed);

      // AI 추억영상이 붙으면 여기서 CourseVideo를 PENDING으로 만들고
      // 큐에 작업을 넣는다. 만드는 건 워커가 분 단위로 하므로 응답을
      // 붙잡지 않는다. 자동 완료든 수동 완료든 이 함수를 타서 한 곳만 고치면 된다.

      return {
        id: completed.id,
        status: completed.status,
        completedAt: completed.completedAt,
        earnedStamp: mine.stamp,
        earnedPoint: COURSE_COMPLETE_POINT,
        balanceAfter: mine.balanceAfter,
      };
    });
  }

  /**
   * 미션별 인증샷 수를 세어 진행 상황을 만든다.
   * 완료 판정 기준이라 인증샷 서비스도 이걸 받아 응답에 싣는다.
   */
  async missionProgress(courseId: string) {
    const rows = await this.prisma.courseMission.findMany({
      where: { courseId },
      select: {
        id: true,
        isRequired: true,
        _count: { select: { photos: true } },
      },
    });

    const missions = rows.map((mission) => ({
      id: mission.id,
      isRequired: mission.isRequired,
      photoCount: mission._count.photos,
    }));

    const isDone = (m: { photoCount: number }) =>
      m.photoCount >= PHOTOS_PER_MISSION;

    return {
      missions,
      completedCount: missions.filter(isDone).length,
      allRequiredDone: missions
        .filter((m) => m.isRequired)
        .every((m) => isDone(m)),
      photosPerMission: PHOTOS_PER_MISSION,
    };
  }
}
