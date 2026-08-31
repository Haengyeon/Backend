// 내가 쓴 후기와 상대가 나에게 쓴 후기.
// 완료된 코스의 GET /courses/:courseId 응답에 review로 실려 나간다.
//
// 상대 후기는 상호 공개다. 상대가 썼다는 알림은 바로 가지만,
// 내가 쓰기 전에는 내용을 보여주지 않는다.
// 먼저 읽은 쪽이 거기 맞춰 쓰게 되는 걸 막고, 서로 솔직하게 쓰게 하려는 것이다.
//
//   myPartnerReview        내가 상대에게 쓴 것
//   partnerReviewArrived   상대가 썼는지         ← 잠겨 있어도 true
//   receivedPartnerReview  상대가 쓴 내용         ← 내가 써야 채워진다
//   myCourseReview         내가 코스에 쓴 것 (상대는 못 본다)
//   mySpotReviews          내가 장소에 쓴 것 (남들은 익명으로 본다)
import { ApiProperty } from '@nestjs/swagger';
import {
  PartnerReviewDto,
  SavedSpotReviewDto,
} from './course-progress-response.dto';

// 후기 작성 응답도 같은 모양을 쓴다. 정의는 한 곳(course-progress-response)에 두고
// 여기서는 다시 내보내기만 한다 — 두 파일이 서로를 import하면 순환이 된다.
export { PartnerReviewDto };

export class MyReviewResponseDto {
  @ApiProperty()
  courseId: string;

  @ApiProperty({
    type: PartnerReviewDto,
    nullable: true,
    description: '내가 상대에게 쓴 후기. 아직 안 썼으면 null',
  })
  myPartnerReview: PartnerReviewDto | null;

  @ApiProperty({
    description:
      '상대가 후기를 썼는지. 내가 아직 안 써서 잠겨 있어도 true다. ' +
      '이 값이 true인데 receivedPartnerReview가 null이면 ' +
      '"한줄평이 도착했어요. 나도 남기면 확인할 수 있어요"를 띄우면 된다',
  })
  partnerReviewArrived: boolean;

  @ApiProperty({
    type: PartnerReviewDto,
    nullable: true,
    description:
      '상대가 쓴 내용. 내가 먼저 써야 채워진다. ' +
      '상대가 아직 안 썼거나 내가 안 썼으면 null',
  })
  receivedPartnerReview: PartnerReviewDto | null;

  @ApiProperty({ nullable: true, description: '내가 쓴 코스 한줄평' })
  myCourseReview: string | null;

  @ApiProperty({ type: [SavedSpotReviewDto] })
  mySpotReviews: SavedSpotReviewDto[];
}
