// GET /rewards/points, GET /rewards/points/history 응답 형태
import { ApiProperty } from '@nestjs/swagger';
import { PointTransactionType } from '../../../generated/prisma/enums';

export class PointResponseDto {
  @ApiProperty({
    example: 3000,
    description:
      '마이페이지에 띄우는 포인트. 한 번도 안 받았으면 0. ' +
      '포인트 사용이 생기면 쓰고 남은 값이 되므로, 총 적립을 따로 보여줘야 할 때 ' +
      'totalEarned를 옆에 붙인다',
  })
  points: number;
}

export class PointHistoryItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({
    enum: PointTransactionType,
    description: '지금은 EARN만 쌓인다. 포인트 사용은 아직 열지 않았다',
  })
  type: PointTransactionType;

  @ApiProperty({
    example: 1000,
    description:
      '이번에 오간 포인트. 사용·소멸이 열리면 음수가 들어올 수 있어 points가 아니라 amount다',
  })
  amount: number;

  @ApiProperty({ example: 3000, description: '이 건까지 반영한 포인트' })
  pointsAfter: number;

  @ApiProperty({
    example: '서울 로컬 맛집 코스',
    description:
      '화면에 그대로 쓰는 사유. 코스로 받은 포인트면 코스 이름이 들어간다',
  })
  reason: string;

  @ApiProperty({
    example: 'COURSE_COMPLETE',
    description: '적립 종류를 가르는 코드. 화면에 쓰지 말고 reason을 쓴다',
  })
  reasonCode: string;

  @ApiProperty({
    nullable: true,
    description: '코스로 받은 포인트면 그 코스. 눌러서 기록으로 넘어갈 수 있다',
  })
  courseId: string | null;

  @ApiProperty({ description: '적립일시' })
  createdAt: Date;
}

export class PointHistoryResponseDto {
  @ApiProperty({ type: [PointHistoryItemDto] })
  items: PointHistoryItemDto[];

  @ApiProperty({ nullable: true, description: '다음 페이지 커서' })
  nextCursor: string | null;

  @ApiProperty()
  hasMore: boolean;
}
