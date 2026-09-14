import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import { ChatRoomStatus } from '../../generated/prisma/enums';
import {
    NotificationService,
    NotificationType,
} from '../../notification/service/notification.service';

@Injectable()
export class ChatRoomScheduler {
    private readonly logger = new Logger(ChatRoomScheduler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notification: NotificationService,
    ) {}

    /** 여행 전날 00시(KST)가 지난 채팅방을 열어준다. */
    @Cron(CronExpression.EVERY_MINUTE)
    async openScheduledRooms() {
        // updateMany는 몇 건 바뀌었는지만 알려주고 어떤 방인지는 주지 않아서,
        // 알림을 보낼 대상(참여자)을 알아야 하므로 먼저 조회한다.
        const rooms = await this.prisma.chatRoom.findMany({
            where: {
                status: ChatRoomStatus.LOCKED,
                openAt: { lte: new Date() },
            },
            select: {
                id: true,
                matchAttempt: {
                    select: {
                        matchingA: { select: { userId: true } },
                        matchingB: { select: { userId: true } },
                    },
                },
            },
        });

        if (rooms.length === 0) return;

        await this.prisma.chatRoom.updateMany({
            where: { id: { in: rooms.map((r) => r.id) } },
            data: { status: ChatRoomStatus.OPEN },
        });

        for (const room of rooms) {
            void this.notification.sendToMany(
                [
                    room.matchAttempt.matchingA.userId,
                    room.matchAttempt.matchingB.userId,
                ],
                NotificationType.CHAT_OPEN,
            );
        }

        this.logger.log(`채팅방 개방: ${rooms.length}건`);
    }

    /**
     * 여행이 끝난 채팅방을 닫는다.
     * 여행 당일 24시(= 다음날 00시 KST)까지는 열어둔다.
     * CLOSED가 되면 메시지 전송이 막힌다(조회는 그대로 가능).
     * 지난 대화를 다시 볼 수 있어야 하므로 방 자체를 지우지는 않는다.
     */
    @Cron(CronExpression.EVERY_HOUR)
    async closeFinishedRooms() {
        const result = await this.prisma.chatRoom.updateMany({
            where: {
                status: ChatRoomStatus.OPEN,
                matchAttempt: {
                    // travelDate는 @db.Date라 UTC 자정으로 저장돼 있다.
                    // 여행 다음날 00시 KST = travelDate + 1일 - 9시간(UTC)
                    travelDate: { lt: this.kstTodayAsUtcDate() },
                },
            },
            data: {
                status: ChatRoomStatus.CLOSED,
                closedAt: new Date(),
            },
        });

        if (result.count > 0) {
            this.logger.log(`채팅방 종료: ${result.count}건`);
        }
    }

    private kstTodayAsUtcDate(): Date {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(new Date());

        const year = Number(parts.find((p) => p.type === 'year')!.value);
        const month = Number(parts.find((p) => p.type === 'month')!.value);
        const day = Number(parts.find((p) => p.type === 'day')!.value);

        return new Date(Date.UTC(year, month - 1, day));
    }
}