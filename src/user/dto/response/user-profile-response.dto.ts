import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import {
    Gender,
    Hobby,
    JobCategory,
    Mbti,
} from '../../../generated/prisma/enums';

export class UserProfileResponseDto {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty({ example: '김민준' })
    @Expose()
    name: string;

    @ApiProperty({ example: 28, description: '생년월일로 계산한 만 나이' })
    @Expose()
    age: number;

    @ApiProperty({ enum: Gender })
    @Expose()
    gender: Gender;

    @ApiProperty({ enum: Mbti, nullable: true })
    @Expose()
    mbti: Mbti | null;

    @ApiProperty()
    @Expose()
    introduce: string;

    @ApiProperty({ enum: JobCategory })
    @Expose()
    jobCategory: JobCategory;

    @ApiProperty({ description: 'true면 상대에게 직업이 노출되지 않는다' })
    @Expose()
    jobPrivate: boolean;

    @ApiProperty({ enum: Hobby, isArray: true })
    @Expose()
    hobbies: Hobby[];

    @ApiProperty()
    @Expose()
    profileImageUrl: string;

    @ApiProperty()
    @Expose()
    fullBodyImageUrl: string;

    @ApiProperty()
    @Expose()
    createdAt: Date;
}