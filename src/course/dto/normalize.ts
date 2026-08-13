// 우리가 스웨거 json문에 빈 뭊나열이나 소문자처럼 실수 알아서 걸러주고 오타 같은 것만 에러 표시 하게 해주는 dto
// 나중에는 필요없음. 지금 테스트 할때 수정할때 잔잔바리한 실수 걸러주는 용도
// 삭제해도 됨.
import { TransformFnParams } from 'class-transformer';
export function normalizeEnumArray({ value }: TransformFnParams): unknown {
  const raw =
    typeof value === 'string'
      ? value.split(',')
      : Array.isArray(value)
        ? value
        : null;

  if (raw === null) return value;

  return raw
    .map((item) =>
      typeof item === 'string' ? item.trim().toUpperCase() : item,
    )
    .filter((item) => item !== '' && item !== null && item !== undefined);
}

/** 단일 enum 값 정리 */
export function normalizeEnum({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}
