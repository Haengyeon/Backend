import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthProvider, UserStatus } from '../../generated/prisma/enums';
import { KakaoClient, KakaoUserInfo } from './kakao.client';

export const ACCESS_TOKEN_TTL = '1d'; // 데모 편의상 길게. 운영 전환 시 단축 검토
export const REFRESH_TOKEN_TTL = '14d';
export const REFRESH_COOKIE_NAME = 'refreshToken';
export const REFRESH_COOKIE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
      private readonly prisma: PrismaService,
      private readonly jwt: JwtService,
      private readonly kakao: KakaoClient,
  ) {}

  buildKakaoAuthorizeUrl(): string {
    return this.kakao.buildAuthorizeUrl();
  }

  /**
   * 카카오 콜백 처리.
   * 최초 로그인이면 User + Auth를 만들고, 기존 사용자면 그대로 씀.
   */
  async loginWithKakao(code: string): Promise<TokenPair> {
    const kakaoAccessToken = await this.kakao.exchangeCodeForToken(code);
    const kakaoUser = await this.kakao.fetchUserInfo(kakaoAccessToken);

    const userId = await this.findOrCreateUser(kakaoUser);

    return this.issueTokens(userId);
  }

  /** 리프레시 토큰으로 새 토큰 쌍 발급 (rotation) */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string };

    try {
      payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken);
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    const auth = await this.prisma.auth.findUnique({
      where: { userId: payload.sub },
      select: { refreshTokenHash: true },
    });

    // 로그아웃 했거나 이미 회전된 토큰이면 거부
    if (!auth?.refreshTokenHash) {
      throw new UnauthorizedException('다시 로그인해 주세요.');
    }

    if (auth.refreshTokenHash !== this.hashToken(refreshToken)) {
      throw new UnauthorizedException('다시 로그인해 주세요.');
    }

    return this.issueTokens(payload.sub);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.auth.update({
      where: { userId },
      data: { refreshTokenHash: null },
    });
  }

  /**
   * 로그인 직후 프론트가 화면을 가를 때 쓰는 정보.
   * hasProfile이 false면 프로필 작성 화면으로 보냄.
   */
  async getLoginContext(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { id: true } } },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    return { hasProfile: Boolean(user.profile) };
  }

  /**
   * 개발·데모용 토큰 발급.
   * 시드로 넣은 더미 계정은 카카오 계정이 없어 토큰막힘
   * 매칭은 서로 다른 두 사용자가 주고받는 기능이라 계정별 토큰이 필요해서 열어둠.
   * isDummy 검사는 반드시 있어야 한다. 없으면 배포 후 임의의 userId를 넣어
   * 실제 사용자의 토큰을 발급받을 수 있다.
   */
  async issueDevToken(userId: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isDummy: true, auth: { select: { id: true } } },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    if (!user.isDummy) {
      throw new ForbiddenException(
          '더미 계정에만 발급할 수 있습니다. 실제 계정은 카카오 로그인을 이용해 주세요.',
      );
    }

    // issueTokens가 Auth에 refreshTokenHash를 저장하므로 Auth 레코드가 반드시 있어야 함
    if (!user.auth) {
      throw new NotFoundException(
          '더미 계정에 인증 정보가 없습니다. 시드를 다시 실행해 주세요.',
      );
    }

    return this.issueTokens(userId);
  }

  private async findOrCreateUser(kakaoUser: KakaoUserInfo): Promise<string> {
    const existing = await this.prisma.auth.findUnique({
      where: {
        provider_kakaoId: {
          provider: AuthProvider.KAKAO,
          kakaoId: kakaoUser.kakaoId,
        },
      },
      select: { userId: true, user: { select: { status: true } } },
    });

    if (existing) {
      if (existing.user.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException('탈퇴한 계정입니다.');
      }

      return existing.userId;
    }

    const user = await this.prisma.user.create({
      data: {
        auth: {
          create: {
            provider: AuthProvider.KAKAO,
            kakaoId: kakaoUser.kakaoId,
          },
        },
      },
      select: { id: true },
    });

    this.logger.log(`신규 가입: user=${user.id}`);

    return user.id;
  }

  private async issueTokens(userId: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
        { sub: userId },
        { expiresIn: ACCESS_TOKEN_TTL },
    );

    const refreshToken = await this.jwt.signAsync(
        { sub: userId },
        { expiresIn: REFRESH_TOKEN_TTL },
    );

    // 원문이 아닌 해시만 저장 (DB가 노출돼도 토큰을 재사용할 수 없도록)
    await this.prisma.auth.update({
      where: { userId },
      data: { refreshTokenHash: this.hashToken(refreshToken) },
    });

    return { accessToken, refreshToken, userId };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}