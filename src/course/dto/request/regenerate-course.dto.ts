import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RegenerateCourseDto {
  @ApiProperty({
    description: '코스를 다시 만들 매칭 시도 ID',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsString()
  @IsNotEmpty()
  matchAttemptId: string;
}
