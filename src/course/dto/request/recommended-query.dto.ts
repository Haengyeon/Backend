// GET /courses/recommended
// 홈의 추천 관광지 목록.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const RECOMMEND_DEFAULT_LIMIT = 10;
export const RECOMMEND_MAX_LIMIT = 30;

// 지역·테마를 받지 않는다.
// 프로필에 지역이 없어서 어디를 추천할지 물어볼 근거가 없고,
// 테마는 사용자가 고르는 값이 아니라 취미에서 유도하는 값이다.
export class RecommendedQueryDto {
  @ApiPropertyOptional({
    default: RECOMMEND_DEFAULT_LIMIT,
    maximum: RECOMMEND_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(RECOMMEND_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description: '이전 응답의 nextCursor. 첫 페이지는 비워 둔다',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
