// 정해진 테마로 TourAPI에서 뭘 긁어올지
// 분류코드 필터
import { CourseTheme, Region } from '../../generated/prisma/enums';
import { CategoryGroup, SpotFilter, TourSpot } from './types';

/** 관광타입: 관광지 */
export const CONTENT_TYPE_TOURIST_SPOT = '12';

/**
 * Region -> TourAPI areaCode.
 * KorService2 areaCode2 기준.
 */
export const AREA_CODE: Record<Region, string> = {
  [Region.SEOUL]: '1',
  [Region.INCHEON]: '2',
  [Region.DAEJEON]: '3',
  [Region.DAEGU]: '4',
  [Region.GWANGJU]: '5',
  [Region.BUSAN]: '6',
  [Region.ULSAN]: '7',
  [Region.SEJONG]: '8',
  [Region.GYEONGGI]: '31',
  [Region.GANGWON]: '32',
  [Region.CHUNGBUK]: '33',
  [Region.CHUNGNAM]: '34',
  [Region.GYEONGBUK]: '35',
  [Region.GYEONGNAM]: '36',
  [Region.JEONBUK]: '37',
  [Region.JEONNAM]: '38',
  [Region.JEJU]: '39',
};

// ─── 관광 API 분류코드 요약 (lclsSystm1 / lclsSystm2) ───────────────
//  NA 자연관광   NA01 산 · NA02 하천·해양 · NA03 자연생태 · NA04 자연공원 · NA05 기타
//  HS 역사관광   HS01 역사유적지 · HS02 역사유물 · HS03 종교성지 · HS04 안보관광지
//  VE 문화관광   VE01 랜드마크 · VE03 도시공원 · VE04 도시·지역문화 · VE05 복합관광시설
//               VE06 공연시설 · VE07 전시시설 · VE10 레저스포츠시설 · VE12 기타
//  FD 음식       FD01 한식 · FD02 외국식 · FD03 간이음식 · FD04 주점 · FD05 카페·찻집
//  LS 레저스포츠 LS01 육상 · LS02 수상 · LS03 항공 · LS04 복합
//  EX 체험관광   EX01 전통체험 · EX02 공예체험 · EX03 농산어촌 · EX05 웰니스 · EX07 기타
//  SH 쇼핑       SH06 시장
//  contentTypeId=12 는 '관광지' 타입 전체
//
// 분류체계에 없어 구현하지 못한 것: 한옥 찻집 / 대형·로컬 카페 / 양식·일식 구분

// 정규 식사
// FD01 한식 · FD02 외국식 · FD03 간이음식
// (FD04 주점, FD05 카페는 제외)

export const THEME_FILTER: Record<CourseTheme, SpotFilter> = {
  // 바다, 호수, 공원, 수목원.
  // 실데이터상 공원 상당수가 NA05(기타자연관광)로 분류돼 있어 함께 포함한다.
  // NA01(산)·EX05(웰니스/스파)는 첫 만남 TPO 부적합으로 제외 (first-date-policy와 일치).
  [CourseTheme.NATURE_HEALING]: {
    categories: [
      { lclsSystm1: 'NA', lclsSystm2: ['NA02', 'NA03', 'NA04', 'NA05'] },
    ],
  },

  // 고궁, 유적지, 박물관, 전통문화
  [CourseTheme.HISTORY_CULTURE]: {
    categories: [{ lclsSystm1: 'HS', lclsSystm2: ['HS01', 'HS02', 'HS03'] }],
  },

  // 전망대, 야경명소, 밤산책
  // 분류체계에 '야경'이 없어서 랜드마크 + 복합관광시설로 잡는다.
  [CourseTheme.NIGHT_DATE]: {
    categories: [{ lclsSystm1: 'VE', lclsSystm2: ['VE01', 'VE05'] }],
  },

  // 포토스팟, 뷰 좋은 장소 - 분류 없이 관광지 전체
  [CourseTheme.PHOTO_SPOT]: {
    contentTypeId: CONTENT_TYPE_TOURIST_SPOT,
  },

  // 시장, 먹거리, 오래된 맛집
  [CourseTheme.LOCAL_FOOD_MARKET]: {
    categories: [{ lclsSystm1: 'FD', lclsSystm2: ['FD01', 'FD02', 'FD03'] }],
  },

  // 레저, 체험, 스포츠
  // LS만으로는 후보가 너무 적어(서울 37건) 레저스포츠시설(VE10)을 함께 본다.
  [CourseTheme.ACTIVITY]: {
    categories: [
      { lclsSystm1: 'LS', lclsSystm2: ['LS01', 'LS02', 'LS03', 'LS04'] },
      { lclsSystm1: 'VE', lclsSystm2: ['VE10'] },
    ],
  },

  // 골목길, 둘레길, 산책로
  // NA04(자연공원)만 쓰면 서울 기준 13건뿐이라 코스가 성립하지 않는다.
  // 도시공원(VE03, 98건)과 기타자연관광(NA05)을 포함해야 실제로 걸을 곳이 나온다.
  [CourseTheme.WALKING_TRIP]: {
    categories: [
      { lclsSystm1: 'NA', lclsSystm2: ['NA04', 'NA05'] },
      { lclsSystm1: 'VE', lclsSystm2: ['VE03'] },
    ],
  },

  // 전시, 미술관, 공방
  [CourseTheme.ART_SENSIBILITY]: {
    categories: [{ lclsSystm1: 'VE', lclsSystm2: ['VE06', 'VE07'] }],
  },
};

// 취미 -> 후보 조건 매핑(HOBBY_FILTER)과 테마별 고정 슬롯 필터는 삭제됐다.
// 취미는 STEP 1(테마 확정)에서만 쓰이고, 슬롯 역할은 course-template.ts가 정한다.

function matchesCategory(spot: TourSpot, group: CategoryGroup): boolean {
  if (spot.lclsSystm1 !== group.lclsSystm1) return false;
  if (!group.lclsSystm2?.length) return true;
  if (!spot.lclsSystm2) return false;
  return group.lclsSystm2.includes(spot.lclsSystm2);
}

function matchesKeywords(spot: TourSpot, keywords: string[]): boolean {
  return keywords.some((keyword) => spot.title.includes(keyword));
}

/** 후보가 해당 조건을 만족하는지 (인메모리 필터) */
export function matchesFilter(spot: TourSpot, filter: SpotFilter): boolean {
  const keywords = filter.titleKeywords ?? [];
  const hasKeywords = keywords.length > 0;
  const keywordHit = hasKeywords && matchesKeywords(spot, keywords);

  // ALTERNATIVE: 분류가 안 맞아도 제목 키워드만 맞으면 통과.
  // 야경처럼 분류체계에 없는 역할을 잡기 위한 모드.
  if (hasKeywords && filter.keywordMode === 'ALTERNATIVE' && keywordHit) {
    return true;
  }

  if (filter.contentTypeId && spot.contentTypeId !== filter.contentTypeId) {
    return false;
  }

  if (filter.categories?.length) {
    const matched = filter.categories.some((group) =>
      matchesCategory(spot, group),
    );
    if (!matched) return false;
  }

  // REQUIRE(기본): 분류 조건에 더해 키워드까지 맞아야 한다
  if (hasKeywords && filter.keywordMode !== 'ALTERNATIVE' && !keywordHit) {
    return false;
  }

  return true;
}

/**
 * 후보 풀을 받아올 때 실제로 호출해야 하는 조회 단위.
 * 여러 조건이 같은 대분류를 쓰면 한 번만 호출하면 되므로 중복을 제거한다.
 */
export interface PoolQuery {
  lclsSystm1?: string;
  contentTypeId?: string;
}

export function toPoolQueries(filters: SpotFilter[]): PoolQuery[] {
  const seen = new Map<string, PoolQuery>();

  const add = (query: PoolQuery) => {
    const key = `${query.lclsSystm1 ?? ''}|${query.contentTypeId ?? ''}`;
    if (!seen.has(key)) seen.set(key, query);
  };

  for (const filter of filters) {
    if (filter.categories?.length) {
      // 대분류 단위로 통째로 받아온 뒤 중분류는 메모리에서 거른다.
      for (const group of filter.categories) {
        add({ lclsSystm1: group.lclsSystm1 });
      }
      continue;
    }

    add({ contentTypeId: filter.contentTypeId ?? CONTENT_TYPE_TOURIST_SPOT });
  }

  return [...seen.values()];
}
