// 코스 자동 생성 알고리즘 전체적으로 돌아가는 곳
// 순수 계산/판단/조합만 하는 함수들
import { CourseTheme, Hobby } from '../../generated/prisma/enums';
import { SPOT_COUNT, templateFor } from './course-template';
import { estimateMoveMinutes, haversineKm } from './geo';
import { buildMission } from './mission-text';
import { selectCourse } from './spot-selection';
import { ThemeSelectionResult, selectTheme } from './theme-selection';
import { CourseBuildParams, CoursePlan, PlannedSpot, TourSpot } from './types';

// 스팟별 기본 체류시간(분)
export const DEFAULT_STAY_MINUTES = 90;

export class CoursePlanningError extends Error {
  constructor(
    message: string,
    readonly code: 'NO_COMMON_THEME' | 'NOT_ENOUGH_SPOTS',
  ) {
    super(message);
    this.name = 'CoursePlanningError';
  }
}

// 테마 확정 — 취미가 쓰이는 유일한 지점.
// 교집합 1개면 바로, 2개면 취미 연관도 합산, 동점이면 enum 선언 순서

export function resolveTheme(
  themesA: CourseTheme[],
  themesB: CourseTheme[],
  commonHobbies: Hobby[],
): ThemeSelectionResult {
  const result = selectTheme(themesA, themesB, commonHobbies);

  if (!result) {
    throw new CoursePlanningError(
      '두 사람의 공통 테마가 없습니다.',
      'NO_COMMON_THEME',
    );
  }

  return result;
}

// 선정된 스팟에 순서,시간대,미션,이동거리를 붙여 완성된 코스로 만든다
// 순수 함수라 DB 나 TourAPI를 직접 부르지 않음
// 실제 서비스: course-preview.service.ts가 TourAPI 응답을 넘긴다
// 테스트: course-planner.spec.ts가 만든 가짜 스팟을 넘긴다
export function buildCoursePlan(
  params: CourseBuildParams,
  pool: TourSpot[],
): CoursePlan {
  const course = selectCourse(pool, params.theme, params.seed);

  if (!course || course.spots.length < SPOT_COUNT) {
    throw new CoursePlanningError(
      `후보가 부족해 스팟 ${SPOT_COUNT}개를 채우지 못했습니다.`,
      'NOT_ENOUGH_SPOTS',
    );
  }

  // 슬롯마다 체류시간이 다르다(카페 50분, 전시 90분). 선정 결과에는 그 값이
  // 실려 오지 않으므로 템플릿을 순서로 다시 맞춰 읽는다.
  const template = templateFor(params.theme);

  const spots: PlannedSpot[] = course.spots.map((item, index) => {
    const previous = index > 0 ? course.spots[index - 1].spot : null;
    const distanceKm = previous ? haversineKm(previous, item.spot) : null;

    return {
      order: index + 1,
      role: item.role,
      spot: item.spot,
      //각 스팟마다 미션 생성
      mission: buildMission(item.spot),
      stayMinutes: template[index]?.stayMinutes ?? DEFAULT_STAY_MINUTES,
      moveMinutesFromPrevious:
        distanceKm === null ? null : estimateMoveMinutes(distanceKm),
      distanceKmFromPrevious: distanceKm,
      relaxation: item.relaxation,
    };
  });

  const durationMinutes = spots.reduce(
    (total, spot) =>
      total + spot.stayMinutes + (spot.moveMinutesFromPrevious ?? 0),
    0,
  );

  return {
    region: params.region,
    theme: params.theme,
    spots,
    totalDistanceKm: course.totalDistanceKm,
    backtrackPenaltyKm: course.backtrackPenaltyKm,
    durationMinutes,
  };
}
