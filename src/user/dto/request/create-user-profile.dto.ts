import { ApiProperty } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsOptional,
    IsString,
    IsUrl,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator';

import {
    Gender,
    Hobby,
    JobCategory,
    Mbti,
} from '../../../generated/prisma/enums';

export class CreateUserProfileDto {
    @ApiProperty({ example: '김민준', maxLength: 20 })
    @IsString()
    @MinLength(1)
    @MaxLength(20)
    name: string;

    @ApiProperty({
        example: '1998-05-12',
        description: '생년월일. 나이는 서버가 이 값으로 계산한다.',
    })
    @IsDateString({ strict: true })
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'birthDate는 YYYY-MM-DD 형식이어야 합니다.',
    })
    birthDate: string;

    @ApiProperty({ enum: Gender })
    @IsEnum(Gender)
    gender: Gender;

    @ApiProperty({ enum: Mbti, required: false })
    @IsOptional()
    @IsEnum(Mbti)
    mbti?: Mbti;

    @ApiProperty({
        example: '맛집이랑 사진 찍는 걸 좋아해요.',
        maxLength: 200,
    })
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    introduce: string;

    @ApiProperty({ enum: JobCategory })
    @IsEnum(JobCategory)
    jobCategory: JobCategory;

    @ApiProperty({
        example: false,
        description: 'true면 상대에게 직업을 노출하지 않는다.',
        required: false,
    })
    @IsOptional()
    @IsBoolean()
    jobPrivate?: boolean;

    @ApiProperty({
        enum: Hobby,
        isArray: true,
        example: [Hobby.CAFE, Hobby.FOOD, Hobby.PHOTO],
        description: '최소 1개, 최대 5개',
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(5)
    @ArrayUnique()
    @IsEnum(Hobby, { each: true })
    hobbies: Hobby[];

    @ApiProperty({ description: '프로필 사진 URL' })
    @IsUrl()
    @MaxLength(500)
    profileImageUrl: string;

    @ApiProperty({ description: '전신 사진 URL' })
    @IsUrl()
    @MaxLength(500)
    fullBodyImageUrl: string;
}