import {Injectable, Logger, NotFoundException} from "@nestjs/common";
import {MESSAGE_LIMIT_PER_USER} from "./chat-message.service";
import {PrismaService} from "../../prisma/prisma.service";
import {ChatRoomStatus} from "../../generated/prisma/enums";
import {calcAge} from "../../common/age.util";

type ChatRoomWriter = {
    chatRoom: { create: (args: any) => Promise<any> };
    chatMessageCount: { createMany: (args: any) => Promise<any> };
};

@Injectable()
export class ChatRoomService {
    private readonly logger = new Logger(ChatRoomService.name);

    constructor(private readonly prisma: PrismaService) {}

    // 결제가 양쪽 다 완료되어 매칭이 확정된 시점에 호출
    // 채팅방은 바로 열리지 않고 여행 전날 00시에 open으로 바뀜
    async createForConfirmedAttempt(
        tx: ChatRoomWriter,
        params: {
            matchAttemptId: string;
            travelDate: Date;
            userIds: string[];
        },
    ) {
        const openAt = ChatRoomService.calcOpenAt(params.travelDate);

        const chatRoom = await tx.chatRoom.create({
            data: {
                matchAttemptId: params.matchAttemptId,
                status: ChatRoomStatus.LOCKED,
                openAt,
            },
        });

        // 메시지 사용 횟수 관리
        await tx.chatMessageCount.createMany({
            data: params.userIds.map((userId) => ({
                chatRoomId: chatRoom.id,
                userId,
            })),
        });

        this.logger.log(
            `채팅방 생성: room=${chatRoom.id}, openAt=${openAt.toISOString()}`,
        );

        return chatRoom;
    }

    // 내 현재 채팅방 - 상대 프로필 조회
    async findMyActive(userId: string) {
        const chatRoom = await this.prisma.chatRoom.findFirst({
            where: {
                status: { in: [ChatRoomStatus.LOCKED, ChatRoomStatus.OPEN] },
                matchAttempt: {
                    OR: [
                        { matchingA: { userId }},
                        { matchingB: { userId } },
                    ],
                },
            },
            orderBy: { createdAt: 'desc' },
            include: {
                matchAttempt: {
                    include: {
                        matchingA: {
                            select: {
                                userId: true,
                                user: { select: { profile: true }},
                            },
                        },
                        matchingB: {
                            select: {
                                userId: true,
                                user: { select: { profile: true }},
                            },
                        },
                    },
                },
                messageCounts: {
                    where: { userId },
                    select: { usedCount: true },
                },
            },
        });

        if (!chatRoom) {
            throw new NotFoundException('채팅방이 없습니다.');
        }
        const { matchAttempt } = chatRoom;
        const isSideA = matchAttempt.matchingA.userId === userId;
        const partnerSide = isSideA
            ? matchAttempt.matchingB
            : matchAttempt.matchingA;

        const partnerProfile =partnerSide.user.profile;

        if (!partnerProfile) {
            throw new NotFoundException('상대방 프로필을 찾을 수 없습니다.');
        }

        const usedCount = chatRoom.messageCounts.at(0)?.usedCount ?? 0;

        return {
            id: chatRoom.id,
            // 신고·차단 API가 이 값을 키로 받는다
            matchAttemptId: chatRoom.matchAttemptId,
            status: chatRoom.status,
            openAt: chatRoom.openAt,
            travelDate: matchAttempt.travelDate,
            myRemainingCount: MESSAGE_LIMIT_PER_USER - usedCount,

            partner: {
                name: partnerProfile.name,
                age: calcAge(partnerProfile.birthDate),
                gender: partnerProfile.gender,
                jobCategory: partnerProfile.jobPrivate
                    ? null
                    : partnerProfile.jobCategory,
                mbti: partnerProfile.mbti,
                introduce: partnerProfile.introduce,
                hobbies: partnerProfile.hobbies,
                profileImageUrl: partnerProfile.profileImageUrl,
                fullBodyImageUrl: partnerProfile.fullBodyImageUrl,
            },
        };
    }

    /**
     * 내 채팅방 목록.
     * 활성 방(LOCKED/OPEN)뿐 아니라 종료·차단된 방까지 모두 최신순으로 돌려줌
     * 목록에서는 상대 이름과 사진만 필요하므로 프로필 전체를 담지 않음.
     */
    async findMine(userId: string) {
        const chatRooms = await this.prisma.chatRoom.findMany({
            where: {
                matchAttempt: {
                    OR: [
                        { matchingA: { userId } },
                        { matchingB: { userId } },
                    ],
                },
            },
            orderBy: { createdAt: 'desc' },
            include: {
                matchAttempt: {
                    include: {
                        matchingA: {
                            select: {
                                userId: true,
                                user: { select: { profile: true } },
                            },
                        },
                        matchingB: {
                            select: {
                                userId: true,
                                user: { select: { profile: true } },
                            },
                        },
                    },
                },
                messageCounts: {
                    where: { userId },
                    select: { usedCount: true },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { content: true, createdAt: true },
                },
            },
        });

        const rooms = chatRooms.map((chatRoom) => {
            const { matchAttempt } = chatRoom;
            const isSideA = matchAttempt.matchingA.userId === userId;
            const partnerProfile = (
                isSideA ? matchAttempt.matchingB : matchAttempt.matchingA
            ).user.profile;

            const usedCount = chatRoom.messageCounts.at(0)?.usedCount ?? 0;
            const lastMessage = chatRoom.messages.at(0);

            return {
                id: chatRoom.id,
                matchAttemptId: chatRoom.matchAttemptId,
                status: chatRoom.status,
                openAt: chatRoom.openAt,
                travelDate: matchAttempt.travelDate,
                myRemainingCount: MESSAGE_LIMIT_PER_USER - usedCount,

                // 탈퇴 등으로 프로필이 사라졌을 경우
                partnerName: partnerProfile?.name ?? '알 수 없음',
                partnerProfileImageUrl: partnerProfile?.profileImageUrl ?? '',

                lastMessageContent: lastMessage?.content ?? null,
                lastMessageAt: lastMessage?.createdAt ?? null,
            };
        });

        return { rooms };
    }

    /**
     * 채팅방 개방 시각 = 여행 전날 00:00 (KST).
     *
     * travelDate는 @db.Date라 UTC 자정으로 저장돼 있다.
     * 거기서 하루를 빼고, KST 자정이 되도록 9시간을 앞당긴다.
     * 예) travelDate 2026-08-27 -> 2026-08-26 00:00 KST -> 2026-08-25T15:00:00Z
     */
    static calcOpenAt(travelDate: Date): Date {
        const year = travelDate.getUTCFullYear();
        const month = travelDate.getUTCMonth();
        const day = travelDate.getUTCDate();

        const kstMidnightPrevDay = Date.UTC(year, month, day - 1);

        return new Date(kstMidnightPrevDay - 9 * 60 * 60 * 1000);
    }

}