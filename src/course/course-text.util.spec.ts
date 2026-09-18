// 소개글은 카드에 몇 줄만 들어간다.
// 글자 수로 자르면 말이 끊기므로 문장 끝에서 끊는 것이 이 파일의 전부다.
import { summarizeDescription } from './course-text.util';

// 관광공사 원문. 264자짜리고 문장이 셋이다
const GWANGMYEONG =
  '광명가구문화의거리는 광명사거리역에서 개봉교에 이르는 도심 속 가구 전문 거리로, 30여 개의 유명 브랜드 매장과 개성 있는 중소기업 전시장이 한 곳에 모여 형성된 가구 문화 중심지이다. 브랜드·혼수·주니어·명품·사무용 가구 등 다양한 라이프 스타일에 제품을 한 자리에서 비교·체험할 수 있다. 전국 어디든 가능한 배송 시스템은 이곳의 장점이다.';

describe('summarizeDescription', () => {
  it('짧으면 그대로 둔다', () => {
    const text = '흥화문은 경희궁의 정문이다.';
    expect(summarizeDescription(text)).toBe(text);
  });

  it('길면 목표 길이 안에 들어가는 문장까지만 담는다', () => {
    const result = summarizeDescription(GWANGMYEONG)!;

    // 둘째 문장까지 담으면 150자를 넘어서 첫 문장에서 끊긴다
    expect(result).toBe(
      '광명가구문화의거리는 광명사거리역에서 개봉교에 이르는 도심 속 가구 전문 거리로, 30여 개의 유명 브랜드 매장과 개성 있는 중소기업 전시장이 한 곳에 모여 형성된 가구 문화 중심지이다.',
    );
    expect(result.length).toBeLessThanOrEqual(150);
    expect(result.endsWith('…')).toBe(false);
  });

  it('여러 문장이 들어가면 문장 경계에서 끝난다', () => {
    const text =
      '창천근린공원은 서울특별시 서대문구 창천동에 위치한 도심 속 공원이다. 이 공원은 창천동 주민들의 휴식과 여가를 위해 조성된 녹지 공간이다. 공원은 다양한 나무와 잔디밭이 있어 자연 속에서 산책하거나 피크닉을 즐길 수 있는 환경을 제공한다. 사계절 내내 주민들이 찾는다.';
    const result = summarizeDescription(text)!;

    expect(result.length).toBeLessThanOrEqual(150);
    expect(result.endsWith('.')).toBe(true);
    // 잘린 자리가 문장 중간이 아니어야 한다
    expect(text.startsWith(result)).toBe(true);
  });

  it('첫 문장이 목표를 넘으면 자르지 않고 그 문장을 끝까지 준다', () => {
    // 길이로 상한을 두면 몇 자 차이로 말이 끊긴다. 카드가 길어지는 편이 낫다
    const long = '아주 긴 문장이라서 ' + '가'.repeat(300) + '이다.';

    expect(summarizeDescription(long)).toBe(long);
  });

  it('마침표가 하나도 없을 때만 잘라낸다', () => {
    // 끊을 자리가 없으면 어쩔 수 없다. 여기서만 말줄임표가 나온다
    const result = summarizeDescription('가'.repeat(300))!;

    expect(result.length).toBeLessThanOrEqual(150);
    expect(result.endsWith('…')).toBe(true);
  });

  it('줄바꿈은 한 칸 공백으로 편다', () => {
    expect(summarizeDescription('첫 줄이다.\n둘째 줄이다.')).toBe(
      '첫 줄이다. 둘째 줄이다.',
    );
  });

  it('없거나 빈 글이면 null이다', () => {
    expect(summarizeDescription(null)).toBeNull();
    expect(summarizeDescription('   ')).toBeNull();
  });
});
