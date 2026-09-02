// 법정동 코드와 지도 코드는 자릿수가 같고 뜻이 달라서, 표가 틀리면
// 에러 없이 엉뚱한 구가 칠해진다. 그래서 몇 개는 값을 박아 두고 지킨다.
import {
  MAP_SIGUNGU_CODE,
  MAP_SIGUNGU_TOTAL,
  lumpedCellNameOf,
  mapSigunguCodeOf,
} from './sigungu-map-code';

describe('mapSigunguCodeOf', () => {
  it('법정동 코드를 지도 코드로 바꾼다', () => {
    expect(mapSigunguCodeOf('11110')).toBe('11010'); // 서울 종로구
    expect(mapSigunguCodeOf('11140')).toBe('11020'); // 서울 중구
    expect(mapSigunguCodeOf('26350')).toBe('21090'); // 부산 해운대구
    expect(mapSigunguCodeOf('50110')).toBe('39010'); // 제주시
  });

  it('법정동 코드를 그대로 흘려보내지 않는다', () => {
    // 지도에서 11110은 노원구라 그대로 넘기면 엉뚱한 구가 칠해진다
    expect(mapSigunguCodeOf('11110')).not.toBe('11110');
  });

  it('세종처럼 시군구가 하나뿐인 곳도 빠뜨리지 않는다', () => {
    expect(mapSigunguCodeOf('36110')).toBe('29010');
  });

  it('개편 전후 코드가 같은 구역을 가리킨다', () => {
    // 인천 서구가 서해구·검단구로 갈라졌지만 지도는 아직 서구 하나다
    expect(mapSigunguCodeOf('28260')).toBe('23080');
    expect(mapSigunguCodeOf('28275')).toBe('23080');
    expect(mapSigunguCodeOf('28290')).toBe('23080');
  });

  it('모르는 코드와 null은 null이다', () => {
    expect(mapSigunguCodeOf('99999')).toBeNull();
    expect(mapSigunguCodeOf(null)).toBeNull();
  });

  it('금산군과 영동군은 서로 다른 칸이다', () => {
    // 44710(충남 금산군)이 33340(충북 영동군)으로 잘못 걸려 있었다.
    // 금산군을 다녀오면 영동군이 칠해지고, 정작 금산군 칸은 아무도 못 받았다.
    // 시·도가 달라서 수집 리스트(충남)와 지도(충북)가 서로 다른 도를 가리켰다
    expect(mapSigunguCodeOf('44710')).toBe('34310'); // 충남 금산군
    expect(mapSigunguCodeOf('43740')).toBe('33340'); // 충북 영동군
  });
});

// 표는 지도 파일을 바꿀 때마다 다시 만든다. 그때 한 줄이 엉뚱한 시·도로 들어가면
// 에러 없이 남의 동네가 칠해지므로, 표 자체의 모양을 검사해 둔다.
describe('표 정합성', () => {
  /**
   * 시·도가 어긋나 있는 게 정상인 행.
   * 행정구역이 지도(2018) 이후에 바뀌어 옛 구역에 붙여 둔 것들이다.
   */
  const CROSS_REGION_OK = new Set([
    '27720', // 군위군 — 2023년 경북에서 대구로 편입. 지도에는 아직 경북
    '12210', // 광주 동구 ┐
    '12240', // 광주 서구 │ 광주·전남 통합 이후 코드.
    '12270', // 광주 남구 │ 12xxx 대부분이 전남이라 시·도 검사에 걸린다
    '12300', // 광주 북구 │
    '12330', // 광주 광산구 ┘
  ]);

  it('법정동 시·도와 지도 시·도가 어긋나지 않는다', () => {
    // 법정동 앞 두 자리마다 지도 앞 두 자리를 다수결로 정하고, 벗어난 행을 찾는다
    const votes: Record<string, Record<string, number>> = {};
    for (const [legal, map] of Object.entries(MAP_SIGUNGU_CODE)) {
      const from = legal.slice(0, 2);
      votes[from] ??= {};
      votes[from][map.slice(0, 2)] = (votes[from][map.slice(0, 2)] ?? 0) + 1;
    }

    const expected = Object.fromEntries(
      Object.entries(votes).map(([from, tally]) => [
        from,
        Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0],
      ]),
    );

    const mismatched = Object.entries(MAP_SIGUNGU_CODE)
      .filter(([legal]) => !CROSS_REGION_OK.has(legal))
      .filter(([legal, map]) => map.slice(0, 2) !== expected[legal.slice(0, 2)])
      .map(([legal, map]) => `${legal} -> ${map}`);

    expect(mismatched).toEqual([]);
  });

  it('지도 칸 수와 맞는다', () => {
    // southkorea-maps kostat/2018의 시군구 250개를 하나도 빠짐없이 덮어야 한다.
    // 한 칸이라도 비면 그 지역은 스탬프를 영영 못 받는다
    expect(MAP_SIGUNGU_TOTAL).toBe(250);
  });
});

describe('lumpedCellNameOf', () => {
  it('지도가 구를 안 나눠 그린 칸은 칸 이름을 준다', () => {
    // 부천 원미구를 다녀와도 칠해지는 건 부천시 전체다.
    // 목록에만 "원미구"라고 적으면 지도와 어긋나 보인다
    expect(lumpedCellNameOf('31050')).toBe('부천시');
    expect(lumpedCellNameOf('23010')).toBe('중구');
    expect(lumpedCellNameOf('23080')).toBe('서구');
  });

  it('보통 칸은 null이다', () => {
    // null이면 시군구 이름표를 그대로 쓴다
    expect(lumpedCellNameOf('11010')).toBeNull(); // 서울 종로구
  });
});
