// GET /festivals
// 홈 하단의 진행중인 축제·공연·행사 목록.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const FESTIVAL_DEFAULT_LIMIT = 12;
export const FESTIVAL_MAX_LIMIT = 30;

export class FestivalQueryDto {
  @ApiPropertyOptional({
    default: FESTIVAL_DEFAULT_LIMIT,
    maximum: FESTIVAL_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(FESTIVAL_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description: '이전 응답의 nextCursor. 첫 페이지는 비워 둔다',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
