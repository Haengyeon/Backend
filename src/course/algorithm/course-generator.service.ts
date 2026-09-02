// course-planner.ts(알고리즘) 호출해서 코스 생성 후 DB 저장
//
// 흐름
//  1. 양쪽 결제가 끝난 매칭(CONFIRMED)
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

  // 만들기 전에 이미 있는지부터 본다.
  //
  // Course.matchAttemptId에 유니크가 걸려 있어서, 조회 없이 진행하면
  // TourAPI를 실컷 부르고 저장 단계에서야 막힌다. 그 호출이 통째로 헛수고가 된다.
  //
  // 결제 승인이 두 번 들어오는 경우를 대비한 것이라 평소엔 걸릴 일이 없다.
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
   * 매칭이 잡아 둔 theme은 "겹치는 첫 번째 테마"라 입력 순서에 따라 달라진다.
   * 그래서 공통 취미 연관도를 합산해 여기서 다시 고른다.
   *
   * 고를 수 없으면(겹치는 테마나 공통 취미가 없으면) 매칭 값을 그대로 쓴다.
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

    // 소개글은 목록 조회에 없어서 장소 4곳만 따로 받아온다.
    // 트랜잭션 밖에서 부른다 — 남의 서버를 기다리는 동안 DB 커넥션을 붙잡지 않는다.
    const overviews = await this.tourApi.fetchOverviews(
      plan.spots.map((planned) => planned.spot.contentId),
    );

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
            description: overviews.get(planned.spot.contentId) ?? null,
            sigunguCode: planned.spot.sigunguCode,
            legalSigunguCode: planned.spot.legalSigunguCode,
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
