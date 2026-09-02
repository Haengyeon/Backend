import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';

import {
    Gender,
    Hobby,
    JobCategory,
    Mbti,
} from '../../../generated/prisma/enums';

/**
 * 수락/거절 판단에 필요한 상대 정보.
 * 실명(name)과 생년월일(birthDate)은 개인정보라 절대 노출하지 않는다.
 * (나이는 서버에서 만나이로 계산해서 내려준다)
 */
export class PartnerProfileDto {
    @ApiProperty({ example: '짱정운' })
    @Expose()
    name: string;

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

    @ApiProperty({ example: '카페와 전시 보러 다니는 걸 좋아해요.' })
    @Expose()
    introduce: string;

    @ApiProperty({ enum: Hobby, isArray: true })
    @Expose()
    hobbies: Hobby[];

    @ApiProperty({ description: '전신 사진' })
    @Expose()
    fullBodyImageUrl: string;
}

export class MatchAttemptDetailResponseDto {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty({ example: 'WAITING_RESPONSE' })
    @Expose()
    status: string;

    @ApiProperty({ example: '2026-08-27', description: '확정된 여행 날짜' })
    @Expose()
    @Transform(({ value }) =>
        value instanceof Date ? value.toISOString().slice(0, 10) : value,
    )
    travelDate: string;

    @ApiProperty({ nullable: true })
    @Expose()
    paymentDeadlineAt: Date | null;

    @ApiProperty({ description: '내가 이미 응답을 보냈는지' })
    @Expose()
    myResponded: boolean;

    @ApiProperty({
        nullable: true,
        description: '내가 보낸 응답 (ACCEPTED | REJECTED), 아직이면 null',
    })
    @Expose()
    myDecision: string | null;

    @ApiProperty({ type: PartnerProfileDto })
    @Expose()
    @Type(() => PartnerProfileDto)
    partner: PartnerProfileDto;
}