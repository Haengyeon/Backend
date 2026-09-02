// 인증샷 업로드 / 후기 작성 / 코스 완료 처리 응답 형태
import { ApiProperty } from '@nestjs/swagger';
import { CourseStatus, Region } from '../../../generated/prisma/enums';
import { CourseProgressDto } from './course-list-response.dto';

export class EarnedStampDto {
  @ApiProperty({ enum: Region })
  region: Region;

  @ApiProperty({ example: '서울' })
  regionLabel: string;

  @ApiProperty({
    nullable: true,
    example: '중구',
    description:
      '대응표에 없는 코드면 null. regionLabel과 이어 붙여 화면에 쓴다',
  })
  sigunguName: string | null;

  @ApiProperty({
    example: '11020',
    description: '수집 지도에서 칠할 칸. 스탬프 하나가 칸 하나다',
  })
  mapSigunguCode: string;

  @ApiProperty()
  earnedAt: Date;
}

export class CourseCompletionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: CourseStatus, example: CourseStatus.COMPLETED })
  status: CourseStatus;

  @ApiProperty({ nullable: true })
  completedAt: Date | null;

  @ApiProperty({
    type: [EarnedStampDto],
    description:
      '이번에 새로 찍힌 스탬프. 스탬프는 시군구 단위라 코스가 여러 구에 걸치면 ' +
      '여러 개가 나오고, 이미 다녀온 구뿐이면 빈 배열이다',
  })
  earnedStamps: EarnedStampDto[];

  @ApiProperty({ example: 1000, description: '이번 완료로 받은 포인트' })
  earnedPoints: number;

  @ApiProperty({ example: 3000, description: '적립 후 포인트' })
  pointsAfter: number;
}

export class MissionPhotoResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  missionId: string;

  @ApiProperty()
  imageUrl: string;

  @ApiProperty({ nullable: true })
  comment: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ description: '두 사람이 다 올려서 이 미션이 끝났는지' })
  missionCompleted: boolean;

  @ApiProperty({ type: CourseProgressDto })
  courseProgress: CourseProgressDto;

  // 인증샷으로는 코스가 끝나지 않는다. 완료는 여행 다음 날 서버가 처리하므로
  // 업로드 응답에 completion(완료 결과)·courseCompletable(완료 가능 여부)을 싣지 않는다.
  // 완료 여부는 코스 조회의 status로 확인한다.
}

/** 상대에게 남긴 한 줄. 작성 응답과 조회 응답이 같은 모양을 쓴다 */
export class PartnerReviewDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty()
  createdAt: Date;
}

export class SavedSpotReviewDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: '코스 상세의 spots[].id' })
  spotId: string;

  @ApiProperty({ example: '2553908', description: '한국관광공사 원본 ID' })
  contentId: string;

  @ApiProperty({ example: '루프' })
  spotName: string;

  @ApiProperty()
  content: string;
}

export class CourseReviewResponseDto {
  @ApiProperty({ description: '상대 후기 ID' })
  id: string;

  @ApiProperty()
  courseId: string;

  @ApiProperty({ example: '시간도 잘 지키시고 대화가 편했어요.' })
  partnerReview: string;

  @ApiProperty({
    nullable: true,
    description: '안 보냈으면 null',
    example: '4곳은 좀 많았어요.',
  })
  courseReview: string | null;

  @ApiProperty({
    type: [SavedSpotReviewDto],
    description: '함께 저장된 장소 후기. 안 보냈으면 빈 배열',
  })
  spotReviews: SavedSpotReviewDto[];

  @ApiProperty({ description: '상대에게 알림을 보냈는지' })
  partnerNotified: boolean;

  @ApiProperty()
  createdAt: Date;

  // 후기 작성 포인트는 액수가 정해지지 않아 아직 지급하지 않는다.
  // 정해지면 earnedPoints / pointsAfter를 여기에 되살린다.

  @ApiProperty({ description: '상대도 후기를 썼는지' })
  partnerReviewArrived: boolean;

  @ApiProperty({
    type: PartnerReviewDto,
    nullable: true,
    description:
      '상대가 나에게 쓴 후기. 상대가 아직 안 썼으면 null. ' +
      '내가 방금 썼으므로 상대 것이 있다면 여기서 바로 열린다 — ' +
      '저장 후 상대 후기를 보려고 다시 조회할 필요가 없다',
  })
  receivedPartnerReview: PartnerReviewDto | null;
}
