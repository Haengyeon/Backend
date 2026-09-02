// 취미 점수 합산해서 테마 1개 확정 지는 곳
// 두 사람의 공통 테마 중 하나를 확정한다 (STEP 1)
// 취미가 쓰이는 유일한 곳 — 교집합이 2개 이상일 때 어느 쪽을 고를지 정하는 데만 쓴다
// 결과가 A/B 순서에 흔들리면 안 되므로 교집합은 입력 배열이 아니라
// THEME_ORDER / HOBBY_ORDER 순으로 정규화해서 반환한다
// 연관도 점수는 affinity.ts
import { CourseTheme, Hobby } from '../../generated/prisma/enums';
import { HOBBY_ORDER, THEME_ORDER, totalAffinity } from './affinity';

export interface ThemeSelectionResult {
  theme: CourseTheme;
  // 교집합 테마별 합산 점수. 어떤 근거로 그 테마가 뽑혔는지 보여주려고 함께 반환한다.
  // 프리뷰 응답의 themeScores로만 나가고, 알고리즘 내부에서는 쓰지 않는다.
  scores: { theme: CourseTheme; score: number }[];
}

/** 공통 테마. A/B를 바꿔 넣어도 같아야 하므로 입력 순서가 아닌 THEME_ORDER를 따른다. */
export function intersectThemes(
  themesA: CourseTheme[],
  themesB: CourseTheme[],
): CourseTheme[] {
  const setB = new Set(themesB);
  return THEME_ORDER.filter(
    (theme) => themesA.includes(theme) && setB.has(theme),
  );
}

// 테마 1개 확정
export function selectTheme(
  themesA: CourseTheme[],
  themesB: CourseTheme[],
  commonHobbies: Hobby[],
): ThemeSelectionResult | null {
  const candidates = intersectThemes(themesA, themesB);

  // [교집합 없음] null 반환 -> 호출부 resolveTheme()이 NO_COMMON_THEME 에러로 바꾼다.
  // 매칭이 성사됐다면 공통 테마는 반드시 있으므로, 여기 걸리면 잘못된 입력이거나 매칭 버그다.
  if (candidates.length === 0) return null;

  // 테마별로 공통 취미 연관도를 합산 (점수 계산은 affinity.ts)
  const scores = candidates.map((theme) => ({
    theme,
    score: totalAffinity(commonHobbies, theme),
  }));

  // [교집합 1개] 점수와 무관하게 바로 확정
  if (candidates.length === 1) {
    return { theme: candidates[0], scores };
  }

  // [교집합 2개 이상] 점수가 높은 테마를 고른다.
  // [동점] scores가 THEME_ORDER 순이라 '>'(초과)로 비교하면 앞선 테마가 그대로 남는다.
  //        '>='로 바꾸면 뒤에 오는 테마가 이겨서 동점 규칙이 깨진다.
  let best = scores[0];
  for (const current of scores) {
    if (current.score > best.score) best = current;
  }

  return { theme: best.theme, scores };
}

// 공통 취미. 결과 순서는 HOBBY_ORDER를 따름
export function intersectHobbies(
  hobbiesA: Hobby[],
  hobbiesB: Hobby[],
): Hobby[] {
  const setB = new Set(hobbiesB);
  return HOBBY_ORDER.filter(
    (hobby) => hobbiesA.includes(hobby) && setB.has(hobby),
  );
}
