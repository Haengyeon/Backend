// GET /courses/recommended 응답 형태
import { ApiProperty } from '@nestjs/swagger';
import { Region } from '../../../generated/prisma/enums';

export class RecommendedSpotDto {
  @ApiProperty({ example: '2735542', description: 'TourAPI 원본 ID' })
  contentId: string;

  @ApiProperty({ example: '노룬산골목시장' })
  name: string;

  @ApiProperty({
    enum: Region,
    nullable: true,
    description: '전국 조회는 주소에서 되짚는다. 못 알아보면 null',
  })
  region: Region | null;

  @ApiProperty({ nullable: true, example: '전통시장' })
  category: string | null;

  @ApiProperty({ example: '서울특별시 광진구 자양로' })
  address: string;

  @ApiProperty({ example: 37.5501 })
  latitude: number;

  @ApiProperty({ example: 127.0721 })
  longitude: number;

  @ApiProperty({ nullable: true })
  imageUrl: string | null;
}

export class RecommendedResponseDto {
  @ApiProperty({ type: [RecommendedSpotDto] })
  items: RecommendedSpotDto[];

  @ApiProperty({ nullable: true, description: '다음 페이지 커서' })
  nextCursor: string | null;

  @ApiProperty()
  hasMore: boolean;
}
