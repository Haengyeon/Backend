import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { ChatRoomStatus } from '../../generated/prisma/enums';
import { CreateChatMessageDto } from '../dto/request/chat-message.dto';

export const MESSAGE_LIMIT_PER_USER = 30; // 1인당 채팅 횟수
const DEFAULT_PAGE_SIZE = 30;

@Injectable()
export class ChatMessageService {
    constructor(private readonly prisma: PrismaService) {}

    async send(
        userId: string,
        chatRoomId: string,
        dto: CreateChatMessageDto,
    ) {
        await this.validateParticipant(userId, chatRoomId, {
            requireOpen: true,
        });

        // 한도 검증
        return this.prisma.$transaction(async (tx) => {
            const countRow = await tx.chatMessageCount.findUnique({
                where: {
                    chatRoomId_userId: { chatRoomId, userId },
                },
            });

            if (!countRow) {
                throw new NotFoundException('채팅자의 정보를 찾을 수 없습니다.');
            }

            if (countRow.usedCount >= MESSAGE_LIMIT_PER_USER) {
                throw new ConflictException(
                    `메시지는 ${MESSAGE_LIMIT_PER_USER}회까지만 보낼 수 있습니다.`,
                );
            }

            const message = await tx.chatMessage.create({
                data: {
                    chatRoomId,
                    senderId: userId,
                    content: dto.content,
                },
            });

            const updated = await tx.chatMessageCount.update({
                where: {
                    chatRoomId_userId: { chatRoomId, userId },
                },
                data: { usedCount: { increment: 1 } },
            });

            return {
                id: message.id,
                content: message.content,
                isMine: true,
                createdAt: message.createdAt,
                myRemainingCount: MESSAGE_LIMIT_PER_USER - updated.usedCount,
            };
        });
    }

    //메시지 목록 조회 - 최신순
    async findMessages(
        userId: string,
        chatRoomId: string,
        cursor?: string,
        limit: number = DEFAULT_PAGE_SIZE,
    ) {
        await this.validateParticipant(userId, chatRoomId, {
            requireOpen: false,
        });

        const messages = await this.prisma.chatMessage.findMany({
            where: { chatRoomId },
            orderBy: { createdAt: 'desc' },
            take: limit + 1, // 다음 페이지 존재 여부 확인용으로 1개 더
            ...(cursor && {
                cursor: { id: cursor },
                skip: 1,
            }),
        });

        const hasNext = messages.length > limit;
        const pageItems = hasNext ? messages.slice(0, limit) : messages;

        const countRow = await this.prisma.chatMessageCount.findUnique({
            where: {
                chatRoomId_userId: { chatRoomId, userId },
            },
            select: { usedCount: true },
        });

        return {
            messages: pageItems.map((message) => ({
                id: message.id,
                content: message.content,
                isMine: message.senderId === userId,
                createdAt: message.createdAt,
            })),
            nextCursor: hasNext ? pageItems[pageItems.length - 1].id : null,
            myRemainingCount:
                MESSAGE_LIMIT_PER_USER - (countRow?.usedCount ?? 0),
        };
    }

    /** 참여자인지, (전송이면) 채팅방이 열려 있는지 검증 */
    private async validateParticipant(
        userId: string,
        chatRoomId: string,
        options: { requireOpen: boolean },
    ) {
        const chatRoom = await this.prisma.chatRoom.findUnique({
            where: { id: chatRoomId },
            include: {
                matchAttempt: {
                    select: {
                        matchingA: { select: { userId: true } },
                        matchingB: { select: { userId: true } },
                    },
                },
            },
        });

        if (!chatRoom) {
            throw new NotFoundException('채팅방을 찾을 수 없습니다.');
        }

        const { matchingA, matchingB } = chatRoom.matchAttempt;
        const isParticipant =
            matchingA.userId === userId || matchingB.userId === userId;

        if (!isParticipant) {
            throw new ForbiddenException('해당 채팅방에 대한 권한이 없습니다.');
        }

        if (options.requireOpen && chatRoom.status !== ChatRoomStatus.OPEN) {
            const reason = {
                [ChatRoomStatus.LOCKED]: '아직 열리지 않은 채팅방입니다.',
                [ChatRoomStatus.CLOSED]: '종료된 채팅방입니다.',
                [ChatRoomStatus.DISABLED]: '사용할 수 없는 채팅방입니다.',
            }[chatRoom.status];

            throw new ConflictException(reason ?? '메시지를 보낼 수 없습니다.');
        }

        return chatRoom;
    }
}