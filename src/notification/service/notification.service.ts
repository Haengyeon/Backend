import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationChannel } from '../../generated/prisma/enums';

import { FcmClient } from './fcm.client';

export enum NotificationType {
  MATCH_FOUND = 'MATCH_FOUND',
  MATCH_CONFIRMED = 'MATCH_CONFIRMED',

  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_EXPIRED = 'PAYMENT_EXPIRED',

  RESPONSE_EXPIRED = 'RESPONSE_EXPIRED',

  CHAT_OPEN = 'CHAT_OPEN',

  COURSE_D2 = 'COURSE_D2',
  COURSE_D1 = 'COURSE_D1',
  COURSE_COMPLETED = 'COURSE_COMPLETED',
}

const NOTIFICATION_TEXT: Record<
    NotificationType,
    {
      title: string;
      body: string;
      path: string;
    }
> = {
  [NotificationType.MATCH_FOUND]: {
    title: '인연이 나타났어요',
    body: '상대방 프로필을 확인하고 수락 여부를 알려주세요.',
    path: '/matching',
  },

  [NotificationType.MATCH_CONFIRMED]: {
    title: '매칭이 확정됐어요',
    body: '여행 코스가 준비되고 있어요.',
    path: '/matching',
  },

  [NotificationType.PAYMENT_PENDING]: {
    title: '서로 수락했어요',
    body: '결제를 완료하면 매칭이 확정됩니다.',
    path: '/payment',
  },

  [NotificationType.PAYMENT_EXPIRED]: {
    title: '결제 시간이 지났어요',
    body: '매칭이 취소됐어요. 다시 상대를 찾아볼까요?',
    path: '/matching',
  },

  [NotificationType.RESPONSE_EXPIRED]: {
    title: '응답 시간이 지났어요',
    body: '매칭이 취소됐어요. 다시 상대를 찾아볼까요?',
    path: '/matching',
  },

  [NotificationType.CHAT_OPEN]: {
    title: '채팅방이 열렸어요',
    body: '내일 만날 약속을 정해보세요.',
    path: '/chat',
  },

  [NotificationType.COURSE_D2]: {
    title: '이틀 뒤 여행이에요',
    body:
        '어느 지역에서 어떤 테마로 만나는지 확인해보세요. ' +
        '코스 정보는 내일 공개돼요.',
    path: '/course',
  },

  [NotificationType.COURSE_D1]: {
    title: '내일 여행이에요',
    body:
        '소요 시간과 준비물을 확인해보세요. ' +
        '상세 코스는 당일에 열려요.',
    path: '/course',
  },

  [NotificationType.COURSE_COMPLETED]: {
    title: '여행은 어떠셨나요?',
    body: '후기를 남기고 포인트를 받아가세요.',
    path: '/course',
  },
};

@Injectable()
export class NotificationService {
  private readonly logger =
      new Logger(NotificationService.name);

  constructor(
      private readonly prisma: PrismaService,
      private readonly fcm: FcmClient,
  ) {}

  /**
   * 사용자 한 명에게 알림 발송
   *
   * 알림 발송 실패가
   * 매칭/결제/코스 등의 본래 비즈니스 로직을
   * 실패시키면 안 되므로 예외를 밖으로 던지지 않는다.
   *
   * 실패는 로그와 NotificationLog에 기록한다.
   */
  async send(
      userId: string,
      type: NotificationType,
  ): Promise<void> {
    try {
      const setting =
          await this.prisma.notificationSetting.findUnique({
            where: {
              userId,
            },
            select: {
              pushEnabled: true,
            },
          });

      /**
       * NotificationSetting이 없는 경우:
       *
       * pushEnabled 기본값이 true인 옵트아웃 방식이므로
       * 알림을 받을 수 있는 상태로 간주한다.
       *
       * 사용자가 명시적으로 false로 설정한 경우만
       * 발송하지 않는다.
       */
      if (setting?.pushEnabled === false) {
        return;
      }

      const tokens =
          await this.prisma.pushToken.findMany({
            where: {
              userId,
            },
            select: {
              token: true,
            },
          });

      /**
       * 등록된 기기 토큰이 없다면
       * 실제 푸시를 보낼 대상이 없으므로 종료
       */
      if (tokens.length === 0) {
        return;
      }

      const text = NOTIFICATION_TEXT[type];

      const baseUrl =
          process.env.FRONTEND_BASE_URL ??
          'http://localhost:3000';

      const result =
          await this.fcm.sendToTokens({
            tokens: tokens.map(
                (token) => token.token,
            ),
            title: text.title,
            body: text.body,
            link: `${baseUrl}${text.path}`,
          });

      /**
       * 만료되었거나 더 이상 등록되지 않은
       * FCM 토큰 제거
       */
      if (result.invalidTokens.length > 0) {
        await this.prisma.pushToken.deleteMany({
          where: {
            token: {
              in: result.invalidTokens,
            },
          },
        });
      }

      await this.writeLog(
          userId,
          type,
          result.successCount > 0
              ? 'SENT'
              : 'FAILED',
      );
    } catch (error) {
      this.logger.error(
          `알림 발송 실패: user=${userId}, type=${type}`,
          error instanceof Error
              ? error.stack
              : String(error),
      );

      await this.writeLog(
          userId,
          type,
          'FAILED',
      );
    }
  }

  /**
   * 여러 사용자에게 동일한 종류의 알림 발송
   *
   * 매칭 확정, 결제 확정처럼
   * 두 명 이상에게 동시에 알림을 보낼 때 사용한다.
   */
  async sendToMany(
      userIds: string[],
      type: NotificationType,
  ): Promise<void> {
    await Promise.all(
        userIds.map((userId) =>
            this.send(userId, type),
        ),
    );
  }

  /**
   * 알림 설정 조회
   *
   * 설정이 아직 없는 사용자라면
   * Prisma schema의 기본값(pushEnabled=true)을 이용해 생성한다.
   */
  async getSetting(userId: string) {
    const setting =
        await this.prisma.notificationSetting.upsert({
          where: {
            userId,
          },
          update: {},
          create: {
            userId,
          },
        });

    return {
      pushEnabled: setting.pushEnabled,
    };
  }

  /**
   * 알림 설정 변경
   */
  async updateSetting(
      userId: string,
      pushEnabled: boolean,
  ) {
    const setting =
        await this.prisma.notificationSetting.upsert({
          where: {
            userId,
          },

          update: {
            pushEnabled,
          },

          create: {
            userId,
            pushEnabled,
          },
        });

    return {
      pushEnabled: setting.pushEnabled,
    };
  }

  /**
   * FCM 토큰 등록
   *
   * 같은 브라우저/기기 토큰이 다른 사용자에게
   * 남아 있을 가능성이 있으므로,
   * 기존 토큰이 있다면 현재 userId로 갱신한다.
   *
   * 토큰 등록 시 NotificationSetting이 없다면
   * 기본값(pushEnabled=true)으로 생성한다.
   *
   * 기존 사용자의 알림 설정은 변경하지 않는다.
   */
  async registerToken(
      userId: string,
      token: string,
  ): Promise<{ success: boolean }> {
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.pushToken.upsert({
        where: {
          token,
        },

        update: {
          userId,
          lastUsedAt: now,
        },

        create: {
          userId,
          token,
          lastUsedAt: now,
        },
      }),

      this.prisma.notificationSetting.upsert({
        where: {
          userId,
        },

        update: {},

        create: {
          userId,
        },
      }),
    ]);

    return {
      success: true,
    };
  }

  /**
   * 로그아웃 시 현재 기기의 FCM 토큰 제거
   */
  async removeToken(
      userId: string,
      token: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.pushToken.deleteMany({
      where: {
        userId,
        token,
      },
    });

    return {
      success: true,
    };
  }

  /**
   * 알림 발송 결과 저장
   *
   * 로그 저장 자체가 실패해도
   * 원래 비즈니스 로직에는 영향을 주지 않는다.
   */
  private async writeLog(
      userId: string,
      type: NotificationType,
      status: 'SENT' | 'FAILED',
  ): Promise<void> {
    try {
      await this.prisma.notificationLog.create({
        data: {
          userId,
          channel:
          NotificationChannel.WEB_PUSH,
          type,
          status,
        },
      });
    } catch (error) {
      this.logger.error(
          '알림 로그 저장 실패',
          error instanceof Error
              ? error.stack
              : String(error),
      );
    }
  }
}