import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
} from '../../service/course-query.service';

export class CourseHistoryQueryDto {
  @ApiPropertyOptional({
    default: HISTORY_DEFAULT_LIMIT,
    maximum: HISTORY_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(HISTORY_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description: '이전 응답의 nextCursor. 첫 페이지는 비워 둔다',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
