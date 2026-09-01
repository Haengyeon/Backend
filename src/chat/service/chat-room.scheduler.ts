import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import { ChatRoomStatus } from '../../generated/prisma/enums';

@Injectable()
export class ChatRoomScheduler {
    private readonly logger = new Logger(ChatRoomScheduler.name);

    constructor(private readonly prisma: PrismaService) {}

    /** 여행 전날 00시(KST)가 지난 채팅방을 열어준다. */
    @Cron(CronExpression.EVERY_MINUTE)
    async openScheduledRooms() {
        const result = await this.prisma.chatRoom.updateMany({
            where: {
                status: ChatRoomStatus.LOCKED,
                openAt: { lte: new Date() },
            },
            data: { status: ChatRoomStatus.OPEN },
        });

        if (result.count > 0) {
            this.logger.log(`채팅방 개방: ${result.count}건`);
        }
    }
}