// PATCH /courses/:courseId/missions/:missionId/photos/:photoId
// 올린 인증샷에 한마디를 쓰거나 고친다. 사진 자체는 바꾸지 않는다.
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateMissionPhotoDto {
  @ApiProperty({
    description: '한줄 코멘트. 빈 문자열이면 지운다',
    example: '떡볶이 진짜 맛있었다',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  comment: string;
}
