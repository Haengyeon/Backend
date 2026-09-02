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

  @ApiProperty({
    nullable: true,
    example:
      '조선 시대의 궁궐로 자연과 건축이 조화를 이루는 아름다운 공간이에요.',
    description:
      '장소 소개글. 원문이 길어 문장 끝에서 끊어 보낸다. ' +
      '목표는 50자지만 첫 문장이 그보다 길면 그 문장이 끝나는 데까지 간다(최대 100자). ' +
      '말이 중간에 끊기는 것보다 조금 긴 편이 낫다는 판단이다. ' +
      '한국관광공사 원문이라 말투가 문어체(~이다)다. ' +
      '못 받아온 장소는 null이고, 그때는 소개 문단을 통째로 숨긴다',
  })
  description: string | null;

  @ApiProperty({ example: '서울특별시 광진구 자양로' })
  address: string;

  // TourAPI 자체 시군구 번호(sigungucode)는 내보내지 않는다. 관광공사 안에서만
  // 통하는 숫자라 화면에도 지도에도 쓸 데가 없다. DB에는 남겨 둔다 —
  // 나중에 "서울 안에서 강남구만" 같은 조회를 할 때 TourAPI 요청 파라미터로 필요하다.

  @ApiProperty({
    nullable: true,
    example: '광진구',
    description:
      '시군구 이름. 화면에 그대로 쓰면 된다. ' +
      '코드가 없거나 표에 없는 코드면 null이고, 그때는 시군구 줄을 숨긴다',
  })
  sigunguName: string | null;

  @ApiProperty({
    nullable: true,
    example: '11050',
    description:
      '지도에 칠할 때 쓰는 시군구 코드(서울 광진구 = 11050). ' +
      'southkorea-maps의 kostat/2018 시군구 파일 code와 같은 값이라 그대로 대조하면 된다. ' +
      '표에 없는 장소는 null이고, 그때는 지도에서 뺀다 — 엉뚱한 구를 칠하는 것보다 낫다',
  })
  mapSigunguCode: string | null;

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

  @ApiProperty({
    example: '서울',
    description:
      '시·도 한글 이름. sigunguNames와 이어 붙이면 "서울 중구·종로구"가 된다',
  })
  regionLabel: string;

  @ApiProperty({
    type: [String],
    example: ['중구', '종로구'],
    description:
      '코스가 걸쳐 있는 시군구 이름. 방문 순서대로, 중복은 뺀다. ' +
      'LOCKED에서도 나간다 — 매칭 확정 화면의 지역 배지가 이것이다. ' +
      '여러 구에 걸치면 다 적는다. 한 곳만 골라 쓰면 두 곳을 가는 코스인데 ' +
      '한 곳만 간다고 말하는 셈이라서다. 시군구를 모르는 코스는 빈 배열',
  })
  sigunguNames: string[];

  @ApiProperty({ enum: CourseTheme })
  theme: CourseTheme;

  @ApiProperty({ example: '로컬 맛집', description: '테마 한글 이름' })
  themeLabel: string;

  @ApiProperty({ example: '2026-08-25' })
  travelDate: string;

  @ApiProperty({ example: 0, description: '0이면 당일, 음수면 지난 코스' })
  dday: number;

  @ApiProperty({
    type: CoursePartnerDto,
    description:
      '매칭 상대. LOCKED에서도 나간다 — 매칭을 수락할 때 이미 본 사람이라 ' +
      '가릴 이유가 없고, 매칭 확정 화면이 두 사람 얼굴을 보여줘야 한다',
  })
  partner: CoursePartnerDto;

  @ApiPropertyOptional({ example: '서울 로컬 맛집 코스' })
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl?: string | null;

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

  @ApiPropertyOptional({
    type: [String],
    example: ['11020', '11010'],
    description:
      '코스가 지나간 시군구의 지도 코드. 방문 순서대로, 중복은 뺀다. ' +
      '지도에서 이 코스가 다녀온 구를 칠할 때 이 배열을 그대로 쓰면 된다',
  })
  mapSigunguCodes?: string[];

  @ApiPropertyOptional({ type: CourseMapCenterDto })
  mapCenter?: CourseMapCenterDto;

  @ApiPropertyOptional({ type: [CourseSpotDto] })
  spots?: CourseSpotDto[];

  @ApiPropertyOptional({
    type: CourseVideoDto,
    nullable: true,
    description: 'FULL부터. AI 추억영상을 만든 적 없으면 null `미구현`',
  })
  video?: CourseVideoDto | null;

  @ApiPropertyOptional({
    type: MyReviewResponseDto,
    description:
      'FULL부터. 내가 쓴 후기와 상대가 나에게 쓴 후기. ' +
      '후기는 여행 당일부터 쓸 수 있어 완료를 기다리지 않는다. ' +
      'GET /courses/{courseId}/reviews와 같은 내용이라 화면이 따로 부르지 않아도 된다',
  })
  review?: MyReviewResponseDto;
}
