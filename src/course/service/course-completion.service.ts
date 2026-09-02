// 코스 완료 처리.
//
// 완료는 버튼이 아니라 조건이다. 기준은 시간 — 여행일이 지나면 끝난 것으로 본다.
// 실제로 코스를 닫는 것은 course-schedule.service.ts의 시계다.
//
// 원래는 인증샷 8장(4곳 x 두 사람)이 다 차야 완료였는데, 한 사람만 올리거나
// 한 곳을 건너뛰면 다녀오고도 코스가 영영 열린 채 남았다. 사진은 추억이지
// 완료 조건이 아니라서 기준을 날짜로 바꿨다.
//
// 완료를 사용자가 누르는 API로 두지 않는 이유는 그대로다. 두 사람이 같이 걸은
// 코스인데 먼저 누른 쪽만 보상을 받게 된다.
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '../../generated/prisma/enums';
import { REGION_LABEL } from '../algorithm/labels';
import { lumpedCellNameOf } from '../algorithm/sigungu-map-code';
import { sigunguNameOf } from '../algorithm/sigungu-name';
import { daysUntil } from '../course-date.util';
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
   * 보통은 여행 다음 날 시계가 알아서 닫으므로 이 API를 부를 일이 없다.
   * 그 시각에 서버가 내려가 있었거나 처리가 실패해 코스가 열린 채
   * 남았을 때를 위한 뒷문이다. 조건은 시계와 같다 — 여행일이 지나야 한다.
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

    // 0이면 당일, 음수면 이미 지난 날짜
    if (daysUntil(course.travelDate) >= 0) {
      throw new BadRequestException('여행 다음 날부터 코스가 완료 처리돼요');
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
   * 여행 다음 날 시계가 부르고, 뒷문 API도 같은 길로 온다. 시계가 도는 중에
   * 사용자가 뒷문을 누르면 완료 처리가 두 번 돌 수 있어, 상태를 조건부로 바꾸고
   * 바뀐 행이 없으면 이미 끝난 것으로 보고 물러난다. 먼저 통과한 쪽이 두 사람
   * 몫을 모두 지급하므로 물러나도 보상이 새지 않는다.
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
      // 여기서 닫지 않으면 여행을 잘 다녀오고도 다음 매칭을 영영 못 한다.
      // 홈의 "다시 매칭하기" 버튼이 눌리는 지점이 여기다.
      //
      // 완료가 시간으로 걸리는 이상 재매칭도 시간으로 열리는 게 맞다.
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

      // AI 추억영상이 붙으면 여기서 CourseVideo를 PENDING으로 만들고
      // 큐에 작업을 넣는다. 만드는 건 워커가 분 단위로 하므로 응답을
      // 붙잡지 않는다. 자동 완료든 수동 완료든 이 함수를 타서 한 곳만 고치면 된다.

      return {
        id: completed.id,
        status: completed.status,
        completedAt: completed.completedAt,
        earnedStamps: mine.stamps.map((stamp) => ({
          region: stamp.region,
          regionLabel: REGION_LABEL[stamp.region],
          // 지도가 구를 안 나눠 그린 칸은 칸 이름으로. 목록과 지도가 어긋나지 않게 한다
          sigunguName:
            lumpedCellNameOf(stamp.mapSigunguCode) ??
            sigunguNameOf(stamp.region, stamp.sigunguCode),
          mapSigunguCode: stamp.mapSigunguCode,
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
   * 완료 판정에는 더 이상 쓰지 않는다. 화면에 "4곳 중 2곳"을 보여주기 위한
   * 진행률이고, 인증샷 서비스가 이걸 받아 업로드 응답에 싣는다.
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
