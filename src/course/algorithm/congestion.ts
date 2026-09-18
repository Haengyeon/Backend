// 방문 시점에 장소가 얼마나 붐빌지 추정한다 (0 한산 ~ 1 붐빔).
// 실측이 아니라 규칙 기반 추정이다: 장소 종류 × 요일 × 시간대 + 주변 관광지 밀집도. 외부 호출은 없다.
// 실측 데이터로 바꿀 때는 createCongestionEstimator 속만 갈아끼우면 된다.
import { toDateString } from '../course-date.util';
import { EARTH_RADIUS_KM } from './geo';
import { TimeBand, TourSpot } from './types';

export type DayType = 'WEEKDAY' | 'WEEKEND';

/** 장소와 방문 시간대를 받아 혼잡도(0~1)를 준다. 선정 로직은 이 모양만 안다 */
export type CongestionOf = (spot: TourSpot, band: TimeBand) => number;

/** 여행일을 모를 때. 전부 0이라 혼잡도가 선정에 아무 영향도 없다 */
export const NO_CONGESTION: CongestionOf = () => 0;

/**
 * 추정치에서 시간대·요일이 차지하는 몫. 나머지는 주변 밀집도.
 * 슬롯 후보는 대부분 같은 종류라 시간대 값이 후보끼리 같다. 0.7로 두면 코스가 거의 안 바뀌었다(시뮬레이션)
 */
export const TIME_SHARE = 0.5;

/** 종류를 모르거나 비교할 대상이 없을 때 */
const NEUTRAL = 0.5;

type SpotKind =
  | 'CAFE'
  | 'MEAL'
  | 'BAR'
  | 'MARKET'
  | 'INDOOR'
  | 'HISTORY'
  | 'LANDMARK'
  | 'CITY_PARK'
  | 'NATURE'
  | 'LEISURE';

interface Profile {
  /** 주말 시간대별 붐빔. 오전·점심·오후·저녁·밤 순 */
  bands: readonly [number, number, number, number, number];
  /** 평일은 주말의 몇 배인지 */
  weekday: number;
}

const BAND_INDEX: Record<TimeBand, number> = {
  MORNING: 0,
  LUNCH: 1,
  AFTERNOON: 2,
  EVENING: 3,
  NIGHT: 4,
};

// 값은 절대량이 아니라 "언제 몰리나, 평일에 얼마나 빠지나"의 순서만 뜻한다.
// 시간대 구분은 서울시 상권분석서비스 매출 시간대(06~11·11~14·14~17·17~21·21~24)에 맞췄다.
const PROFILE: Record<SpotKind, Profile> = {
  CAFE: { bands: [0.3, 0.6, 1.0, 0.6, 0.3], weekday: 0.7 }, // 식후 오후
  MEAL: { bands: [0.2, 1.0, 0.4, 0.9, 0.4], weekday: 0.8 }, // 점심·저녁 두 번, 평일에도 덜 빠짐
  BAR: { bands: [0.0, 0.1, 0.2, 0.7, 1.0], weekday: 0.6 },
  MARKET: { bands: [0.6, 0.9, 0.8, 0.5, 0.2], weekday: 0.6 }, // 장보기라 오전부터
  INDOOR: { bands: [0.4, 0.6, 0.9, 0.4, 0.1], weekday: 0.4 }, // 전시·공연·체험. 주말 나들이
  HISTORY: { bands: [0.5, 0.7, 1.0, 0.4, 0.1], weekday: 0.5 }, // 평일에도 단체 관람
  LANDMARK: { bands: [0.3, 0.5, 0.8, 0.9, 0.8], weekday: 0.6 }, // 전망·야경이라 저녁 이후
  CITY_PARK: { bands: [0.4, 0.4, 0.7, 0.6, 0.3], weekday: 0.6 }, // 동네 사람이 매일 씀
  NATURE: { bands: [0.4, 0.6, 0.9, 0.5, 0.1], weekday: 0.4 },
  LEISURE: { bands: [0.5, 0.7, 1.0, 0.4, 0.1], weekday: 0.4 },
};

// 평일에 낀 공휴일만 적는다. 주말과 겹치는 날은 이미 주말이다. 해마다 추가해야 한다
const HOLIDAYS = new Set([
  // 2026
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-03-02',
  '2026-05-05',
  '2026-05-25',
  '2026-06-03',
  '2026-08-17',
  '2026-09-24',
  '2026-09-25',
  '2026-10-05',
  '2026-10-09',
  '2026-12-25',
  // 2027
  '2027-01-01',
  '2027-02-08',
  '2027-02-09',
  '2027-03-01',
  '2027-05-05',
  '2027-05-13',
  '2027-08-16',
  '2027-09-14',
  '2027-09-15',
  '2027-09-16',
  '2027-10-04',
  '2027-10-11',
  '2027-12-27',
]);

function kindOf(spot: TourSpot): SpotKind | null {
  const sub = spot.lclsSystm2;

  switch (spot.lclsSystm1) {
    case 'FD':
      if (sub === 'FD05') return 'CAFE';
      if (sub === 'FD04') return 'BAR';
      return 'MEAL';
    case 'SH':
      return 'MARKET';
    case 'HS':
      return 'HISTORY';
    case 'EX':
      return 'INDOOR';
    case 'LS':
      return 'LEISURE';
    case 'NA':
      return 'NATURE';
    case 'VE':
      if (sub === 'VE03') return 'CITY_PARK';
      if (sub === 'VE06' || sub === 'VE07') return 'INDOOR';
      if (sub === 'VE10') return 'LEISURE';
      if (sub === 'VE01' || sub === 'VE04' || sub === 'VE05') {
        return 'LANDMARK';
      }
      return null;
    default:
      return null;
  }
}

export function dayTypeOf(travelDate: Date, band: TimeBand): DayType {
  // @db.Date는 UTC 자정으로 온다. 로컬 요일로 읽으면 서버 시간대에 따라 하루 밀린다
  const day = travelDate.getUTCDay();
  if (day === 0 || day === 6) return 'WEEKEND';
  if (HOLIDAYS.has(toDateString(travelDate))) return 'WEEKEND';

  // 금요일 저녁은 주말처럼 붐빈다
  if (day === 5 && (band === 'EVENING' || band === 'NIGHT')) return 'WEEKEND';

  return 'WEEKDAY';
}

/** 종류·요일·시간대만 본 추정치(0~1). 같은 종류면 어느 장소든 같은 값이다 */
export function timeCongestion(
  spot: TourSpot,
  band: TimeBand,
  dayType: DayType,
): number {
  const kind = kindOf(spot);
  if (!kind) return NEUTRAL;

  const { bands, weekday } = PROFILE[kind];
  const level = bands[BAND_INDEX[band]];
  return dayType === 'WEEKEND' ? level : level * weekday;
}

/**
 * 주변에 관광지가 얼마나 몰려 있는지. 같은 풀 안에서의 백분위(0~1)다.
 *
 * 종류·시간대만 보면 같은 카페끼리 구분이 안 된다. 번화가 한복판과 골목 안쪽은
 * 다르게 붐비므로 장소마다 다른 값이 여기서 나온다. 절대 개수가 아니라 백분위라
 * 도심이든 군이든 "그 시군구 안에서 비교적" 몰린 곳이 높게 나온다.
 */
export function hotspotIndex(
  pool: TourSpot[],
  radiusKm: number,
): Map<string, number> {
  const result = new Map<string, number>();
  const n = pool.length;
  if (n < 2) {
    for (const spot of pool) result.set(spot.contentId, NEUTRAL);
    return result;
  }

  // 위도순으로 놓고 위도 차가 반경 안인 구간만 잰다. 전부 짝지어 재지(n²) 않는다.
  // 거리는 평면 근사지만 haversineKm과 같은 반지름을 써서 반경 판정이 어긋나지 않는다
  const sorted = [...pool].sort((a, b) => a.latitude - b.latitude);
  const kmPerDegree = (EARTH_RADIUS_KM * Math.PI) / 180;
  const cosLat = sorted.map((spot) =>
    Math.cos((spot.latitude * Math.PI) / 180),
  );
  const latWindow = radiusKm / kmPerDegree;
  const radiusSq = radiusKm * radiusKm;
  const counts = new Array<number>(n).fill(0);

  let start = 0;
  for (let i = 0; i < n; i++) {
    while (sorted[i].latitude - sorted[start].latitude > latWindow) start++;

    for (let j = start; j < i; j++) {
      const dy = (sorted[i].latitude - sorted[j].latitude) * kmPerDegree;
      const dx =
        (sorted[i].longitude - sorted[j].longitude) *
        kmPerDegree *
        ((cosLat[i] + cosLat[j]) / 2);
      if (dx * dx + dy * dy <= radiusSq) {
        counts[i]++;
        counts[j]++;
      }
    }
  }

  // 동점은 가운데 순위를 준다. 전부 같으면 전부 0.5
  const order = counts
    .map((count, index) => ({ count, index }))
    .sort((a, b) => a.count - b.count);

  for (let from = 0; from < n;) {
    let to = from;
    while (to + 1 < n && order[to + 1].count === order[from].count) to++;

    const percentile = (from + to) / 2 / (n - 1);
    for (let k = from; k <= to; k++) {
      result.set(sorted[order[k].index].contentId, percentile);
    }
    from = to + 1;
  }

  return result;
}

/**
 * 코스 한 벌을 짜는 동안 쓸 추정기. 풀과 여행일로 한 번 만들어 선정 내내 쓴다.
 * radiusKm은 "주변"의 범위다. 지역마다 뭉친 정도가 달라 탐색 반경 단위를 받는다.
 */
export function createCongestionEstimator(
  pool: TourSpot[],
  travelDate: Date,
  radiusKm: number,
): CongestionOf {
  const hotspot = hotspotIndex(pool, radiusKm);

  const dayType = {} as Record<TimeBand, DayType>;
  for (const band of Object.keys(BAND_INDEX) as TimeBand[]) {
    dayType[band] = dayTypeOf(travelDate, band);
  }

  return (spot, band) =>
    TIME_SHARE * timeCongestion(spot, band, dayType[band]) +
    (1 - TIME_SHARE) * (hotspot.get(spot.contentId) ?? NEUTRAL);
}
