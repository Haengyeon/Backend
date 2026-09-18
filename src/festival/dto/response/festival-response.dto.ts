// GET /festivals 응답 형태
import { ApiProperty } from '@nestjs/swagger';

export class FestivalDto {
  @ApiProperty({ example: '4107768', description: 'TourAPI 원본 ID' })
  contentId: string;

  @ApiProperty({ example: '국립현대무용단 〈자리와 주름: 영월〉' })
  name: string;

  @ApiProperty({ example: '2026-09-16' })
  startDate: string;

  @ApiProperty({ example: '2026-09-19' })
  endDate: string;

  @ApiProperty({
    example:
      'https://tong.visitkorea.or.kr/cms/resource/84/4107784_image2_1.jpg',
    description:
      '포스터. 공공누리 제3유형이라 출처(한국관광공사)를 표시해야 한다',
  })
  imageUrl: string;

  @ApiProperty({ example: '강원특별자치도 영월군 북면 밤재로 231-9' })
  address: string;
}

export class FestivalListResponseDto {
  @ApiProperty({ type: [FestivalDto] })
  items: FestivalDto[];

  @ApiProperty({ nullable: true, description: '다음 페이지 커서' })
  nextCursor: string | null;

  @ApiProperty()
  hasMore: boolean;
}
