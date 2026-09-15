import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches } from 'class-validator';

import { Region } from '../../../generated/prisma/enums';

/**
 * 희망 지역 한 곳. 시·도와 시군구를 함께 받음
 * 시군구 코드는 시·도 안에서만 유일
 * (서울의 '1'은 강남구, 부산의 '1'은 강서구)
 * 그래서 둘을 항상 쌍으로 다뤄야 한다.
 */
export class RegionPreferenceDto {
    @ApiProperty({ enum: Region, example: Region.SEOUL })
    @IsEnum(Region)
    region: Region;

    @ApiProperty({
        example: '1',
        description: 'TourAPI 시군구 코드. 서울 기준 1 = 강남구',
    })
    @IsString()
    @Matches(/^\d{1,3}$/, {
        message: 'sigunguCode는 숫자 형식이어야 합니다.',
    })
    sigunguCode: string;
}