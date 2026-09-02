// 법정동 코드와 지도 코드는 자릿수가 같고 뜻이 달라서, 표가 틀리면
// 에러 없이 엉뚱한 구가 칠해진다. 그래서 몇 개는 값을 박아 두고 지킨다.
import { mapSigunguCodeOf } from './sigungu-map-code';

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
});
