// course-planner.ts(알고리즘) 호출해서 코스 생성 후 DB 저장
//
// 흐름
//  1. 양쪽 결제가 끝난 매칭(CONFIRMED)
//  2. TourAPI 후보 풀 수집
//  3. buildCoursePlan() 호출해 코스 생성
//  4. Course / CourseSpot / CourseMission을 트랜잭션으로 저장
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseTheme, Hobby, Region } from '../../generated/prisma/enums';
import { intersectHobbies, selectTheme } from './theme-selection';
import { isUniqueViolation } from '../../common/prisma-error.util';
import { CoursePlanningError, buildCoursePlan } from './course-planner';
import { templateFor } from './course-template';
import {
  REGION_LABEL,
  THEME_DESCRIPTION,
  THEME_LABEL,
  categoryLabelOf,
} from './labels';
import { THEME_FILTER, toPoolQueries } from './tour-category';
import { SpotDescriptionService } from '../service/spot-description.service';
import { TourApiClient } from './tour-api.client';
import { CoursePlan, TourSpot } from './types';

/** 결제 전 판정 결과 */
export interface CoursePreflight {
  /** 어떤 테마로도 코스를 못 만들면 false. 결제로 넘기면 안 된다 */
  ok: boolean;
  /** 실제로 쓸 테마. 원래 테마가 안 되면 대체된 것이 들어온다 */
  theme: CourseTheme;
  /** 이동 시간이 하루 코스 예산 안에 드는지. false여도 결제는 막지 않는다 */
  withinMoveBudget: boolean;
}

/**
 * 지역·테마별 후보 풀을 들고 있는 시간.
 *
 * 관광지 목록은 하루에도 거의 안 바뀐다. 홈 추천 쪽과 같은 이유로 하루를 통째로 쓴다.
 */
const POOL_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CourseGeneratorService {
  private readonly logger = new Logger(CourseGeneratorService.name);

  /**
   * 지역·테마별 후보 풀.
   *
   * 매칭 한 건이 같은 풀을 최소 두 번 받는다 — 결제 전 사전 판정에서 한 번,
   * 결제 후 실제 생성에서 또 한 번. 사전 판정이 테마를 여러 개 시도하면 그만큼 는다.
   * 같은 시군구·테마로 성사된 다른 커플도 결국 같은 목록을 받는다.
   *
   * 키에 시군구가 들어가는 건 코드가 시·도 안에서만 유일하기 때문이다.
   * 서울 1번과 부산 1번은 다른 구라 지역을 빼면 엉뚱한 풀을 쓰게 된다.
   */
  private readonly pools = new Map<
    string,
    { spots: TourSpot[]; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tourApi: TourApiClient,
    private readonly spotDescriptions: SpotDescriptionService,
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

    const plan = await this.planCourse(
      attempt.region,
      attempt.sigunguCode,
      theme,
      matchAttemptId,
    );

    for (const spot of plan.spots) {
      if (spot.relaxation) {
        this.logger.warn(`스팟 ${spot.order} 조건 완화: ${spot.relaxation}`);
      }
    }

    try {
      return await this.persist(
        matchAttemptId,
        attempt.travelDate,
        attempt.sigunguCode,
        plan,
      );
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
   * 후보를 받아 코스 한 벌을 짠다. 저장은 하지 않는다.
   *
   * 실제 생성과 결제 전 판정이 같은 경로를 타야 한다. 판정에서 통과한 조합이
   * 생성에서 실패하면 결제만 끝나고 코스가 없는 상태가 되기 때문이다.
   */
  private async planCourse(
    region: Region,
    sigunguCode: string | null,
    theme: CourseTheme,
    seed: string,
  ): Promise<CoursePlan> {
    const template = templateFor(theme);
    const queries = toPoolQueries([
      ...template.map((slot) => slot.filter),
      THEME_FILTER[theme],
    ]);

    // 매칭이 시군구 단위로 성사됐으므로 후보도 그 범위로 좁힌다
    const key = `${region}|${sigunguCode ?? ''}|${theme}`;
    const cached = this.pools.get(key);

    let pool: TourSpot[];
    if (cached && cached.expiresAt > Date.now()) {
      pool = cached.spots;
    } else {
      pool = await this.tourApi.fetchPool(region, queries, sigunguCode);
      this.pools.set(key, { spots: pool, expiresAt: Date.now() + POOL_TTL_MS });

      this.logger.log(
        `후보 풀 ${pool.length}건 (region=${region}/${sigunguCode}, theme=${theme}, 호출 ${queries.length}회)`,
      );
    }

    return buildCoursePlan({ region, theme, seed }, pool);
  }

  /**
   * 결제로 넘기기 전에 코스를 만들 수 있는지 미리 본다.
   *
   * 코스는 양쪽 결제가 끝난 뒤에 만들어진다. 거기서 후보가 모자라면
   * 돈은 냈는데 코스가 없는 상태가 된다. 실측으로 부산 북구(로컬맛집·액티비티),
   * 서울 금천구(걷기여행)가 그렇게 실패한다.
   *
   * 테마를 바꾸면 되는 경우가 있어 후보 테마를 순서대로 시도한다. 첫 테마가
   * 통과하면 거기서 멈춘다 — 응답을 붙잡고 TourAPI를 부르는 중이라 호출을 아껴야 한다.
   *
   * 이동 시간이 예산을 넘는 것은 막지 않는다. 코스가 나오기는 하므로 결제가 깨지지
   * 않고, 넓은 군을 통째로 매칭 불가로 만드는 것은 기획이 정할 일이다.
   * 대신 예산 안에 드는 테마가 있으면 그쪽을 고른다.
   */
  async preflight(
    region: Region,
    sigunguCode: string | null,
    themes: CourseTheme[],
  ): Promise<CoursePreflight> {
    let fallback: CoursePreflight | null = null;

    for (const theme of themes) {
      let plan: CoursePlan;
      try {
        plan = await this.planCourse(region, sigunguCode, theme, 'preflight');
      } catch (error) {
        if (error instanceof CoursePlanningError) {
          this.logger.warn(
            `사전 판정 실패 (region=${region}/${sigunguCode}, theme=${theme}): ${error.code}`,
          );
          continue;
        }
        // TourAPI 장애 같은 일시적 오류로 매칭을 막지 않는다.
        // 여기서 막으면 외부 서비스가 흔들릴 때 매칭이 통째로 멈춘다
        this.logger.error('사전 판정 중 오류', error as Error);
        return { ok: true, theme, withinMoveBudget: true };
      }

      const result: CoursePreflight = {
        ok: true,
        theme,
        withinMoveBudget: plan.withinMoveBudget,
      };

      if (plan.withinMoveBudget) return result;

      // 예산을 넘겼어도 코스는 나온다. 더 나은 테마가 없으면 이걸 쓴다
      fallback ??= result;
    }

    return fallback ?? { ok: false, theme: themes[0], withinMoveBudget: false };
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
    sigunguCode: string,
    plan: CoursePlan,
  ): Promise<{ id: string }> {
    const regionLabel = REGION_LABEL[plan.region];
    const themeLabel = THEME_LABEL[plan.theme];

    // 소개글은 목록 조회에 없어서 장소 4곳만 따로 받아온다.
    // 트랜잭션 밖에서 부른다 — 남의 서버를 기다리는 동안 DB 커넥션을 붙잡지 않는다.
    //
    // 홈 추천과 같은 캐시를 본다. 추천에 한 번 나온 장소면 여기서는 안 부른다.
    const overviews = await this.spotDescriptions.overviewsOf(
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
          sigunguCode,
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
