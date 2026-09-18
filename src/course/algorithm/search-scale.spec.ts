// 탐색 반경은 고정값이 아니라 그 지역 후보가 얼마나 뭉쳐 있는지에서 나온다.
//
// 시군구는 면적이 서울 중구 10km²부터 인제군 1,646km²까지 165배 차이 난다.
// 한 벌의 상수를 쓰면 도심에서는 너무 넓게 찾아 코스가 늘어지고,
// 넓은 군에서는 사다리 안에 후보가 없어 조용히 반경 밖에서 끌어오게 된다.
import {
  MAX_RADIUS_UNIT_KM,
  MIN_RADIUS_UNIT_KM,
  MOVE_MINUTES_BUDGET,
  SMALL_POOL_SIZE,
  CANDIDATES_PER_SLOT,
  CANDIDATES_PER_SLOT_SMALL,
  searchScaleOf,
} from './spot-selection';
import { routeMoveMinutes } from './path-score';
import { TourSpot } from './types';

/** 위도 1도 ≈ 110.57km. 간격을 km로 주면 좌표를 만들어 준다 */
function grid(count: number, spacingKm: number): TourSpot[] {
  return Array.from({ length: count }, (_, index) => ({
    contentId: `spot-${index}`,
    contentTypeId: '12',
    title: `장소 ${index}`,
    address: '서울특별시 중구',
    sigunguCode: '24',
    legalSigunguCode: '11140',
    latitude: 37.5 + (index * spacingKm) / 110.57,
    longitude: 127.0,
    firstImage: null,
    lclsSystm1: 'NA',
    lclsSystm2: 'NA04',
    lclsSystm3: null,
  }));
}

describe('searchScaleOf', () => {
  it('빽빽한 지역은 사다리가 좁아진다', () => {
    // 100m 간격 — 도심에 해당한다. 3번째 이웃이 0.3km라 하한에 걸린다
    const dense = searchScaleOf(grid(40, 0.1));
    expect(dense.unitKm).toBe(MIN_RADIUS_UNIT_KM);

    // 예전 고정 사다리는 끝이 5km였다. 도심에서 그만큼 넓게 찾을 이유가 없다
    expect(dense.stepsKm[dense.stepsKm.length - 1]).toBeLessThan(5);
  });

  it('중간 밀도는 상·하한에 안 걸리고 산포도를 그대로 쓴다', () => {
    // 500m 간격 -> 3번째 이웃 1km
    const scale = searchScaleOf(grid(40, 0.5));

    expect(scale.unitKm).toBeCloseTo(1, 1);
    expect(scale.unitKm).toBeGreaterThan(MIN_RADIUS_UNIT_KM);
    expect(scale.unitKm).toBeLessThan(MAX_RADIUS_UNIT_KM);
  });

  it('흩어진 지역은 사다리가 넓어진다', () => {
    // 5km 간격 — 넓은 군에 해당한다
    const scale = searchScaleOf(grid(40, 5));

    expect(scale.unitKm).toBe(MAX_RADIUS_UNIT_KM);
    expect(scale.stepsKm[0]).toBe(MAX_RADIUS_UNIT_KM);
  });

  it('사다리 단위에 상·하한을 둔다', () => {
    // 하한이 없으면 도심에서 1단계가 수십 미터가 되어 사다리를 헛돈다
    expect(searchScaleOf(grid(40, 0.01)).unitKm).toBe(MIN_RADIUS_UNIT_KM);
    // 상한이 없으면 인제군이 33km짜리 사다리를 갖는다. 그건 하루 코스가 아니다
    expect(searchScaleOf(grid(40, 50)).unitKm).toBe(MAX_RADIUS_UNIT_KM);
  });

  it('사다리는 단계마다 넓어진다', () => {
    const { stepsKm, relaxStepsKm } = searchScaleOf(grid(40, 1));

    expect(stepsKm).toHaveLength(5);
    for (let i = 1; i < stepsKm.length; i++) {
      expect(stepsKm[i]).toBeGreaterThan(stepsKm[i - 1]);
    }
    // 완화 단계는 정상 단계 끝보다 넓다
    expect(relaxStepsKm[0]).toBeGreaterThan(stepsKm[stepsKm.length - 1]);
  });

  it('후보가 적은 지역은 슬롯당 후보를 늘린다', () => {
    // 30건짜리 시군구(인제·울진)는 조합이 하나로 수렴해 매번 같은 코스가 나왔다
    expect(searchScaleOf(grid(SMALL_POOL_SIZE - 1, 1)).candidatesPerSlot).toBe(
      CANDIDATES_PER_SLOT_SMALL,
    );
    expect(searchScaleOf(grid(SMALL_POOL_SIZE + 1, 1)).candidatesPerSlot).toBe(
      CANDIDATES_PER_SLOT,
    );
  });

  it('이웃이 셋도 안 되면 가장 넓은 단위를 쓴다', () => {
    // 나눌 근거가 없으니 좁게 잡아 봐야 헛돈다
    expect(searchScaleOf(grid(2, 1)).unitKm).toBe(MAX_RADIUS_UNIT_KM);
    expect(searchScaleOf([]).unitKm).toBe(MAX_RADIUS_UNIT_KM);
  });
});

describe('routeMoveMinutes', () => {
  it('구간마다 따로 재서 더한다', () => {
    // 1km짜리 구간 3개 = 10분 x 3. 총거리 3km로 한 번에 재도 10분이라
    // 뭉뚱그리면 실제보다 짧게 나온다
    expect(routeMoveMinutes(grid(4, 1))).toBe(30);
  });

  it('멀어질수록 가파르게 는다', () => {
    // 10km를 넘으면 차량 이동으로 보고 km당 3분씩 붙는다
    const near = routeMoveMinutes(grid(4, 1)); // 30분
    const far = routeMoveMinutes(grid(4, 12)); // 78분

    expect(far).toBeGreaterThan(near * 2);
  });

  it('스팟이 하나면 이동이 없다', () => {
    expect(routeMoveMinutes(grid(1, 1))).toBe(0);
  });

  it('예산은 정상 지역과 문제 지역 사이에 있다', () => {
    // 실측: 서울 중구 30분 · 수원시 30분 · 인제군 63분 · 정선군 114분 · 울진군 110분
    // 정상 지역을 막지 않으면서 40km짜리 코스는 걸러야 한다
    expect(MOVE_MINUTES_BUDGET).toBeGreaterThan(63);
    expect(MOVE_MINUTES_BUDGET).toBeLessThan(100);
  });
});
