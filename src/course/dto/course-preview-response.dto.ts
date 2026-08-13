// 코스 추천 알고리즘 결과 응답 DTO
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourseTheme, Region } from '../../generated/prisma/enums';

export class ThemeScoreDto {
  @ApiProperty({ enum: CourseTheme, enumName: 'CourseTheme' })
  theme: CourseTheme;

  @ApiProperty({ description: '공통 취미 연관도 합', example: 5 })
  score: number;
}

export class CoursePreviewSpotDto {
  @ApiProperty({ description: '코스 내 방문 순서', example: 1 })
  order: number;

  @ApiProperty({ description: 'TourAPI contentid', example: '264337' })
  contentId: string;

  @ApiProperty({ example: '남산서울타워' })
  name: string;

  @ApiProperty({ example: '서울특별시 용산구 남산공원길 105' })
  address: string;

  @ApiProperty({ example: 37.5511 })
  latitude: number;

  @ApiProperty({ example: 126.9882 })
  longitude: number;

  @ApiPropertyOptional({ nullable: true })
  imageUrl: string | null;

  @ApiProperty({
    description: '이 칸의 역할 (테마 템플릿이 정함)',
    example: '점심(한식)',
  })
  role: string;

  @ApiProperty({ description: '분류코드', example: 'VE / VE01' })
  category: string;

  @ApiProperty({
    description: '장소 성격에 맞춰 생성된 미션 제목',
    example: '월정사 팔각구층석탑 주변 산책하기',
  })
  missionTitle: string;

  @ApiProperty({
    description: '미션 설명',
    example: '주변 유적지와 절터를 함께 산책하며 둘러보면 훨씬 풍성합니다.',
  })
  missionDescription: string;

  @ApiProperty({ example: 90 })
  stayMinutes: number;

  @ApiPropertyOptional({ nullable: true, example: 10 })
  moveMinutesFromPrevious: number | null;

  @ApiPropertyOptional({ nullable: true, example: 2.4 })
  distanceKmFromPrevious: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: '조건을 완화해서 뽑았으면 그 사유. null이면 정상 선정.',
  })
  relaxation: string | null;
}

export class CoursePreviewResponseDto {
  @ApiProperty({ example: '서울 로컬 맛집 코스' })
  title: string;

  @ApiProperty({ example: '시장과 노포를 훑는 로컬 미식 코스' })
  description: string;

  @ApiProperty({ enum: Region, enumName: 'Region' })
  region: Region;

  @ApiProperty({
    enum: CourseTheme,
    enumName: 'CourseTheme',
    description: 'STEP 1에서 확정된 테마',
  })
  theme: CourseTheme;

  @ApiProperty({
    type: [ThemeScoreDto],
    description:
      '테마 확정 과정. 공통 테마가 2개일 때 어떤 점수로 갈렸는지 보여준다.',
  })
  themeScores: ThemeScoreDto[];

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl: string | null;

  @ApiProperty({ description: '스팟 순서대로의 총 이동거리(km)', example: 2.4 })
  totalDistanceKm: number;

  @ApiProperty({
    description: '역주행 + 재방문 페널티(km 환산). 0이면 되돌아감 없는 동선.',
    example: 0,
  })
  backtrackPenaltyKm: number;

  @ApiProperty({ description: '체류 + 이동 합계(분)', example: 400 })
  durationMinutes: number;

  @ApiProperty({ description: 'TourAPI에서 받아온 후보 수', example: 612 })
  candidateCount: number;

  @ApiProperty({ description: 'TourAPI 호출 횟수', example: 3 })
  apiCallCount: number;

  @ApiProperty({ type: [CoursePreviewSpotDto] })
  spots: CoursePreviewSpotDto[];
}
