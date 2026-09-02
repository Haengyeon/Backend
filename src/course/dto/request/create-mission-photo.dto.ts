// POST /courses/:courseId/missions/:missionId/photos 
// 인증샷에 붙는 한 줄.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// 사진 자체는 multipart의 file 필드로 받는다. 여기는 같이 오는 텍스트만 검증한다.
export class CreateMissionPhotoDto {
  @ApiPropertyOptional({
    description: '한줄 코멘트',
    example: '떡볶이 진짜 맛있었다',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  comment?: string;
}
