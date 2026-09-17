// 취미별로 앞에 둘 행사 분류 (TourAPI lclsSystm3)
//
// 목록에서 빼지 않고 순서만 바꾼다. 진행 중인 행사는 하루 수십 건뿐이고
// 절반 넘게 기타축제·기타공연·기타행사라, 취미로 거르면 섹션이 빈다.
import { Hobby } from '../generated/prisma/enums';

export const HOBBY_FESTIVAL_CODES: Record<Hobby, string[]> = {
  [Hobby.ART]: ['EV030100', 'EV010200', 'EV020200', 'EV020500'], // 전시회 · 문화예술축제 · 연극 · 무용
  [Hobby.EXHIBITION]: ['EV030100', 'EV030200'], // 전시회 · 박람회
  [Hobby.HISTORY]: ['EV010400', 'EV020100'], // 전통역사축제 · 전통공연
  [Hobby.MUSIC]: ['EV020600', 'EV020700', 'EV020300', 'EV020400'], // 클래식음악회 · 대중콘서트 · 뮤지컬 · 오페라
  [Hobby.MOVIE]: ['EV020800'], // 영화
  [Hobby.SEA]: ['EV010500'], // 생태자연축제
  [Hobby.ANIMAL]: ['EV010500'], // 생태자연축제
  [Hobby.FOOD]: ['EV010300'], // 지역특산물축제
  [Hobby.COOKING]: ['EV010300'], // 지역특산물축제
  [Hobby.EXERCISE]: ['EV030300'], // 스포츠경기
  [Hobby.ACTIVITY]: ['EV030300'], // 스포츠경기
  // 맞는 분류가 없다. 날짜순 그대로 본다
  [Hobby.IT]: [],
  [Hobby.CAFE]: [],
  [Hobby.READING]: [],
  [Hobby.PHOTO]: [],
};

/** 행사 분류에 맞는 취미 수. 많이 맞을수록 앞에 둔다 */
export function hobbyMatchCount(hobbies: Hobby[], code: string | null): number {
  if (!code) return 0;

  return hobbies.filter((hobby) => HOBBY_FESTIVAL_CODES[hobby]?.includes(code))
    .length;
}
