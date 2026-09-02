import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** JwtAuthGuard가 request에 심어둔 userId를 꺼냄. */
export const CurrentUser = createParamDecorator(
    (_data: unknown, context: ExecutionContext): string => {
        const request = context
            .switchToHttp()
            .getRequest<Request & { userId?: string }>();

        return request.userId!;
    },
);