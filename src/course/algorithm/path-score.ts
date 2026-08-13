// 경로 하나에 점수를 매긴다 (낮을수록 좋음)
// 거리만 보면 짧게 왔다갔다 하는 W자 동선이 안 걸러져서
// 방향 전환(역주행)과 되돌아옴을 벌점으로 더한다
// 거리 재기는 geo.ts, 이 점수로 조합을 고르는 건 spot-selection.ts
import { haversineKm } from './geo';
import { TourSpot } from './types';

// score = 총거리 + 2.5 x 역주행 + 1.5 x 되돌아옴
// 벌점 1km를 실제 이동 2.5km / 1.5km처럼 취급해, 거리가 조금 늘어도 곧은 동선을 고르게 한다
export const REVERSAL_WEIGHT = 2.5;
export const REVISIT_WEIGHT = 1.5;

interface Point {
  x: number;
  y: number;
}

// 좌표를 기준점 기반 평면(km)으로 변환. 코스 범위에서는 등장방형 근사로 충분하다.
function toPlane(origin: TourSpot, spot: TourSpot): Point {
  const latRad = (origin.latitude * Math.PI) / 180;
  return {
    x: (spot.longitude - origin.longitude) * 111.32 * Math.cos(latRad),
    y: (spot.latitude - origin.latitude) * 110.57,
  };
}

export function routeLengthKm(spots: TourSpot[]): number {
  let total = 0;
  for (let i = 1; i < spots.length; i++) {
    total += haversineKm(spots[i - 1], spots[i]);
  }
  return total;
}

// 연속한 세 스팟의 진행 방향이 90도 이상 꺾이면(내적이 음수) 왔던 방향으로
// 되돌아가는 것으로 보고, 꺾인 정도 x 짧은 쪽 구간 길이만큼 페널티를 매긴다.

export function reversalPenaltyKm(spots: TourSpot[]): number {
  if (spots.length < 3) return 0;

  const origin = spots[0];
  const points = spots.map((spot) => toPlane(origin, spot));

  let penalty = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const v1 = {
      x: points[i].x - points[i - 1].x,
      y: points[i].y - points[i - 1].y,
    };
    const v2 = {
      x: points[i + 1].x - points[i].x,
      y: points[i + 1].y - points[i].y,
    };

    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);
    if (len1 < 1e-6 || len2 < 1e-6) continue;

    const cos = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
    if (cos < 0) {
      penalty += -cos * Math.min(len1, len2);
    }
  }

  return penalty;
}

// j에서 i까지 실제로 걸어온 거리가 두 지점 직선거리의 2배를 넘으면
// 나갔다 되돌아온 것으로 보고 초과분을 페널티로 매긴다.
// 절대 반경으로 재면 도보권에 뭉친 코스가 최대 페널티를 받으므로 쓰지 않는다.
export function revisitPenaltyKm(spots: TourSpot[]): number {
  let penalty = 0;

  for (let j = 0; j < spots.length - 2; j++) {
    let traveled = 0;

    for (let i = j + 1; i < spots.length; i++) {
      traveled += haversineKm(spots[i - 1], spots[i]);
      if (i - j < 2) continue;

      const direct = haversineKm(spots[j], spots[i]);
      penalty += Math.max(0, traveled - 2 * direct);
    }
  }

  return penalty;
}

export interface PathScore {
  // 최소화 대상. 낮을수록 좋은 경로
  score: number;
  totalDistanceKm: number;
  reversalKm: number;
  revisitKm: number;
}

export function scorePath(spots: TourSpot[]): PathScore {
  const totalDistanceKm = routeLengthKm(spots);
  const reversalKm = reversalPenaltyKm(spots);
  const revisitKm = revisitPenaltyKm(spots);

  return {
    score:
      totalDistanceKm +
      REVERSAL_WEIGHT * reversalKm +
      REVISIT_WEIGHT * revisitKm,
    totalDistanceKm,
    reversalKm,
    revisitKm,
  };
}
