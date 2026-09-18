import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

type ClassType<T> = new () => T;

/**
 * multipart 폼 필드에 담겨 온 JSON 문자열을 DTO로 바꾸고 검증한다.
 *
 * 파일과 함께 보내야 하는 요청은 본문 전체를 JSON으로 만들 수 없다.
 * 값을 폼 필드로 하나씩 펼치면 배열과 불린이 전부 문자열로 들어와
 * 변환 코드가 DTO마다 늘어나므로, JSON을 필드 하나에 담아 타입을 유지한다.
 *
 * 파이프가 아니라 함수인 이유:
 * 파라미터에 DTO 타입을 달면 전역 ValidationPipe가 먼저 돌면서
 * JSON 문자열을 그 DTO로 검증하려 들고, whitelist가 필드를 다 걷어내 버린다.
 * 컨트롤러에서는 문자열로 받고(전역 파이프는 문자열을 건드리지 않는다)
 * 여기서 직접 변환한다.
 */
export async function parseJsonBody<T extends object>(
    type: ClassType<T>,
    raw: unknown,
    options: { optional?: boolean } = {},
): Promise<T> {
    if (raw === undefined || raw === null || raw === '') {
        if (options.optional) {
            return plainToInstance(type, {});
        }

        throw new BadRequestException('본문이 비어 있습니다.');
    }

    // JSON 요청으로 이미 객체가 들어온 경우도 그대로 받아 준다
    const parsed = typeof raw === 'string' ? parse(raw) : raw;

    const dto = plainToInstance(type, parsed);

    const errors = await validate(dto as object, {
        whitelist: true,
        forbidUnknownValues: false,
    });

    if (errors.length > 0) {
        throw new BadRequestException(
            errors.flatMap((error) => Object.values(error.constraints ?? {})),
        );
    }

    return dto;
}

function parse(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        throw new BadRequestException(
            'profile 값이 JSON 형식이 아닙니다. 예: {"name":"김민준", ...}',
        );
    }
}