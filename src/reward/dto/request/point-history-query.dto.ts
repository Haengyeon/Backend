import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  POINT_HISTORY_DEFAULT_LIMIT,
  POINT_HISTORY_MAX_LIMIT,
} from '../../service/point.service';

export class PointHistoryQueryDto {
  @ApiPropertyOptional({
    default: POINT_HISTORY_DEFAULT_LIMIT,
    maximum: POINT_HISTORY_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(POINT_HISTORY_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description: '이전 응답의 nextCursor. 첫 페이지는 비워 둔다',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
