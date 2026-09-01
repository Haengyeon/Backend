// GET /courses/:id 응답 형태
//
// 세 화면(채팅방 / 기록 탭 / D-1 알림)이 같은 API를 쓰고,
// viewType에 따라 채워지는 필드가 달라진다.
//   LOCKED  (D-2 이전) 지역·테마만
//   PREVIEW (D-1)      + preview
//   FULL    (D-Day~)   + 지도·스팟·미션
//
// 완료된 코스는 FULL에 추억영상과 후기가 더 붙는다. 데이트가 끝나면 이 화면이
// "그날 뭐 했는지 다시 보는 페이지"가 되기 때문에, 장소·인증샷·영상·후기를
// 한 번의 조회로 다 받게 한다.
//
// 조건부 필드가 많아 class-transformer로 걸러내지 않고 서비스에서 직접 조립한다.
// 여기 있는 데코레이터는 스웨거 문서용이다.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CourseStatus,
  CourseTheme,
  Region,
  VideoStatus,
} from '../../../generated/prisma/enums';
import { MyReviewResponseDto } from './my-review-response.dto';

export class CourseVideoDto {
  @ApiProperty({ enum: VideoStatus })
  status: VideoStatus;

  @ApiProperty({ nullable: true, description: '완성 전에는 null' })
  videoUrl: string | null;

  @ApiProperty({ nullable: true })
  thumbnailUrl: string | null;
}

export class CoursePartnerDto {
  @ApiProperty({ example: '노글리' })
  name: string;

  @ApiProperty({ example: 'https://cdn.haengyeon.kr/profiles/abc.jpg' })
  profileImageUrl: string;
}

export class CourseMapCenterDto {
  @ApiProperty({ example: 37.5432 })
  latitude: number;

  @ApiProperty({ example: 127.0764 })
  longitude: number;
}

export class CoursePreviewInfoDto {
  @ApiProperty({ description: '실내가 섞인 코스인지', example: false })
  isIndoor: boolean;

  @ApiProperty({ example: '6시간 30분' })
  estimatedTime: string;

  @ApiProperty({ example: '많이 걸으니 편한 신발을 추천해요' })
  dressTip: string;
}

export class MissionPhotoDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '/uploads/7c5cf342-af04-44bb-b5eb-ccd38dc218f6.png' })
  imageUrl: string;

  @ApiProperty({ nullable: true, example: '떡볶이 진짜 맛있었다' })
  comment: string | null;

  @ApiProperty({ description: '내가 올린 사진인지. 상대 것이면 false' })
  isMine: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class CourseSpotMissionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '노룬산골목시장 구경하고 먹거리 고르기' })
  title: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ description: '알고리즘이 만든 미션은 전부 필수' })
  isRequired: boolean;

  @ApiProperty({ description: '요청자 본인이 올렸는지' })
  photoUploaded: boolean;

  @ApiProperty({ description: '상대방이 올렸는지' })
  partnerPhotoUploaded: boolean;

  @ApiProperty({
    type: [MissionPhotoDto],
    description:
      '이 장소에 올라온 인증샷. 아직 없으면 빈 배열. ' +
      '완료된 코스에서는 두 사람 것 2장이 다 들어 있어 추억 페이지를 그릴 수 있다',
  })
  photos: MissionPhotoDto[];
}

export class CourseSpotDto {
  @ApiProperty()
  id: string;

  @ApiProperty({
    nullable: true,
    description: 'TourAPI 원본 ID. 운영시간·전화번호 재조회용',
  })
  contentId: string | null;

  @ApiProperty({ example: 1, description: '방문 순서 (1~4)' })
  order: number;

  @ApiProperty({
    nullable: true,
    example: '시장 구경',
    description: '코스 구성표가 이 자리에 부여한 역할',
  })
  role: string | null;

  @ApiProperty({ example: '노룬산골목시장' })
  name: string;

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

  @ApiProperty({ nullable: true, example: 90 })
  stayMinutes: number | null;

  @ApiProperty({ nullable: true, description: '1번 스팟은 null' })
  moveMinutesFromPrevious: number | null;

  @ApiProperty({
    example: 3,
    description: '이 장소에 쌓인 관광지 후기 수. 코스를 가로질러 센다',
  })
  reviewCount: number;

  @ApiProperty({ description: '요청자 본인이 이 장소에 후기를 남겼는지' })
  reviewWritten: boolean;

  @ApiProperty({ type: CourseSpotMissionDto, nullable: true })
  mission: CourseSpotMissionDto | null;
}

export class CourseDetailResponseDto {
  @ApiProperty({
    enum: ['LOCKED', 'PREVIEW', 'FULL'],
    description: 'LOCKED: D-2 이전 / PREVIEW: D-1 / FULL: D-Day 이후',
  })
  viewType: 'LOCKED' | 'PREVIEW' | 'FULL';

  @ApiProperty()
  id: string;

  @ApiProperty({ enum: Region })
  region: Region;

  @ApiProperty({ enum: CourseTheme })
  theme: CourseTheme;

  @ApiProperty({ example: '로컬 맛집', description: '테마 한글 이름' })
  themeLabel: string;

  @ApiProperty({ example: '2026-08-25' })
  travelDate: string;

  @ApiProperty({ example: 0, description: '0이면 당일, 음수면 지난 코스' })
  dday: number;

  @ApiPropertyOptional({ example: '서울 로컬 맛집 코스' })
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl?: string | null;

  @ApiPropertyOptional({ type: CoursePartnerDto })
  partner?: CoursePartnerDto;

  @ApiPropertyOptional({ type: CoursePreviewInfoDto })
  preview?: CoursePreviewInfoDto;

  @ApiPropertyOptional({
    enum: CourseStatus,
    description: 'FULL에서만. 진행중/완료로 화면이 갈린다',
  })
  status?: CourseStatus;

  @ApiPropertyOptional({ nullable: true, example: 390 })
  durationMinutes?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 1.3 })
  totalDistanceKm?: number | null;

  @ApiPropertyOptional({ type: CourseMapCenterDto })
  mapCenter?: CourseMapCenterDto;

  @ApiPropertyOptional({ type: [CourseSpotDto] })
  spots?: CourseSpotDto[];

  @ApiPropertyOptional({
    type: CourseVideoDto,
    nullable: true,
    description: '완료된 코스에만. AI 추억영상을 만든 적 없으면 null `미구현`',
  })
  video?: CourseVideoDto | null;

  @ApiPropertyOptional({
    type: MyReviewResponseDto,
    description:
      '완료된 코스에만. 내가 쓴 후기와 상대가 나에게 쓴 후기. ' +
      'GET /courses/{courseId}/reviews와 같은 내용이라 화면이 따로 부르지 않아도 된다',
  })
  review?: MyReviewResponseDto;
}
