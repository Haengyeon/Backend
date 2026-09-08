import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';

import { ChatRoomStatus } from '../../../generated/prisma/enums';

export class ChatRoomSummaryDto {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty({ description: '신고·차단 API가 이 값을 키로 받는다' })
    @Expose()
    matchAttemptId: string;

    @ApiProperty({ enum: ChatRoomStatus })
    @Expose()
    status: ChatRoomStatus;

    @ApiProperty()
    @Expose()
    openAt: Date;

    @ApiProperty({ example: '2026-08-27' })
    @Expose()
    @Transform(({ value }) =>
        value instanceof Date ? value.toISOString().slice(0, 10) : value,
    )
    travelDate: string;

    @ApiProperty({ example: 27, description: '내가 더 보낼 수 있는 메시지 횟수' })
    @Expose()
    myRemainingCount: number;

    @ApiProperty({ example: '짱정운' })
    @Expose()
    partnerName: string;

    @ApiProperty()
    @Expose()
    partnerProfileImageUrl: string;

    @ApiProperty({
        nullable: true,
        description: '마지막 메시지. 아직 대화가 없으면 null',
    })
    @Expose()
    lastMessageContent: string | null;

    @ApiProperty({ nullable: true })
    @Expose()
    lastMessageAt: Date | null;
}

export class ChatRoomListResponseDto {
    @ApiProperty({ type: [ChatRoomSummaryDto] })
    @Expose()
    @Type(() => ChatRoomSummaryDto)
    rooms: ChatRoomSummaryDto[];
}