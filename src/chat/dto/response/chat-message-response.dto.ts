import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class ChatMessageResponseDto {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty()
    @Expose()
    content: string;

    @ApiProperty({ description: '내가 보낸 메시지인지' })
    @Expose()
    isMine: boolean;

    @ApiProperty()
    @Expose()
    createdAt: Date;
}

export class ChatMessageListResponseDto {
    @ApiProperty({ type: [ChatMessageResponseDto] })
    @Expose()
    @Type(() => ChatMessageResponseDto)
    messages: ChatMessageResponseDto[];

    @ApiProperty({
        nullable: true,
        description: '다음 페이지 요청 시 cursor로 넘길 값. null이면 마지막 페이지',
    })
    @Expose()
    nextCursor: string | null;

    @ApiProperty({ example: 27, description: '내가 더 보낼 수 있는 횟수' })
    @Expose()
    myRemainingCount: number;
}