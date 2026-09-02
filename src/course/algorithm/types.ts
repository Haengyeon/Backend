// 다른 파일을 주고 받는 데이터 모양만 정의
// 알고리즘 파일들끼리 데이터 모양 정리
import { CourseTheme, Region } from '../../generated/prisma/enums';

export interface TourSpot {
  contentId: string;
  contentTypeId: string;
  title: string;
  address: string;
  /** 시군구 코드. 시·도(areaCode) 안에서만 유일하다. 안 주는 항목은 null */
  sigunguCode: string | null;
  /** 행정구역 표준코드 5자리(서울 중구 = 11140). 지도·통계 데이터와 맞출 때 쓴다 */
  legalSigunguCode: string | null;
  latitude: number;
  longitude: number;
  firstImage: string | null;
  lclsSystm1: string | null;
  lclsSystm2: string | null;
  lclsSystm3: string | null;
}

/** 대분류가 다른 코드를 함께 써야 해서(예: NA04 + VE03) 그룹으로 나눈다. */
export interface CategoryGroup {
  lclsSystm1: string;
  /** 중분류. 비우면 해당 대분류 전체. 여러 개면 OR 조건. */
  lclsSystm2?: string[];
}

export interface SpotFilter {
  /** 여러 그룹이면 OR 조건. 비우면 분류 제한 없음. */
  categories?: CategoryGroup[];
  /** 관광타입. 예: '12'(관광지) */
  contentTypeId?: string;
  /** 분류코드로 못 잡는 역할(야경 등)을 위한 제목 키워드. */
  titleKeywords?: string[];
  /**
   * titleKeywords를 어떻게 볼지.
   * REQUIRE(기본)  - 분류 조건 AND 키워드
   * ALTERNATIVE    - 분류 조건 OR 키워드 (둘 중 하나만 맞아도 통과)
   */
  keywordMode?: 'REQUIRE' | 'ALTERNATIVE';
}

/** 테마 템플릿의 슬롯 1칸. 4칸의 역할은 전부 테마가 정한다. */
export interface SlotSpec {
  /** 화면/로그용 역할 이름. 예: '자연', '점심(한식)', '야경' */
  role: string;
  filter: SpotFilter;
  /** 지정된 order의 슬롯과 중분류가 달라야 한다. 대안이 없으면 같은 중분류의 다른 장소로. */
  distinctFromOrder?: number;
  /** 제목에 이 키워드가 있는 후보를 우선한다. 배제가 아니라 선호. */
  preferTitleKeywords?: string[];
}

export interface PlannedSpot {
  order: number;
  role: string;
  spot: TourSpot;
  mission: { title: string; description: string };
  stayMinutes: number;
  moveMinutesFromPrevious: number | null;
  distanceKmFromPrevious: number | null;
  /** 조건을 완화해서 뽑은 경우의 사유. null이면 정상 선정. */
  relaxation: string | null;
}

export interface CoursePlan {
  region: Region;
  theme: CourseTheme;
  spots: PlannedSpot[];
  totalDistanceKm: number;
  /** 역주행 + 되돌아옴 페널티(km 환산). 0이면 되돌아감 없는 동선. */
  backtrackPenaltyKm: number;
  /** 체류 + 이동 합계(분) */
  durationMinutes: number;
}

export interface CourseBuildParams {
  region: Region;
  theme: CourseTheme;
  /** 커플마다 다른 코스가 나오게 하는 시드. 실제로는 matchAttemptId를 넘긴다. */
  seed: string;
}
