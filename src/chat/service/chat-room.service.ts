import {Injectable, Logger, NotFoundException} from "@nestjs/common";
import {ChatMessageService, MESSAGE_LIMIT_PER_USER} from "./chat-message.service";
import {PrismaService} from "../../prisma/prisma.service";
import {ChatRoomStatus} from "../../generated/prisma/enums";
import { StorageService } from "../../storage/storage.service";
import { toProfileImageUrl } from "../../common/profile-image-url.util";
import {calcAge} from "../../common/age.util";

type ChatRoomWriter = {
    chatRoom: { create: (args: any) => Promise<any> };
    chatMessageCount: { createMany: (args: any) => Promise<any> };
};

@Injectable()
export class ChatRoomService {
    private readonly logger = new Logger(ChatRoomService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly chatMessage: ChatMessageService,
        private readonly storage: StorageService,
    ) {}

    /**
     * 매칭이 취소되어 더 쓸 수 없게 된 채팅방을 닫는다.
     *
     * 코스를 못 만들어 환불한 경우에 부른다. 방을 남겨 두면 여행 정보는 없는데
     * 대화창만 살아 있어서, 두 사람이 무슨 일이 생긴 건지 모른 채 서로 묻게 된다.
     */
    async disableForAttempt(matchAttemptId: string): Promise<void> {
        await this.prisma.chatRoom.updateMany({
            where: { matchAttemptId },
            data: { status: ChatRoomStatus.DISABLED },
        });
    }

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
                    select: { usedCount: true, lastReadAt: true },
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

        const myCount = chatRoom.messageCounts.at(0);
        const usedCount = myCount?.usedCount ?? 0;

        const unreadCount = await this.chatMessage.countUnread(
            userId,
            chatRoom.id,
            myCount?.lastReadAt ?? null,
        );

        return {
            id: chatRoom.id,
            // 신고·차단 API가 이 값을 키로 받는다
            matchAttemptId: chatRoom.matchAttemptId,
            status: chatRoom.status,
            openAt: chatRoom.openAt,
            travelDate: matchAttempt.travelDate,
            isExperience: matchAttempt.isExperience,
            myRemainingCount: MESSAGE_LIMIT_PER_USER - usedCount,
            unreadCount,

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
                // 비공개 버킷이라 경로를 그대로 주면 열리지 않는다
                profileImageUrl: await toProfileImageUrl(
                    this.storage,
                    partnerProfile.profileImageUrl,
                ),
                fullBodyImageUrl: await toProfileImageUrl(
                    this.storage,
                    partnerProfile.fullBodyImageUrl,
                ),
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
                    select: { usedCount: true, lastReadAt: true },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { content: true, createdAt: true },
                },
            },
        });

        const rooms = await Promise.all(chatRooms.map(async (chatRoom) => {
            const { matchAttempt } = chatRoom;
            const isSideA = matchAttempt.matchingA.userId === userId;
            const partnerProfile = (
                isSideA ? matchAttempt.matchingB : matchAttempt.matchingA
            ).user.profile;

            const myCount = chatRoom.messageCounts.at(0);
            const usedCount = myCount?.usedCount ?? 0;
            const lastMessage = chatRoom.messages.at(0);

            const unreadCount = await this.chatMessage.countUnread(
                userId,
                chatRoom.id,
                myCount?.lastReadAt ?? null,
            );

            return {
                id: chatRoom.id,
                matchAttemptId: chatRoom.matchAttemptId,
                status: chatRoom.status,
                openAt: chatRoom.openAt,
                travelDate: matchAttempt.travelDate,
                isExperience: matchAttempt.isExperience,
                myRemainingCount: MESSAGE_LIMIT_PER_USER - usedCount,

                // 탈퇴 등으로 프로필이 사라졌을 경우
                partnerName: partnerProfile?.name ?? '알 수 없음',
                partnerProfileImageUrl: await toProfileImageUrl(
                    this.storage,
                    partnerProfile?.profileImageUrl,
                ),

                lastMessageContent: lastMessage?.content ?? null,
                lastMessageAt: lastMessage?.createdAt ?? null,
            };
        }));

        return { rooms };
    }

    /**
     * 채팅방 개방 시각 = 여행 전날 00:00 (KST).
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