import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import { ChatRoomStatus } from '../../generated/prisma/enums';

/**
 * 체험 채팅에서 가상 상대가 보내는 답장.
 * 사용자가 말을 걸 때마다 하나씩 순서대로 나간다.
 */
const DUMMY_REPLIES = [
    '안녕하세요! 오늘 잘 부탁드려요 😊',
    '혹시 몇 시쯤 만나는 게 편하세요?',
    '좋아요! 그럼 그때 뵐게요',
    '조심히 오세요~',
];

/** 답장이 다 떨어진 뒤 한 번만 보내는 마무리 안내 */
const CLOSING_NOTICE =
    '(체험 대화는 여기까지예요. 실제 매칭에서는 상대와 자유롭게 대화할 수 있어요)';

// 바로 답하면 기계처럼 보여서 잠깐 뒤에 보낸다
const REPLY_DELAY_MS = 20 * 1000;

@Injectable()
export class ExperienceChatScheduler {
    private readonly logger = new Logger(ExperienceChatScheduler.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * 체험 채팅방에서 사용자가 보낸 뒤 답이 없는 방에 가상 상대의 답장을 보낸다.
     *
     * 요청을 받는 자리에서 setTimeout으로 보내지 않는 이유는,
     * 그 사이 서버가 재시작되면 답장이 사라지기 때문이다.
     * 스케줄러가 매번 "마지막 말이 사용자 것인가"를 보고 판단하면 재시작에도 끊기지 않는다.
     */
    @Cron(CronExpression.EVERY_10_SECONDS)
    async replyToExperienceChats() {
        const threshold = new Date(Date.now() - REPLY_DELAY_MS);

        const rooms = await this.prisma.chatRoom.findMany({
            where: {
                status: ChatRoomStatus.OPEN,
                matchAttempt: { isExperience: true },
            },
            select: {
                id: true,
                matchAttempt: {
                    select: {
                        matchingA: { select: { userId: true, user: { select: { isDummy: true } },},},
                        matchingB: { select: { userId: true, user: { select: { isDummy: true } },},},
                    },},
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { senderId: true, createdAt: true },
                },
            },
        });

        for (const room of rooms) {
            try {
                await this.replyIfNeeded(room, threshold);
            } catch (error) {
                this.logger.error(
                    `체험 채팅 답장 실패: room=${room.id}`,
                    error as Error,
                );
            }
        }
    }

    private async replyIfNeeded(
        room: {
            id: string;
            matchAttempt: {
                matchingA: { userId: string; user: { isDummy: boolean } };
                matchingB: { userId: string; user: { isDummy: boolean } };
            };
            messages: { senderId: string; createdAt: Date }[];
        },
        threshold: Date,
    ): Promise<void> {
        const { matchingA, matchingB } = room.matchAttempt;
        const dummy = matchingA.user.isDummy ? matchingA : matchingB;

        if (!dummy.user.isDummy) return;

        const last = room.messages[0];

        // 사용자가 먼저 말을 걸어야 답한다. 마지막 말이 더미 것이면 기다린다.
        if (!last || last.senderId === dummy.userId) return;

        // 방금 보낸 메시지에 곧바로 답하지 않는다
        if (last.createdAt > threshold) return;

        const sentCount = await this.prisma.chatMessage.count({
            where: { chatRoomId: room.id, senderId: dummy.userId },
        });

        // 준비한 답장을 다 썼고 마무리 안내까지 보냈으면 더는 답하지 않는다
        if (sentCount > DUMMY_REPLIES.length) return;

        const content =
            sentCount < DUMMY_REPLIES.length
                ? DUMMY_REPLIES[sentCount]
                : CLOSING_NOTICE;

        await this.prisma.chatMessage.create({
            data: {
                chatRoomId: room.id,
                senderId: dummy.userId,
                content,
            },
        });
    }
}