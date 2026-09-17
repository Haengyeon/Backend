// 목록을 메모리에 들고 잘라서 주는 API의 커서.
// 목록에서 몇 번째부터 볼지만 담는다.

export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64');
}

export function decodeOffsetCursor(cursor?: string): number {
  if (!cursor) return 0;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString()) as {
      offset?: unknown;
    };
    return typeof parsed.offset === 'number' && parsed.offset >= 0
      ? parsed.offset
      : 0;
  } catch {
    // 손으로 아무 값이나 넣어도 첫 페이지를 보여준다
    return 0;
  }
}
