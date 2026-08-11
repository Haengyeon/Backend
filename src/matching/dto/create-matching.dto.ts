import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsDateString,
    IsEnum,
    IsInt,
    Min,
} from 'class-validator';

import {
    CourseTheme,
    PreferredGender,
    Region,
} from '../../generated/prisma/enums';

export class CreateMatchingDto {
    @IsEnum(Region)
    region: Region;

    @IsInt()
    @Min(1)
    maxDistanceKm: number;

    @IsInt()
    @Min(1)
    ageMin: number;

    @IsInt()
    @Min(1)
    ageMax: number;

    @IsEnum(PreferredGender)
    preferredGender: PreferredGender;

    // 테마 최소 1개 ~ 최대 3개
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(3)
    @ArrayUnique()
    @IsEnum(CourseTheme, { each: true })
    themes: CourseTheme[];

    // 여행 가능 날짜 최소 1개
    @IsArray()
    @ArrayMinSize(1)
    @ArrayUnique()
    @IsDateString({}, { each: true })
    availableDates: string[];
}