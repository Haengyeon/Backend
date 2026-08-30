/**
 * Prisma 유니크 제약 위반(P2002) 여부.
 *
 * 스키마가 막아 주는 중복(사용자당 인증샷 1장, 코스당 후기 1개 등)은
 * 미리 조회해서 막지 않고 여기서 잡아 409로 바꾼다.
 * 조회 후 생성 사이에 다른 요청이 끼어들면 조회로는 못 막기 때문이다.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}
