// 소개글은 카드에 몇 줄만 들어간다.
// 글자 수로 자르면 말이 끊기므로 문장 끝에서 끊는 것이 이 파일의 전부다.
import { summarizeDescription } from './course-text.util';

describe('summarizeDescription', () => {
  it('짧으면 그대로 둔다', () => {
    const text = '흥화문은 경희궁의 정문이다.';
    expect(summarizeDescription(text)).toBe(text);
  });

  it('길면 목표 길이 안에 들어가는 문장까지만 담는다', () => {
    const text =
      '중명전은 대한제국의 중요한 현장이다. 1904년 경운궁 대화재 이후 중명전으로 거처를 옮긴 고종황제의 편전으로 사용되었다.';

    expect(summarizeDescription(text)).toBe(
      '중명전은 대한제국의 중요한 현장이다.',
    );
  });

  it('첫 문장이 목표를 넘으면 자르지 않고 그 문장을 끝까지 준다', () => {
    // 65자짜리 한 문장. 50자에서 끊으면 말이 중간에 끊긴다
    const text =
      '피어커피의 피어는 동료, 친구라는 뜻으로, 피어커피는 동료에게 전하는 마음을 커피로 표현하고 있다. 매장은 성수동에 있다.';
    const result = summarizeDescription(text)!;

    expect(result).toBe(
      '피어커피의 피어는 동료, 친구라는 뜻으로, 피어커피는 동료에게 전하는 마음을 커피로 표현하고 있다.',
    );
    expect(result.endsWith('.')).toBe(true);
  });

  it('한 문장이 한계마저 넘으면 그때는 잘라내고 말줄임표를 붙인다', () => {
    const result = summarizeDescription('가'.repeat(200) + '.')!;

    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith('…')).toBe(true);
  });

  it('마침표가 아예 없으면 잘라낸다', () => {
    const result = summarizeDescription('가'.repeat(200))!;

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
