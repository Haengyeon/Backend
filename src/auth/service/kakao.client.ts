import {
    Injectable,
    InternalServerErrorException,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';

const KAKAO_AUTH_HOST = 'https://kauth.kakao.com';
const KAKAO_API_HOST = 'https://kapi.kakao.com';

export interface KakaoUserInfo {
    kakaoId: string;
}

/**
 * 카카오 로그인 API 호출만 담당
 * 인가 코드 -> 액세스 토큰 -> 사용자 정보 순으로 요청
 */
@Injectable()
export class KakaoClient {
    private readonly logger = new Logger(KakaoClient.name);

    private get restApiKey(): string {
        const value = process.env.KAKAO_REST_API_KEY;

        if (!value) {
            throw new InternalServerErrorException(
                'KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.',
            );
        }

        return value;
    }

    private get clientSecret(): string {
        const value = process.env.KAKAO_CLIENT_SECRET;

        if (!value) {
            throw new InternalServerErrorException(
                'KAKAO_CLIENT_SECRET 환경변수가 설정되지 않았습니다.',
            );
        }

        return value;
    }

    private get redirectUri(): string {
        const value = process.env.KAKAO_REDIRECT_URI;

        if (!value) {
            throw new InternalServerErrorException(
                'KAKAO_REDIRECT_URI 환경변수가 설정되지 않았습니다.',
            );
        }

        return value;
    }

    /** 사용자를 보낼 카카오 로그인 페이지 URL */
    buildAuthorizeUrl(): string {
        const params = new URLSearchParams({
            client_id: this.restApiKey,
            redirect_uri: this.redirectUri,
            response_type: 'code',
        });

        return `${KAKAO_AUTH_HOST}/oauth/authorize?${params.toString()}`;
    }

    /** 인가 코드를 액세스 토큰으로 교환 */
    async exchangeCodeForToken(code: string): Promise<string> {
        // 개발자센터에서 Client Secret 사용을 '사용함'으로 설정->함께 보내야 함
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: this.restApiKey,
            client_secret: this.clientSecret,
            redirect_uri: this.redirectUri,
            code,
        });

        const response = await fetch(`${KAKAO_AUTH_HOST}/oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
            },
            body,
        });

        const text = await response.text();

        if (!response.ok) {
            this.logger.error(`카카오 토큰 교환 실패 (${response.status}): ${text}`);
            throw new UnauthorizedException('카카오 로그인에 실패했습니다.');
        }

        const parsed = JSON.parse(text) as { access_token?: string };

        if (!parsed.access_token) {
            throw new UnauthorizedException('카카오 로그인에 실패했습니다.');
        }

        return parsed.access_token;
    }

    /**
     * 액세스 토큰으로 사용자 정보 조회.
     * 카카오에서는 사용자 식별자(kakaoId)만 가져온다.
     */
    async fetchUserInfo(accessToken: string): Promise<KakaoUserInfo> {
        const response = await fetch(`${KAKAO_API_HOST}/v2/user/me`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
            },
        });

        const text = await response.text();

        if (!response.ok) {
            this.logger.error(`카카오 사용자 조회 실패 (${response.status}): ${text}`);
            throw new UnauthorizedException('카카오 사용자 정보를 가져오지 못했습니다.');
        }

        const parsed = JSON.parse(text) as { id: number };

        return { kakaoId: String(parsed.id) };
    }
}