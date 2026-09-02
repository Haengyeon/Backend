// 첫 만남에 적절한 곳인지 판별해 주는 곳. 
import { TourSpot } from './types';

// 숙박 스파 제외
const LODGING_KEYWORDS = [
  '스파',
  '온천',
  '사우나',
  '모텔',
  '호텔',
  '펜션',
  '게스트하우스',
  '풀빌라',
];

// 매장 식사가 불가능한 곳 제외
const TAKEOUT_KEYWORDS = ['포장', '배달', '테이크아웃', '투고', '딜리버리'];

// 첫만남 가기엔 부담스러운 등산 코스 제외
const HARDCORE_KEYWORDS = ['산성', '일출봉', '등산', '탐방로', '종주', '오름'];

// 레저스포츠(LS)로 분류돼 있지만 실제로는 그냥 걷는 길 제외
const FAKE_LEISURE_KEYWORDS = [
  '길',
  '둘레길',
  '산책',
  '갈맷길',
  '올레길',
  '탐방로',
];

// 매장 식사가 전제인 정규 식사 분류
const REGULAR_MEAL_CODES = ['FD01', 'FD02', 'FD03'];

function containsAny(title: string, keywords: string[]): boolean {
  return keywords.some((keyword) => title.includes(keyword));
}

export function isFirstDateSafe(spot: TourSpot): boolean {
  if (spot.lclsSystm1 === 'AC') return false;
  if (spot.lclsSystm2 === 'EX05') return false;
  if (containsAny(spot.title, LODGING_KEYWORDS)) return false;

  if (spot.lclsSystm2 === 'NA01') return false;
  if (containsAny(spot.title, HARDCORE_KEYWORDS)) return false;

  if (
    spot.lclsSystm2 &&
    REGULAR_MEAL_CODES.includes(spot.lclsSystm2) &&
    containsAny(spot.title, TAKEOUT_KEYWORDS)
  ) {
    return false;
  }

  if (
    spot.lclsSystm1 === 'LS' &&
    containsAny(spot.title, FAKE_LEISURE_KEYWORDS)
  ) {
    return false;
  }

  return true;
}

// 첫 만남 TPO에 맞지 않는 장소를 후보 제거
export function sanitizePool(pool: TourSpot[]): TourSpot[] {
  return pool.filter(isFirstDateSafe);
}
