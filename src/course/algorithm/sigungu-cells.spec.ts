// 매칭 선택지(sigungu-name)와 스탬프 지도 칸(sigungu-map-code)은 출처가 다른 두 표다.
// 한쪽만 고치면 에러 없이 어긋나고, 증상은 "다 다녀도 수집률이 100%가 안 된다"로만 나타난다.
// 실제로 그렇게 234개 대 250칸으로 벌어진 적이 있어서, 맞물리는지를 여기서 검사한다.
import { Region } from '../../generated/prisma/enums';
import {
  SIGUNGU_MAP_CELLS,
  SIGUNGU_TOTAL,
  isStampableSigungu,
  mapCellsOfSigungu,
} from './sigungu-cells';
import { MAP_SIGUNGU_TOTAL } from './sigungu-map-code';
import {
  SIGUNGU_NAME,
  normalizeSigunguCode,
  sigunguNameOf,
} from './sigungu-name';

describe('mapCellsOfSigungu', () => {
  it('시군구 하나가 지도 칸 하나인 게 보통이다', () => {
    expect(mapCellsOfSigungu(Region.SEOUL, '24')).toEqual(['11020']); // 중구
    expect(mapCellsOfSigungu(Region.SEJONG, '1')).toEqual(['29010']);
  });

  it('지도가 구별로 나눠 그린 도시는 칸을 전부 준다', () => {
    // 수원시를 골라 다녀오면 4칸이 한꺼번에 칠해진다.
    // 한 칸만 주면 나머지 3칸을 채울 방법이 없다 — 구를 따로 고를 수 없기 때문이다
    expect(mapCellsOfSigungu(Region.GYEONGGI, '13')).toEqual([
      '31011',
      '31012',
      '31013',
      '31014',
    ]);
    expect(mapCellsOfSigungu(Region.GYEONGNAM, '16')).toHaveLength(5); // 창원시
  });

  it('지도가 구를 안 나눠 그린 도시는 한 칸이다', () => {
    // 부천시는 원미·소사·오정구가 지도에 한 칸으로만 있다
    expect(mapCellsOfSigungu(Region.GYEONGGI, '11')).toEqual(['31050']);
    expect(mapCellsOfSigungu(Region.INCHEON, '10')).toEqual(['23010']); // 중구(+제물포·영종)
  });

  it('시·도가 바뀐 군위군도 칸을 찾는다', () => {
    // 2023년 경북에서 대구로 편입됐다. 지도는 아직 경북 자리에 그려 둔다
    expect(mapCellsOfSigungu(Region.DAEGU, '9')).toEqual(['37310']);
  });

  it('모르는 코드와 null은 빈 배열이다', () => {
    expect(mapCellsOfSigungu(Region.SEOUL, '999')).toEqual([]);
    expect(mapCellsOfSigungu(Region.SEOUL, null)).toEqual([]);
    expect(isStampableSigungu(Region.SEOUL, '999')).toBe(false);
  });
});

describe('매칭 선택지와 스탬프 표가 맞물린다', () => {
  const pairs = (Object.keys(SIGUNGU_MAP_CELLS) as Region[]).flatMap((region) =>
    Object.keys(SIGUNGU_MAP_CELLS[region]).map((code) => ({ region, code })),
  );

  it('고를 수 있는 곳은 전부 스탬프를 찍을 수 있다', () => {
    const cannotStamp = (Object.keys(SIGUNGU_NAME) as Region[]).flatMap(
      (region) =>
        Object.entries(SIGUNGU_NAME[region])
          .filter(([code]) => !isStampableSigungu(region, code))
          .map(([, name]) => `${region} ${name}`),
    );

    expect(cannotStamp).toEqual([]);
  });

  it('스탬프를 찍을 수 있는 곳은 전부 고를 수 있다', () => {
    const cannotPick = pairs
      .filter(({ region, code }) => !SIGUNGU_NAME[region]?.[code])
      .map(({ region, code }) => `${region} ${code}`);

    expect(cannotPick).toEqual([]);
  });

  it('분모는 시군구 수다', () => {
    expect(SIGUNGU_TOTAL).toBe(229);
    expect(SIGUNGU_TOTAL).toBe(pairs.length);
  });
});

describe('지도 칸을 빠짐없이 덮는다', () => {
  const cells = (Object.keys(SIGUNGU_MAP_CELLS) as Region[]).flatMap((region) =>
    Object.values(SIGUNGU_MAP_CELLS[region]).flat(),
  );

  it('한 칸이 두 시군구에 끼지 않는다', () => {
    // 겹치면 남의 동네를 다녀와도 내 칸이 칠해진다
    const seen = new Set<string>();
    const duplicated = cells.filter((cell) => {
      if (seen.has(cell)) return true;
      seen.add(cell);
      return false;
    });

    expect(duplicated).toEqual([]);
  });

  it('주인 없는 칸이 없다', () => {
    // 비면 그 칸은 어느 시군구를 골라도 영영 안 칠해진다
    expect(new Set(cells).size).toBe(MAP_SIGUNGU_TOTAL);
  });
});

describe('normalizeSigunguCode', () => {
  it('폐지된 코드를 현행으로 옮긴다', () => {
    // 한 명이 창원시, 다른 한 명이 마산시를 골라도 같은 곳으로 맞물려야 한다
    expect(normalizeSigunguCode(Region.GYEONGNAM, '6')).toBe('16'); // 마산시
    expect(normalizeSigunguCode(Region.GYEONGNAM, '14')).toBe('16'); // 진해시
    expect(normalizeSigunguCode(Region.CHUNGBUK, '9')).toBe('10'); // 청원군
    expect(normalizeSigunguCode(Region.JEJU, '2')).toBe('4'); // 북제주군
  });

  it('멀쩡한 코드는 그대로 둔다', () => {
    expect(normalizeSigunguCode(Region.SEOUL, '24')).toBe('24');
  });

  it('없는 코드는 null이다', () => {
    // 매칭 요청 검증이 이 null로 걸러낸다
    expect(normalizeSigunguCode(Region.SEOUL, '999')).toBeNull();
    expect(normalizeSigunguCode(Region.SEOUL, null)).toBeNull();
  });

  it('폐지된 코드로도 이름은 나온다', () => {
    // TourAPI가 오래된 항목에 옛 코드를 붙여 준다. 이름까지 지우면 그 장소의
    // 시군구가 화면에서 사라진다. 고를 수만 없게 하고 이름은 남긴다
    expect(SIGUNGU_NAME[Region.GYEONGNAM]['6']).toBeUndefined();
    expect(sigunguNameOf(Region.GYEONGNAM, '6')).toBe('마산시');
  });
});
