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
}