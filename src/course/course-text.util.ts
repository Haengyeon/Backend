// 코스 상세에 나가는 장소 소개글을 짧게 줄인다.
//
// 관광공사가 주는 원문은 140자짜리도 740자짜리도 있는데, 카드에는 두 줄쯤밖에 안 들어간다.
// 그렇다고 50자에서 딱 자르면 "...위치한 음식 거리로, 한"처럼 말이 끊긴다.
// 그래서 50자를 넘기면 그 앞의 마침표까지만 싣는다.
//
// 원문은 DB에 그대로 있다. 나중에 전문이 필요하면 자르지 않은 값을 쓰면 된다.

/** 여기 안에서 문장이 끝나면 제일 좋다. 모바일 카드 두 줄 남짓 */
const TARGET = 50;

/**
 * 첫 문장이 길어서 목표를 넘길 때 참아 주는 한계.
 * 문장 하나가 이보다 길면 끝까지 실어 봐야 카드를 뚫으므로 그때는 문장을 포기한다.
 */
const HARD_MAX = 100;

/** 문장을 못 살리고 글자 수로 자를 때 붙인다 */
const ELLIPSIS = '…';

/**
 * 소개글을 문장 단위로 줄인다.
 *
 *  1. 통째로 짧으면 그대로
 *  2. 목표 길이 안에 들어가는 문장들까지
 *  3. 첫 문장부터 목표를 넘으면 그 문장 하나를 통째로 (한계까지는 봐준다)
 *  4. 마침표가 아예 없거나 첫 문장이 한계도 넘으면 그때만 글자 수로 자른다
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

  // 첫 문장부터 목표를 넘겼다. 자르는 대신 그 문장이 끝나는 데까지 간다
  const first = (sentences[0] ?? '').trim();
  const isWholeSentence = /[.!?]$/.test(first);
  if (isWholeSentence && first.length <= HARD_MAX) return first;

  // 마침표가 없거나 한 문장이 한계도 넘는다. 여기서만 말이 끊긴다
  return oneLine.slice(0, TARGET - 1).trimEnd() + ELLIPSIS;
}
