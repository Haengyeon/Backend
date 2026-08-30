// 코스 공개 범위는 "오늘이 여행일로부터 며칠 전인가"로 갈린다.
// 서버가 어느 시간대에 떠 있든 사용자 기준(KST)으로 같은 날짜가 나와야 해서
// 로컬 시간이 아니라 Asia/Seoul로 고정해 계산한다.

/** 코스 공개 범위 */
export type CourseViewType = 'LOCKED' | 'PREVIEW' | 'FULL';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 지금이 KST로 며칠인지. 'YYYY-MM-DD' */
export function kstToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  // en-CA는 'YYYY-MM-DD'로 나온다
  return parts;
}

/**
 * travelDate는 @db.Date라 UTC 자정으로 들어온다.
 * 시간 성분을 빼고 날짜만 본다.
 */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 여행일까지 남은 일수. 0이면 당일, 음수면 이미 지난 날짜 */
export function daysUntil(travelDate: Date, now: Date = new Date()): number {
  const target = Date.parse(`${toDateString(travelDate)}T00:00:00Z`);
  const today = Date.parse(`${kstToday(now)}T00:00:00Z`);

  return Math.round((target - today) / MS_PER_DAY);
}

/**
 * D-2 이전은 지역·테마만, D-1은 예고까지, 당일부터 전체를 연다.
 * 기획서의 "D-1 이전에는 테마 외 상세 코스 정보 비공개"를 그대로 옮긴 것이다.
 */
export function viewTypeOf(dday: number): CourseViewType {
  if (dday >= 2) return 'LOCKED';
  if (dday === 1) return 'PREVIEW';
  return 'FULL';
}
