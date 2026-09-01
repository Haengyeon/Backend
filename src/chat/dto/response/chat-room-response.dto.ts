import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';

import {
    ChatRoomStatus,
    Gender,
    Hobby,
    JobCategory,
    Mbti,
} from '../../../generated/prisma/enums';

export class ChatPartnerProfileDto {
    @ApiProperty({ example: '짱정운' })
    @Expose()
    nickname: string;

    @ApiProperty({ example: 27, description: '만 나이' })
    @Expose()
    age: number;

    @ApiProperty({ enum: Gender })
    @Expose()
    gender: Gender;

    @ApiProperty({
        enum: JobCategory,
        nullable: true,
        description: 'jobPrivate가 true면 null',
    })
    @Expose()
    jobCategory: JobCategory | null;

    @ApiProperty({ enum: Mbti, nullable: true })
    @Expose()
    mbti: Mbti | null;

    @ApiProperty()
    @Expose()
    introduce: string;

    @ApiProperty({ enum: Hobby, isArray: true })
    @Expose()
    hobbies: Hobby[];

    @ApiProperty()
    @Expose()
    profileImageUrl: string;

    @ApiProperty()
    @Expose()
    fullBodyImageUrl: string;
}

export class ChatRoomResponseDto {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty({
        enum: ChatRoomStatus,
        description: 'LOCKED(여행 전날까지 대기) | OPEN(대화 가능)',
    })
    @Expose()
    status: ChatRoomStatus;

    @ApiProperty({ description: '채팅방이 열리는 시각 (여행 전날 00시 KST)' })
    @Expose()
    openAt: Date;

    @ApiProperty({ example: '2026-08-27' })
    @Expose()
    @Transform(({ value }) =>
        value instanceof Date ? value.toISOString().slice(0, 10) : value,
    )
    travelDate: string;

    @ApiProperty({ example: 30, description: '남은 메시지 횟수' })
    @Expose()
    myRemainingCount: number;

    @ApiProperty({ type: ChatPartnerProfileDto })
    @Expose()
    @Type(() => ChatPartnerProfileDto)
    partner: ChatPartnerProfileDto;
}