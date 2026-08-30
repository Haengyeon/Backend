// GET /courses/current, GET /courses/history 응답 형태
import { ApiProperty } from '@nestjs/swagger';
import {
  CourseStatus,
  CourseTheme,
  Region,
  VideoStatus,
} from '../../../generated/prisma/enums';
import { CoursePartnerDto } from './course-detail-response.dto';

export class CourseProgressDto {
  @ApiProperty({ example: 1 })
  completedMissions: number;

  @ApiProperty({ example: 4, description: '알고리즘 생성 코스는 4' })
  totalMissions: number;
}

export class CurrentCourseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '서울 로컬 맛집 코스' })
  title: string;

  @ApiProperty({ enum: Region })
  region: Region;

  @ApiProperty({ enum: CourseTheme })
  theme: CourseTheme;

  @ApiProperty({ example: '로컬 맛집' })
  themeLabel: string;

  @ApiProperty({ example: '2026-08-27' })
  travelDate: string;

  @ApiProperty({ example: 2, description: '0이면 당일' })
  dday: number;

  @ApiProperty({ enum: CourseStatus })
  status: CourseStatus;

  @ApiProperty({ nullable: true })
  thumbnailUrl: string | null;

  @ApiProperty({ type: CoursePartnerDto })
  partner: CoursePartnerDto;

  @ApiProperty({ type: CourseProgressDto })
  progress: CourseProgressDto;
}

export class CurrentCourseResponseDto {
  @ApiProperty({
    description:
      '결제는 끝났는데 코스 생성이 아직인 상태. 화면에서 "없음"과 "생성 중"을 구분하려고 둔다',
    example: false,
  })
  generating: boolean;

  @ApiProperty({ type: CurrentCourseDto, nullable: true })
  course: CurrentCourseDto | null;
}

/** 목록에선 배지용 상태만. 영상 재생은 코스 상세에서 한다 */
export class CourseHistoryVideoDto {
  @ApiProperty({ enum: VideoStatus })
  status: VideoStatus;
}

export class CourseHistoryItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '서울 로컬 맛집 코스' })
  title: string;

  @ApiProperty({ enum: Region })
  region: Region;

  @ApiProperty({ enum: CourseTheme })
  theme: CourseTheme;

  @ApiProperty({ example: '로컬 맛집' })
  themeLabel: string;

  @ApiProperty({ example: '2026-08-20' })
  travelDate: string;

  @ApiProperty({ nullable: true })
  completedAt: Date | null;

  @ApiProperty({
    nullable: true,
    description: '코스 대표 이미지. 없으면 첫 인증샷으로 대체',
  })
  thumbnailUrl: string | null;

  @ApiProperty({ type: CoursePartnerDto })
  partner: CoursePartnerDto;

  @ApiProperty({ example: 8, description: '두 사람이 올린 인증샷 총합' })
  photoCount: number;

  @ApiProperty({ description: '요청자 본인의 후기 작성 여부' })
  hasReview: boolean;

  @ApiProperty({
    type: CourseHistoryVideoDto,
    nullable: true,
    description: '추억 영상. 제작을 요청한 적 없으면 null',
  })
  video: CourseHistoryVideoDto | null;
}

export class CourseHistoryResponseDto {
  @ApiProperty({ type: [CourseHistoryItemDto] })
  items: CourseHistoryItemDto[];

  @ApiProperty({ nullable: true, description: '다음 페이지 커서' })
  nextCursor: string | null;

  @ApiProperty()
  hasMore: boolean;
}
