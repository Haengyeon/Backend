// 코스 상세에 나가는 장소 소개글을 짧게 줄인다.
//
// 관광공사가 주는 원문은 140자짜리도 740자짜리도 있는데, 카드에는 두 줄쯤밖에 안 들어간다.
// 그렇다고 50자에서 딱 자르면 "...위치한 음식 거리로, 한"처럼 말이 끊긴다.
// 그래서 50자를 넘기면 그 앞의 마침표까지만 싣는다.
//
// 원문은 DB에 그대로 있다. 나중에 전문이 필요하면 자르지 않은 값을 쓰면 된다.

/**
 * 소개글이 여기를 넘지 않게 한다.
 *
 * 50자였을 때는 첫 문장 하나도 안 들어가는 경우가 많아, 문장을 통째로 실어 주는
 * 예외 경로가 늘 발동했다. 그러다 문장이 조금만 길면 말줄임표로 끊겼다.
 * 150자면 실제 원문 대부분이 두세 문장까지 온전히 들어온다.
 */
const TARGET = 150;

/** 끊을 자리가 없어 글자 수로 자를 때만 붙인다 */
const ELLIPSIS = '…';

/**
 * 소개글을 문장 단위로 줄인다.
 *
 *  1. 통째로 짧으면 그대로
 *  2. 목표 길이 안에 들어가는 문장들까지
 *  3. 첫 문장부터 목표를 넘으면 길이와 상관없이 그 문장을 통째로
 *  4. 마침표가 아예 없을 때만 글자 수로 자른다
 *
 * 3번에 길이 상한을 두지 않는 이유는, 상한을 두면 몇 자 차이로 문장이 잘려
 * "...가구 전문 거리로, 30여…"처럼 말이 끊기기 때문이다. 카드가 길어지는 것보다
 * 말이 끊기는 쪽이 더 나쁘다고 봤다. 길이 조절은 화면에서 줄 수를 제한하면 된다.
 *
 * 없거나 빈 글이면 null — 화면에서 소개 문단을 숨긴다.
 */
export function summarizeDescription(text: string | null): string | null {
  if (!text) return null;

  // 줄바꿈이 섞여 있어 한 줄로 편 뒤에 센다
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return null;
  if (oneLine.length <= TARGET) return oneLine;

  const sentences = oneLine.match(/[^.!?]+[.!?]*/g) ?? [];

  let summary = '';
  for (const sentence of sentences) {
    if ((summary + sentence).trim().length > TARGET) break;
    summary += sentence;
  }

  summary = summary.trim();
  if (summary.length > 0) return summary;

  // 첫 문장부터 목표를 넘겼다. 길어도 문장이 끝나는 데까지 간다
  const first = (sentences[0] ?? '').trim();
  if (/[.!?]$/.test(first)) return first;

  // 마침표가 하나도 없어 끊을 자리가 없다. 여기서만 말이 끊긴다
  return oneLine.slice(0, TARGET - 1).trimEnd() + ELLIPSIS;
}
