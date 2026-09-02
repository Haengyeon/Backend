// GET /rewards/stamps 응답 형태
import { ApiProperty } from '@nestjs/swagger';
import { Region } from '../../../generated/prisma/enums';

export class StampDto {
  @ApiProperty({ enum: Region })
  region: Region;

  @ApiProperty({ example: '서울' })
  regionLabel: string;

  @ApiProperty({
    nullable: true,
    example: '중구',
    description:
      '대응표에 없는 코드면 null. regionLabel과 이어 붙이면 "서울 중구"가 된다',
  })
  sigunguName: string | null;

  @ApiProperty({
    example: '11020',
    description:
      '지도에서 칠할 칸. 지도 파일(southkorea-maps kostat/2018)의 SIG_CD와 맞춰져 있다. ' +
      '수집 지도는 이 값들을 모아 색칠하면 된다',
  })
  mapSigunguCode: string;

  @ApiProperty({ description: '이 스탬프를 준 코스' })
  courseId: string;

  @ApiProperty()
  earnedAt: Date;
}

export class StampCollectionResponseDto {
  @ApiProperty({ example: 3, description: '모은 스탬프 수' })
  collectedCount: number;

  @ApiProperty({
    example: 250,
    description: '지도 전체 칸 수. collectedCount와 함께 수집률이 된다',
  })
  totalCount: number;

  @ApiProperty({
    example: 2,
    description:
      '스탬프가 걸쳐 있는 시·도 수. 250칸 기준으로는 진척이 잘 안 보여서 ' +
      '"17곳 중 2곳"을 같이 낼 수 있게 둔다',
  })
  regionCount: number;

  @ApiProperty({ example: 17, description: '시·도 전체 수' })
  totalRegionCount: number;

  @ApiProperty({
    type: [StampDto],
    description: '최근에 찍힌 것부터',
  })
  stamps: StampDto[];
}
