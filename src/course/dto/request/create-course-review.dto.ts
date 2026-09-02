// POST /courses/:courseId/reviews
// 상대·코스·장소 후기를 한 번에 보낸다.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SPOT_COUNT } from '../../algorithm/course-template';

// 코스에 들어간 장소 한 곳에 대한 후기
export class SpotReviewItemDto {
  @ApiProperty({ description: '코스 상세의 spots[].id' })
  @IsString()
  @IsNotEmpty()
  spotId: string;

  @ApiProperty({
    example: '자리가 좁아서 주말엔 대기가 길어요.',
    maxLength: 300,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  content: string;
}

// 데이트를 마치고 한 화면에서 한 번에 보낸다.
// 세 후기가 공개 범위와 저장 위치가 달라 테이블은 나뉘어 있지만,
// 쓰는 시점이 같아서 요청은 하나로 받는다.
//
//   partnerReview  상대가 어땠나   필수   나 + 상대 + 운영진
//   courseReview   코스가 어땠나   선택   나 + 운영진
//   spotReviews    장소가 어땠나   선택   전체 공개(익명)
export class CreateCourseReviewDto {
  @ApiProperty({
    description: '함께 다녀온 상대에 대한 후기. 상대에게 알림이 간다',
    example: '시간도 잘 지키시고 대화가 편했어요.',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  partnerReview: string;

  @ApiPropertyOptional({
    description:
      '코스 자체에 대한 한줄평. 본인과 운영진만 본다. ' +
      '이상한 코스를 알고리즘 쪽에서 걸러내는 데 쓴다',
    example: '4곳은 좀 많았어요. 이동이 빡셌습니다',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  courseReview?: string;

  @ApiPropertyOptional({
    type: [SpotReviewItemDto],
    description: '쓴 장소만 골라 담으면 된다. 익명으로 전체 공개된다',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SPOT_COUNT)
  @ValidateNested({ each: true })
  @Type(() => SpotReviewItemDto)
  spotReviews?: SpotReviewItemDto[];
}
