import {
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import {
  AuthService,
  REFRESH_COOKIE_MAX_AGE,
  REFRESH_COOKIE_NAME,
} from '../service/auth.service';
import { Public } from '../public.decorator';
import { CurrentUser } from '../current-user.decorator';
import { LoginResponseDto } from '../dto/response/auth-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('kakao')
  @ApiOperation({ summary: '카카오 로그인 시작 (카카오 인증 페이지로 리다이렉트)' })
  kakaoLogin(@Res() res: Response) {
    return res.redirect(this.authService.buildKakaoAuthorizeUrl());
  }

  @Public()
  @Get('kakao/callback')
  @ApiExcludeEndpoint()
  async kakaoCallback(
      @Query('code') code: string,
      @Res() res: Response)
  {
    if (!code) {
      throw new UnauthorizedException('카카오 인증 코드가 없습니다.');
    }

    const { refreshToken } = await this.authService.loginWithKakao(code);

    this.setRefreshCookie(res, refreshToken);

    const frontendBaseUrl =
        process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000';

    return res.redirect(`${frontendBaseUrl}/auth/callback`);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: '액세스 토큰 발급/갱신 (refresh 쿠키 필요)',
    description:
        '카카오 로그인 직후, 그리고 액세스 토큰 만료 시 호출한다. ' +
        '요청마다 리프레시 토큰이 새로 발급된다(rotation).',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  async refresh(
      @Req() req: Request,
      @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const token = (req.cookies as Record<string, string> | undefined)?.[
        REFRESH_COOKIE_NAME
        ];

    if (!token) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }

    const { accessToken, refreshToken, userId } =
        await this.authService.refresh(token);

    this.setRefreshCookie(res, refreshToken);

    const context = await this.authService.getLoginContext(userId);

    return { accessToken, ...context };
  }

  @ApiBearerAuth()
  @Post('logout')
  @ApiOperation({ summary: '로그아웃 (리프레시 토큰 무효화)' })
  async logout(
      @CurrentUser() userId: string,
      @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    await this.authService.logout(userId);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });

    return { success: true };
  }

  private setRefreshCookie(res: Response, refreshToken: string) {
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      // 로컬은 http라 secure를 켜면 쿠키가 저장되지 않는다
      secure: isProduction,
      // 배포 후 프론트/백엔드 도메인이 다르면 none + secure 필요!!!!
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: REFRESH_COOKIE_MAX_AGE,
      path: '/',
    });
  }
}