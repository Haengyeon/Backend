import { ApiProperty } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    ValidateNested,
    IsInt,
    IsOptional,
    Matches,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import {
    CourseTheme,
    PreferredGender,
    Region,
} from '../../../generated/prisma/enums';
import { RegionPreferenceDto } from './region-preference.dto';

export class CreateMatchingDto {
    @ApiProperty({
        type: [RegionPreferenceDto],
        description:
            '희망 지역. 앞에 넣을수록 높은 순위다(1순위 → 5순위). ' +
            '최소 1개, 최대 5개. 매칭은 시군구가 겹쳐야 성사된다.',
        example: [
            { region: Region.SEOUL, sigunguCode: '1' },
            { region: Region.GYEONGGI, sigunguCode: '11' },
        ],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(5)
    // 객체 배열이라 비교 키를 직접 준다.
    @ArrayUnique(
        (pref: RegionPreferenceDto) => `${pref.region}:${pref.sigunguCode}`,
    )
    @ValidateNested({ each: true })
    @Type(() => RegionPreferenceDto)
    regionPreferences: RegionPreferenceDto[];

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

    @ApiProperty({
        example: false,
        required: false,
        description:
            '체험 매칭 여부. true면 가상 프로필과 매칭되고 여행일은 오늘로 고정된다 ' +
            '(availableDates를 보내도 무시).',
    })
    @IsOptional()
    @IsBoolean()
    isExperience?: boolean;
}