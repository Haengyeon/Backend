// 스팟과 스팟 사이의 거리를 재주는 역활
const EARTH_RADIUS_KM = 6371;

export interface LatLng {
  latitude: number;
  longitude: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** 두 좌표 사이 직선 거리(km) */
export function haversineKm(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 거리 기반 이동시간 어림 계산(분). 10km 초과는 차량 이동으로 보고 km당 3분. */
export function estimateMoveMinutes(distanceKm: number): number {
  if (distanceKm <= 3) return 10;
  if (distanceKm <= 5) return 15;
  if (distanceKm <= 10) return 20;
  return Math.min(90, Math.round(20 + (distanceKm - 10) * 3));
}
