// 테마 선택용 가중치 표
// 취미 - 테마 연관도 계산해서 테마 1개로 확정 지어주는 용도
import { CourseTheme, Hobby } from '../../generated/prisma/enums';

// 테마
export const THEME_ORDER: CourseTheme[] = [
  CourseTheme.NATURE_HEALING,
  CourseTheme.HISTORY_CULTURE,
  CourseTheme.NIGHT_DATE,
  CourseTheme.PHOTO_SPOT,
  CourseTheme.LOCAL_FOOD_MARKET,
  CourseTheme.ACTIVITY,
  CourseTheme.WALKING_TRIP,
  CourseTheme.ART_SENSIBILITY,
];

// 취미
export const HOBBY_ORDER: Hobby[] = [
  Hobby.ART,
  Hobby.CAFE,
  Hobby.FOOD,
  Hobby.READING,
  Hobby.EXERCISE,
  Hobby.IT,
  Hobby.COOKING,
  Hobby.SEA,
  Hobby.MOVIE,
  Hobby.EXHIBITION,
  Hobby.PHOTO,
  Hobby.ANIMAL,
  Hobby.MUSIC,
  Hobby.ACTIVITY,
  Hobby.HISTORY,
];

// 취미 x 테마 연관도 (0~3점). 노션 표 있음.
// 자연힐링 / 역사문화 / 야경데이트 / 사진명소 / 로컬맛집 / 액티비티 / 걷기여행 / 예술감성

const AFFINITY_ROWS: Record<Hobby, number[]> = {
  [Hobby.ART]: [1, 2, 1, 2, 0, 0, 1, 3],
  [Hobby.CAFE]: [2, 1, 2, 2, 2, 0, 2, 2],
  [Hobby.FOOD]: [1, 1, 1, 1, 3, 0, 1, 0],
  [Hobby.EXERCISE]: [2, 0, 0, 1, 0, 3, 2, 0],
  [Hobby.COOKING]: [0, 1, 0, 0, 3, 0, 0, 0],
  [Hobby.SEA]: [3, 0, 2, 2, 1, 2, 1, 0],
  [Hobby.MOVIE]: [1, 1, 2, 2, 1, 0, 1, 2],
  [Hobby.EXHIBITION]: [1, 3, 0, 1, 0, 0, 0, 3],
  [Hobby.PHOTO]: [2, 1, 3, 3, 1, 1, 2, 2],
  [Hobby.ACTIVITY]: [1, 0, 1, 1, 0, 3, 2, 0],
  [Hobby.HISTORY]: [1, 3, 1, 1, 1, 0, 1, 2],

  // 매핑 제외 취미 -> 전부 0점 (되게 애매한 취미라서 그냥 0점 처리)
  [Hobby.READING]: [0, 0, 0, 0, 0, 0, 0, 0],
  [Hobby.IT]: [0, 0, 0, 0, 0, 0, 0, 0],
  [Hobby.ANIMAL]: [0, 0, 0, 0, 0, 0, 0, 0],
  [Hobby.MUSIC]: [0, 0, 0, 0, 0, 0, 0, 0],
};

// 취미-테마 연관도 점수 (0~3)
export function affinityOf(hobby: Hobby, theme: CourseTheme): number {
  const row = AFFINITY_ROWS[hobby];
  if (!row) return 0;

  const column = THEME_ORDER.indexOf(theme);
  if (column < 0) return 0;

  return row[column] ?? 0;
}

// 공통 취미 전체에 대한 특정 테마의 연관도 합
export function totalAffinity(hobbies: Hobby[], theme: CourseTheme): number {
  return hobbies.reduce((sum, hobby) => sum + affinityOf(hobby, theme), 0);
}
