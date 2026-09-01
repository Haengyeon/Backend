import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const SPOT_REVIEW_DEFAULT_LIMIT = 10;
export const SPOT_REVIEW_MAX_LIMIT = 30;

export class SpotReviewQueryDto {
  @ApiPropertyOptional({
    default: SPOT_REVIEW_DEFAULT_LIMIT,
    maximum: SPOT_REVIEW_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SPOT_REVIEW_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description: '이전 응답의 nextCursor. 첫 페이지는 비워 둔다',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
