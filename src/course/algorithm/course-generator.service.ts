// course-planner.ts(알고리즘) 호출해서 코스 생성 후 DB 저장
//
// 흐름
//  1. MatchAttempt 조회 (양쪽 결제 완료 상태 가정)
//  2. TourAPI 후보 풀 수집
//  3. buildCoursePlan() 호출해 코스 생성
//  4. Course / CourseSpot / CourseMission을 트랜잭션으로 저장
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseTheme, Hobby } from '../../generated/prisma/enums';
import { intersectHobbies, selectTheme } from './theme-selection';
import { isUniqueViolation } from '../prisma-error.util';
import { CoursePlanningError, buildCoursePlan } from './course-planner';
import { templateFor } from './course-template';
import {
  REGION_LABEL,
  THEME_DESCRIPTION,
  THEME_LABEL,
  categoryLabelOf,
} from './labels';
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

    // 두 사람의 테마와 취미가 필요해 Matching과 Profile까지 함께 읽는다
    const attempt = await this.prisma.matchAttempt.findUnique({
      where: { id: matchAttemptId },
      include: {
        matchingA: { include: { user: { include: { profile: true } } } },
        matchingB: { include: { user: { include: { profile: true } } } },
      },
    });
    if (!attempt) {
      throw new NotFoundException(
        `MatchAttempt를 찾을 수 없습니다: ${matchAttemptId}`,
      );
    }

    const theme = this.decideTheme(attempt);

    const template = templateFor(theme);
    const queries = toPoolQueries([
      ...template.map((slot) => slot.filter),
      THEME_FILTER[theme],
    ]);

    const pool = await this.tourApi.fetchPool(attempt.region, queries);
    this.logger.log(
      `후보 풀 ${pool.length}건 (region=${attempt.region}, theme=${theme}, 호출 ${queries.length}회)`,
    );

    const plan = buildCoursePlan(
      { region: attempt.region, theme, seed: matchAttemptId },
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

  /**
   * 코스에 쓸 테마를 정한다. 취미가 반영되는 유일한 지점이다.
   *
   * MatchAttempt.theme은 매칭 엔진이 "겹치는 첫 번째 테마"로 잡아 둔 값이라
   * 두 사람이 테마를 입력한 순서에 따라 결과가 달라진다. 여기서 공통 취미
   * 연관도를 합산해 다시 고르고, 아래 persist에서 MatchAttempt.theme에도
   * 같은 값을 써 넣어 둘이 어긋나지 않게 한다.
   *
   * 테마가 안 겹치는데 취미만으로 성사된 매칭도 있어서, 그때는 고를 근거가
   * 없으므로 매칭이 정한 값을 그대로 쓴다.
   */
  private decideTheme(attempt: {
    theme: CourseTheme;
    matchingA: {
      themes: CourseTheme[];
      user: { profile: { hobbies: Hobby[] } | null };
    };
    matchingB: {
      themes: CourseTheme[];
      user: { profile: { hobbies: Hobby[] } | null };
    };
  }): CourseTheme {
    const commonHobbies = intersectHobbies(
      attempt.matchingA.user.profile?.hobbies ?? [],
      attempt.matchingB.user.profile?.hobbies ?? [],
    );

    const picked = selectTheme(
      attempt.matchingA.themes,
      attempt.matchingB.themes,
      commonHobbies,
    );

    if (!picked) return attempt.theme;

    if (picked.theme !== attempt.theme) {
      this.logger.log(
        `테마 재선정: ${attempt.theme} -> ${picked.theme} ` +
          `(공통취미 ${commonHobbies.join(',') || '없음'}, ` +
          `점수 ${picked.scores.map((s) => `${s.theme}:${s.score}`).join(' ')})`,
      );
    }

    return picked.theme;
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
      // 재선정된 테마를 매칭 쪽에도 반영해 둘이 어긋나지 않게 한다
      await tx.matchAttempt.update({
        where: { id: matchAttemptId },
        data: { theme: plan.theme },
      });

      const course = await tx.course.create({
        data: {
          matchAttemptId,
          title: `${regionLabel} ${themeLabel} 코스`,
          description: THEME_DESCRIPTION[plan.theme],
          region: plan.region,
          theme: plan.theme,
          travelDate,
          durationMinutes: plan.durationMinutes,
          // 표시용 값이라 소수점 한 자리로 줄여서 저장한다
          totalDistanceKm: Math.round(plan.totalDistanceKm * 10) / 10,
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
            role: planned.role,
            category: categoryLabelOf(
              planned.spot.lclsSystm1,
              planned.spot.lclsSystm2,
            ),
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

export { CoursePlanningError };
