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
} from '../../generated/prisma/enums';

export class CreateMatchingDto {
    @ApiProperty({
        enum: Region,
        example: Region.SEOUL,
    })
    @IsEnum(Region)
    region: Region;

    @ApiProperty({
        example: 30,
        description: '허용 이동 거리(km)',
    })
    @IsInt()
    @Min(1)
    maxDistanceKm: number;

    @ApiProperty({
        example: 20,
    })
    @IsInt()
    @Min(1)
    ageMin: number;

    @ApiProperty({
        example: 30,
    })
    @IsInt()
    @Min(1)
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