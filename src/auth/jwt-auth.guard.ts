import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwt: JwtService,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) return true;

        const request = context.switchToHttp().getRequest<Request>();
        const token = this.extractToken(request);

        if (!token) {
            throw new UnauthorizedException('로그인이 필요합니다.');
        }

        try {
            const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
            // 컨트롤러에서 @CurrentUser()로 꺼내 쓴다
            (request as Request & { userId?: string }).userId = payload.sub;
        } catch {
            throw new UnauthorizedException('유효하지 않은 토큰입니다.');
        }

        return true;
    }

    private extractToken(request: Request): string | null {
        const header = request.headers.authorization;

        if (!header?.startsWith('Bearer ')) return null;

        return header.slice('Bearer '.length).trim() || null;
    }
}