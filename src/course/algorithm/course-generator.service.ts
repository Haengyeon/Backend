// course-planner.ts(알고리즘) 호출해서 코스 생성 후 DB 저장
//
// 흐름
//  1. MatchAttempt 조회 (양쪽 결제 완료 상태 가정)
//  2. TourAPI 후보 풀 수집
//  3. buildCoursePlan() 호출해 코스 생성
//  4. Course / CourseSpot / CourseMission을 트랜잭션으로 저장
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CoursePlanningError, buildCoursePlan } from './course-planner';
import { templateFor } from './course-template';
import { REGION_LABEL, THEME_DESCRIPTION, THEME_LABEL } from './labels';
import { THEME_FILTER, toPoolQueries } from './tour-category';
import { TourApiClient } from './tour-api.client';
import { CoursePlan } from './types';

@Injectable()
export class CourseGeneratorService {
  private readonly logger = new Logger(CourseGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tourApi: TourApiClient,
  ) {}

  // 양쪽 결제가 끝난 매칭(CONFIRMED)에 대해 코스를 만들어줌
  // 생성만 담당하고 courseId만 돌려준다.
  // dbd에 matchAtteptId 조회해봄. matchAtteptId가 있다면 이미 생성된 코스이므로 그대로 반환(아마 이런 일은 없을듯)
  // 만약에 결제가 승인이 잘못되어서 matchAtteptId가 2번 생길 경우을 위해 만듬
  // 조회 기능이 없다면 이미 있는 코스를 보여줘야하는데 안보여주고 tourapi에서 만들고 나중에 prisma한테 툭정 matchAtteptId와 코스가 있다 라고 막혀서 tourapi만 괜히 호출한 사람됨
  async generateForMatchAttempt(
    matchAttemptId: string,
  ): Promise<{ id: string }> {
    const existing = await this.findCourseId(matchAttemptId);
    if (existing) return existing;

    // 매칭 기능이 없어 MatchAttempt 테이블이 비어 있다.
    // region / theme / travelDate 세 값만 채워진 레코드가 있으면 아래는 그대로 돈다.
    const attempt = await this.prisma.matchAttempt.findUnique({
      where: { id: matchAttemptId },
    });
    if (!attempt) {
      throw new NotFoundException(
        `MatchAttempt를 찾을 수 없습니다: ${matchAttemptId}`,
      );
    }

    const template = templateFor(attempt.theme);
    const queries = toPoolQueries([
      ...template.map((slot) => slot.filter),
      THEME_FILTER[attempt.theme],
    ]);

    const pool = await this.tourApi.fetchPool(attempt.region, queries);
    this.logger.log(
      `후보 풀 ${pool.length}건 (region=${attempt.region}, theme=${attempt.theme}, 호출 ${queries.length}회)`,
    );

    const plan = buildCoursePlan(
      { region: attempt.region, theme: attempt.theme, seed: matchAttemptId },
      pool,
    );

    for (const spot of plan.spots) {
      if (spot.relaxation) {
        this.logger.warn(`스팟 ${spot.order} 조건 완화: ${spot.relaxation}`);
      }
    }

    try {
      return await this.persist(matchAttemptId, attempt.travelDate, plan);
    } catch (error) {
      // 동시 호출로 다른 쪽이 먼저 만든 경우 (matchAttemptId unique 위반)
      if (isUniqueViolation(error)) {
        const created = await this.findCourseId(matchAttemptId);
        if (created) return created;
      }
      throw error;
    }
  }

  private findCourseId(matchAttemptId: string) {
    return this.prisma.course.findUnique({
      where: { matchAttemptId },
      select: { id: true },
    });
  }

  //Course + CourseSpot + CourseMission 저장
  private async persist(
    matchAttemptId: string,
    travelDate: Date,
    plan: CoursePlan,
  ): Promise<{ id: string }> {
    const regionLabel = REGION_LABEL[plan.region];
    const themeLabel = THEME_LABEL[plan.theme];

    return this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          matchAttemptId,
          title: `${regionLabel} ${themeLabel} 코스`,
          description: THEME_DESCRIPTION[plan.theme],
          region: plan.region,
          theme: plan.theme,
          travelDate,
          durationMinutes: plan.durationMinutes,
          thumbnailUrl: plan.spots[0].spot.firstImage,
        },
      });

      for (const planned of plan.spots) {
        const spot = await tx.courseSpot.create({
          data: {
            courseId: course.id,
            contentId: planned.spot.contentId,
            name: planned.spot.title,
            address: planned.spot.address,
            latitude: planned.spot.latitude,
            longitude: planned.spot.longitude,
            imageUrl: planned.spot.firstImage,
            order: planned.order,
            stayMinutes: planned.stayMinutes,
            moveMinutesFromPrevious: planned.moveMinutesFromPrevious,
          },
        });

        await tx.courseMission.create({
          data: {
            courseId: course.id,
            spotId: spot.id,
            title: planned.mission.title,
            description: planned.mission.description,
            order: planned.order,
            isRequired: true,
          },
        });
      }

      return { id: course.id };
    });
  }
}

/** Prisma 유니크 제약 위반(P2002) 여부 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

export { CoursePlanningError };
