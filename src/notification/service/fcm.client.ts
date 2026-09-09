import {
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import {
    App,
    cert,
    getApps,
    initializeApp,
} from 'firebase-admin/app';
import {
    getMessaging,
    Message,
} from 'firebase-admin/messaging';

const APP_NAME = 'haengyeon-fcm';

@Injectable()
export class FcmClient {
    private readonly logger = new Logger(FcmClient.name);

    private app: App | null = null;

    /**
     * Firebase Admin App 초기화
     *
     * 최초 발송 시 한 번만 초기화하고
     * 이후에는 동일 App 인스턴스를 재사용한다.
     */
    private getApp(): App {
        if (this.app) {
            return this.app;
        }

        const existing = getApps().find(
            (app) => app.name === APP_NAME,
        );

        if (existing) {
            this.app = existing;
            return existing;
        }

        const projectId =
            process.env.FIREBASE_PROJECT_ID;

        const clientEmail =
            process.env.FIREBASE_CLIENT_EMAIL;

        /**
         * .env에서는 private key의 줄바꿈이
         * \n 문자열 형태로 저장되므로 실제 줄바꿈으로 변경한다.
         */
        const privateKey =
            process.env.FIREBASE_PRIVATE_KEY?.replace(
                /\\n/g,
                '\n',
            );

        if (!projectId || !clientEmail || !privateKey) {
            throw new InternalServerErrorException(
                'FIREBASE_* 환경변수가 설정되지 않았습니다.',
            );
        }

        this.app = initializeApp(
            {
                credential: cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
            },
            APP_NAME,
        );

        return this.app;
    }

    /**
     * 여러 FCM 토큰에 동일한 알림 발송
     *
     * 브라우저 캐시 삭제, 알림 권한 해제,
     * 장기간 미사용 등의 이유로 토큰이 만료될 수 있다.
     *
     * 확실하게 만료된 토큰만 invalidTokens로 반환하고
     * 실제 DB 삭제는 호출한 NotificationService에서 처리한다.
     */
    async sendToTokens(params: {
        tokens: string[];
        title: string;
        body: string;
        link?: string;
    }): Promise<{
        successCount: number;
        invalidTokens: string[];
    }> {
        if (params.tokens.length === 0) {
            return {
                successCount: 0,
                invalidTokens: [],
            };
        }

        const messages: Message[] =
            params.tokens.map((token) => ({
                token,

                notification: {
                    title: params.title,
                    body: params.body,
                },

                webpush: params.link
                    ? {
                        fcmOptions: {
                            link: params.link,
                        },
                    }
                    : undefined,
            }));

        const response = await getMessaging(
            this.getApp(),
        ).sendEach(messages);

        const invalidTokens: string[] = [];

        response.responses.forEach(
            (result, index) => {
                if (result.success) {
                    return;
                }

                const code = result.error?.code;
                const message = result.error?.message;

                /**
                 * 확실하게 더 이상 사용할 수 없는 토큰만 삭제 대상으로 처리한다.
                 *
                 * invalid-argument는 토큰뿐 아니라
                 * 메시지 payload 문제에서도 발생할 수 있으므로
                 * 여기서는 삭제 대상으로 처리하지 않는다.
                 */
                if (
                    code ===
                    'messaging/registration-token-not-registered' ||
                    code ===
                    'messaging/invalid-registration-token'
                ) {
                    invalidTokens.push(
                        params.tokens[index],
                    );

                    return;
                }

                this.logger.warn(
                    `FCM 발송 실패: code=${code ?? 'unknown'}, ` +
                    `message=${message ?? 'unknown'}`,
                );
            },
        );

        return {
            successCount: response.successCount,
            invalidTokens,
        };
    }
}