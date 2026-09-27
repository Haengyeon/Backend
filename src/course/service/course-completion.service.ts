// 코스 완료 처리.
//
// 완료 길은 셋이고 모두 completeCourse로 모인다.
//   - 4곳 모두 두 사람의 사진과 한마디가 차면 그 자리에서 (course-photo.service.ts)
//   - 두 사람이 다 완료 버튼을 누르면 (requestCompletion)
//   - 둘 다 아니면 여행 다음 날 시계가 (course-schedule.service.ts)
// 앞의 둘은 당일에 추억영상을 보고 싶은 사람을 위한 길이다.
//
// 버튼은 한 사람만 눌러서는 끝나지 않는다. 같이 걸은 코스라 상대가 아직
// 사진을 올리는 중일 수 있다.
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '../../generated/prisma/enums';
import {
  NotificationService,
  NotificationType,
} from '../../notification/service/notification.service';
import { REGION_LABEL } from '../algorithm/labels';
import { mapCellsOfSigungu } from '../algorithm/sigungu-cells';
import { sigunguNameOf } from '../algorithm/sigungu-name';
import { daysUntil } from '../course-date.util';
import {
  CourseCompletionRequestResponseDto,
  CourseCompletionResponseDto,
} from '../dto/response/course-progress-response.dto';
import { CourseAccessService } from './course-access.service';
import {
  COURSE_COMPLETE_POINT,
  CourseRewardService,
} from './course-reward.service';

/** 미션 하나가 끝나려면 두 사람이 모두 올려야 한다 */
const PHOTOS_PER_MISSION = 2;

/** 완료 버튼을 누르려면 코스 전체에 이만큼 인증샷이 있어야 한다. 더 적으면 영상이 빈약하다 */
const MIN_PHOTOS_TO_REQUEST = 3;

@Injectable()
export class CourseCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly reward: CourseRewardService,
    private readonly notification: NotificationService,
  ) {}

  /**
   * 완료 버튼. 당일에 추억영상을 보고 싶을 때 누른다.
   *
   * 누르면 기록하고 상대에게 알린다. 상대도 이미 눌렀으면 그 자리에서 코스를 닫는다.
   */
  async requestCompletion(
    userId: string,
    courseId: string,
  ): Promise<CourseCompletionRequestResponseDto> {
    const course = await this.access.loadCourseForUser(courseId, userId);

    if (course.status === CourseStatus.COMPLETED) {
      throw new ConflictException('이미 완료된 코스입니다');
    }
    if (course.status === CourseStatus.CANCELLED) {
      throw new BadRequestException('취소된 코스는 완료할 수 없어요');
    }
    if (course.matchAttempt.isExperience) {
      throw new BadRequestException(
        '체험 코스는 [추억영상 예시 보기]로 끝나요',
      );
    }
    if (daysUntil(course.travelDate) > 0) {
      throw new BadRequestException('여행 당일부터 완료할 수 있어요');
    }

    const photoCount = await this.prisma.courseMissionPhoto.count({
      where: { mission: { courseId } },
    });
    if (photoCount < MIN_PHOTOS_TO_REQUEST) {
      throw new BadRequestException(
        `인증샷이 ${MIN_PHOTOS_TO_REQUEST}장 이상 있어야 완료할 수 있어요. 사진을 더 올려주세요`,
      );
    }

    const partnerId = this.access.resolvePartnerId(course, userId);

    // 두 번 눌러도 한 줄만 남고, 상대 알림도 처음 누를 때만 간다
    const created = await this.prisma.courseCompletionRequest.createMany({
      data: [{ courseId, userId }],
      skipDuplicates: true,
    });

    // 기록과 확인을 한 트랜잭션으로 묶지 않는다. 묶으면 둘이 동시에 눌렀을 때
    // 서로의 기록을 못 봐서 아무도 닫지 않는다
    const partnerRequested =
      (await this.prisma.courseCompletionRequest.count({
        where: { courseId, userId: partnerId },
      })) > 0;

    if (!partnerRequested) {
      if (created.count > 0) {
        void this.notification.send(
          partnerId,
          NotificationType.COURSE_COMPLETION_REQUESTED,
        );
      }
      return { completed: false, partnerRequested, completion: null };
    }

    // null이면 상대 버튼이나 마지막 한마디가 한발 먼저 닫은 것이다
    const completion = await this.completeCourse(courseId, userId, partnerId);

    return { completed: true, partnerRequested, completion };
  }

  /**
   * 코스를 완료로 바꾸고 두 사람에게 보상을 준다.
   *
   * 사진·한마디, 완료 버튼, 시계가 동시에 불러도 보상은 한 번만 나간다.
   * 이미 완료된 코스나 체험 코스면 아무것도 하지 않고 null.
   */
  async completeCourse(
    courseId: string,
    userId: string,
    partnerId: string,
  ): Promise<CourseCompletionResponseDto | null> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.course.updateMany({
        where: {
          id: courseId,
          status: { not: CourseStatus.COMPLETED },
          // 체험은 [추억영상 예시 보기]로만 끝난다. 가상 상대와의 체험에 보상이 쌓이면 안 된다
          matchAttempt: { isExperience: false },
        },
        data: { status: CourseStatus.COMPLETED, completedAt: new Date() },
      });

      if (changed.count === 0) return null;

      const completed = await tx.course.findUniqueOrThrow({
        where: { id: courseId },
        select: {
          id: true,
          status: true,
          completedAt: true,
          region: true,
          // 스탬프는 코스가 지나간 시군구마다 찍힌다. 방문 순서대로 읽는 이유는
          // 같은 지도 칸에 구가 겹칠 때 먼저 들른 쪽 이름을 남기기 위해서다.
          spots: {
            orderBy: { order: 'asc' },
            select: { sigunguCode: true, legalSigunguCode: true },
          },
          matchAttempt: {
            select: {
              id: true,
              matchingA: { select: { id: true, userId: true } },
              matchingB: { select: { id: true, userId: true } },
            },
          },
        },
      });

      // 같이 걸은 코스라 보상도 둘 다 받는다
      const mine = await this.reward.grantCompletionRewards(
        tx,
        userId,
        completed,
      );
      await this.reward.grantCompletionRewards(tx, partnerId, completed);

      // 매칭 사이클을 닫는다.
      //
      // 새 매칭은 "끝나지 않은 매칭이 있으면" 막힌다(endedAt: null 검사).
      // 여기서 닫아야 홈의 "다시 매칭하기"가 눌리는 상태가 된다.
      // 안 닫으면 여행을 잘 다녀오고도 다음 매칭을 영영 못 한다.
      // (버튼을 눌렀는지 알아채는 쪽은 course-query.service의 getCurrent다)
      //
      // 재매칭은 완료와 같이 열린다. 당일에 닫힌 커플(사진·한마디, 완료 버튼)도 바로 다시 매칭한다.
      // 후기를 조건으로 걸면 안 쓴 사람이 영영 갇힌다.
      //
      // 이미 닫힌 매칭(3회 거절로 EXHAUSTED된 경우)은 건드리지 않는다.
      await tx.matching.updateMany({
        where: {
          id: {
            in: [
              completed.matchAttempt.matchingA.id,
              completed.matchAttempt.matchingB.id,
            ],
          },
          endedAt: null,
        },
        data: { endedAt: new Date() },
      });

      // 추억영상은 video.scheduler가 COMPLETED 코스를 매분 집어가 만든다.
      // 어느 길로 닫혔든 여기만 지나면 되고, 응답은 영상을 기다리지 않는다.

      return {
        id: completed.id,
        status: completed.status,
        completedAt: completed.completedAt,
        earnedStamps: mine.stamps.map((stamp) => ({
          region: stamp.region,
          regionLabel: REGION_LABEL[stamp.region],
          sigunguName: sigunguNameOf(stamp.region, stamp.sigunguCode),
          // 수원시처럼 지도가 구별로 나눠 그린 곳은 여러 칸이 한꺼번에 나온다
          mapSigunguCodes: mapCellsOfSigungu(stamp.region, stamp.sigunguCode),
          earnedAt: stamp.earnedAt,
        })),
        earnedPoints: COURSE_COMPLETE_POINT,
        pointsAfter: mine.pointsAfter,
      };
    });
  }

  /**
   * 미션별 인증샷 수를 세어 진행 상황을 만든다.
   *
   * 화면의 "4곳 중 2곳" 진행률이다. 인증샷 서비스가 사진·한마디가 바뀔 때마다
   * 불러 응답에 싣고, allRequiredCommented면 당일에 코스를 닫는다.
   */
  async missionProgress(courseId: string) {
    const rows = await this.prisma.courseMission.findMany({
      where: { courseId },
      select: {
        id: true,
        isRequired: true,
        // 미션당 많아야 두 장이라 세지 않고 한마디째로 읽는다
        photos: { select: { comment: true } },
      },
    });

    const missions = rows.map((mission) => ({
      id: mission.id,
      isRequired: mission.isRequired,
      photoCount: mission.photos.length,
      commentCount: mission.photos.filter((photo) => photo.comment?.trim())
        .length,
    }));

    const isDone = (m: { photoCount: number }) =>
      m.photoCount >= PHOTOS_PER_MISSION;
    // 사진마다 한마디까지. 당일 자동 완료는 이게 다 차야 한다
    const isCommented = (m: { commentCount: number }) =>
      m.commentCount >= PHOTOS_PER_MISSION;
    const required = missions.filter((m) => m.isRequired);

    return {
      missions,
      completedCount: missions.filter(isDone).length,
      allRequiredDone: required.every((m) => isDone(m)),
      allRequiredCommented: required.every((m) => isCommented(m)),
      photosPerMission: PHOTOS_PER_MISSION,
    };
  }
}
