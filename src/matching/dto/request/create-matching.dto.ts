import { ApiProperty } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsDateString,
    IsEnum,
    IsInt,
    Matches,
    Min,
} from 'class-validator';

import {
    CourseTheme,
    PreferredGender,
    Region,
} from '../../../generated/prisma/enums';

export class CreateMatchingDto {
    @ApiProperty({
        enum: Region,
        isArray: true,
        example: [Region.SEOUL, Region.GYEONGGI],
        description: '여행 희망 지역. 최소 1개, 최대 3개',
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(3)
    @ArrayUnique()
    @IsEnum(Region, { each: true })
    regions: Region[];

    // 미성년자와의 매칭을 원천 차단하기 위해 20세 미만은 선호 나이로 설정 불가
    @ApiProperty({
        example: 20,
        minimum: 20,
        description: '선호 상대 최소 나이 (20세 미만 설정 불가)',
    })
    @IsInt()
    @Min(20, { message: '선호 상대 나이는 20세 이상으로만 설정할 수 있습니다.' })
    ageMin: number;

    @ApiProperty({
        example: 30,
        minimum: 20,
        description: '선호 상대 최대 나이 (20세 미만 설정 불가)',
    })
    @IsInt()
    @Min(20, { message: '선호 상대 나이는 20세 이상으로만 설정할 수 있습니다.' })
    ageMax: number;

    @ApiProperty({
        enum: PreferredGender,
        example: PreferredGender.FEMALE,
    })
    @IsEnum(PreferredGender)
    preferredGender: PreferredGender;

    @ApiProperty({
        enum: CourseTheme,
        isArray: true,
        example: [CourseTheme.PHOTO_SPOT, CourseTheme.LOCAL_FOOD_MARKET],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(3)
    @ArrayUnique()
    @IsEnum(CourseTheme, { each: true })
    themes: CourseTheme[];

    @ApiProperty({
        type: [String],
        example: ['2026-08-20', '2026-08-23'],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayUnique()
    @IsDateString({}, { each: true })
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        each: true,
        message: 'availableDates는 YYYY-MM-DD 형식이어야 합니다.',
    })
    availableDates: string[];
}