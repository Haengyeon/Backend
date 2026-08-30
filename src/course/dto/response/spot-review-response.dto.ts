// 관광지 후기 응답 형태
//
// 익명 공개라 작성자를 알 수 있는 값(userId, 닉네임)은 내보내지 않는다.
// 내가 쓴 것인지만 isMine으로 알려 준다.
import { ApiProperty } from '@nestjs/swagger';

export class SpotReviewDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '자리가 좁아서 주말엔 대기가 길어요.' })
  content: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ description: '요청자 본인이 쓴 후기인지' })
  isMine: boolean;
}

export class SpotReviewListResponseDto {
  @ApiProperty({ example: '2553908', description: '한국관광공사 원본 ID' })
  contentId: string;

  @ApiProperty({ example: 12, description: '이 장소에 쌓인 후기 총 개수' })
  totalCount: number;

  @ApiProperty({ type: [SpotReviewDto] })
  items: SpotReviewDto[];

  @ApiProperty({ nullable: true })
  nextCursor: string | null;

  @ApiProperty()
  hasMore: boolean;
}
