// 매칭이 이미 성사된 상태로 가정하고 두 사람의 공통 조건만 넣을 수 있게 해주는 DTO
// DB 관계 타지 않지 않으므로 진짜 openAPI만 이용해서 코스 구성해줄 수 있게 해줌
// swagger request body 에 들어가는 dto
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

import { CourseTheme, Hobby, Region } from '../../generated/prisma/enums';
import { normalizeEnum, normalizeEnumArray } from './normalize';
export class GenerateCoursePreviewDto {
  @ApiProperty({
    enum: Region,
    enumName: 'Region',
    description: '여행 지역',
    example: Region.SEOUL,
  })
  @Transform(normalizeEnum)
  @IsEnum(Region)
  region: Region;

  @ApiProperty({
    enum: CourseTheme,
    enumName: 'CourseTheme',
    isArray: true,
    description:
      '두 사람의 공통 테마 (1~2개). 2개면 공통 취미 연관도 합산으로 1개를 확정한다.',
    example: [CourseTheme.PHOTO_SPOT, CourseTheme.LOCAL_FOOD_MARKET],
  })
  @Transform(normalizeEnumArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsEnum(CourseTheme, { each: true })
  commonThemes: CourseTheme[];

  @ApiProperty({
    enum: Hobby,
    enumName: 'Hobby',
    isArray: true,
    description:
      '두 사람의 공통 취미 (1~3개). 확정 테마와의 연관도가 2점 이상인 것만 스팟에 반영된다.',
    example: [Hobby.PHOTO, Hobby.CAFE, Hobby.FOOD],
  })
  @Transform(normalizeEnumArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsEnum(Hobby, { each: true })
  commonHobbies: Hobby[];

  @ApiPropertyOptional({
    description:
      '같은 조건에서 다른 코스를 뽑고 싶을 때 바꾼다. 실제로는 matchAttemptId가 들어간다.',
    example: 'demo-1',
  })
  @IsOptional()
  @IsString()
  seed?: string;
}
