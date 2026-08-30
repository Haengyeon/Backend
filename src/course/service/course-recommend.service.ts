// 홈 화면에 뿌릴 추천 관광지
//
// 코스가 아니라 "가볼 만한 곳" 목록이다. Course 테이블은 결제된 매칭에만 붙어 있어서
// (matchAttemptId가 non-null) 추천용 코스를 담을 자리가 없다. 그래서 저장하지 않고
// TourAPI 결과를 그때그때 보여준다.
//
// 무엇을 기준으로 고르나 — 취미뿐이다
//   프로필에 지역이 없어서 어디를 추천할지 물어볼 근거가 없다. 그래서 지역을 정하지
//   않고 전국에서 받아온다. 지역 활성화가 목적이라 서울로 고정하면 오히려 반대다.
//   테마도 사용자가 고르는 값이 아니라, 프로필 취미(1~5개, 필수)를 코스 알고리즘과
//   같은 연관도 표에 넣어 유도한다.
//
// 아직 못 한 것
//   기획의 "조회수 높은 1개 상단 고정 / 나머지는 조회수 낮은 순"은 넣지 못했다.
//   스키마에도 TourAPI 기본 조회에도 조회수·인기도 값이 없다.
//   대신 널리 알려진 곳이 앞에 몰리지 않도록 랜드마크(VE01)를 뒤로 미루고,
//   사진이 없는 곳은 아예 뺀다(사진 없는 곳을 추천하면 아무도 안 누른다).
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseTheme, Hobby } from '../../generated/prisma/enums';
import { THEME_ORDER, totalAffinity } from '../algorithm/affinity';
import { categoryLabelOf, regionFromAddress } from '../algorithm/labels';
import { sanitizePool } from '../algorithm/first-date-policy';
import {
  THEME_FILTER,
  matchesFilter,
  toPoolQueries,
} from '../algorithm/tour-category';
import { TourApiClient } from '../algorithm/tour-api.client';
import { SpotFilter, TourSpot } from '../algorithm/types';
import {
  RECOMMEND_DEFAULT_LIMIT,
  RECOMMEND_MAX_LIMIT,
} from '../dto/request/recommended-query.dto';
import {
  RecommendedResponseDto,
  RecommendedSpotDto,
} from '../dto/response/recommended-response.dto';

/** 테마 조합당 캐시 유지 시간. 관광지 목록은 자주 바뀌지 않는다 */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** 취미로 뽑을 테마 수. 너무 많으면 취향과 상관없는 곳까지 섞인다 */
const THEMES_FROM_HOBBIES = 3;

/** 랜드마크. 이미 다 아는 곳이라 뒤로 미룬다 */
const LANDMARK_CODE = 'VE01';

interface CacheEntry {
  spots: TourSpot[];
  expiresAt: number;
}

@Injectable()
export class CourseRecommendService {
  private readonly logger = new Logger(CourseRecommendService.name);

  // 홈 화면은 열 때마다 불린다. 캐시가 없으면 TourAPI 일일 한도가 금방 녹는다.
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tourApi: TourApiClient,
  ) {}

  async recommend(
    userId: string,
    query: { limit?: number; cursor?: string },
  ): Promise<RecommendedResponseDto> {
    const take = Math.min(
      Math.max(query.limit ?? RECOMMEND_DEFAULT_LIMIT, 1),
      RECOMMEND_MAX_LIMIT,
    );
    const offset = decodeCursor(query.cursor);

    const themes = await this.themesFromHobbies(userId);
    const pool = await this.loadPool(themes);
    const visited = await this.visitedContentIds(userId);

    // 이미 다녀왔거나 다녀갈 예정인 곳은 추천에서 뺀다
    const items = pool.filter((spot) => !visited.has(spot.contentId));

    const page = items.slice(offset, offset + take);
    const hasMore = offset + take < items.length;

    return {
      items: page.map((spot) => this.toDto(spot)),
      nextCursor: hasMore ? encodeCursor(offset + take) : null,
      hasMore,
    };
  }

  /**
   * 프로필 취미를 연관도 표에 넣어 점수가 높은 테마를 고른다.
   * 코스 생성에서 테마를 정할 때 쓰는 것과 같은 표다.
   */
  private async themesFromHobbies(userId: string): Promise<CourseTheme[]> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { hobbies: true },
    });

    const hobbies: Hobby[] = profile?.hobbies ?? [];

    const scored = THEME_ORDER.map((theme) => ({
      theme,
      score: totalAffinity(hobbies, theme),
    }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);

    // 연관도가 0인 취미만 가진 사람이 있다. (READING·IT·ANIMAL·MUSIC)
    // 그때는 고를 근거가 없으니 전체 테마를 본다.
    if (scored.length === 0) return [...THEME_ORDER];

    return scored.slice(0, THEMES_FROM_HOBBIES).map((row) => row.theme);
  }

  /** 내 코스에 이미 들어간 관광지 */
  private async visitedContentIds(userId: string): Promise<Set<string>> {
    const spots = await this.prisma.courseSpot.findMany({
      where: {
        contentId: { not: null },
        course: {
          matchAttempt: {
            is: {
              OR: [{ matchingA: { userId } }, { matchingB: { userId } }],
            },
          },
        },
      },
      select: { contentId: true },
    });

    return new Set(
      spots
        .map((spot) => spot.contentId)
        .filter((id): id is string => id !== null),
    );
  }

  private async loadPool(themes: CourseTheme[]): Promise<TourSpot[]> {
    const key = [...themes].sort().join(',');
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.spots;

    const filters: SpotFilter[] = themes.map((theme) => THEME_FILTER[theme]);
    const queries = toPoolQueries(filters);

    const raw = await this.tourApi.fetchNationwide(queries);
    this.logger.log(
      `추천 후보 ${raw.length}건 / 호출 ${queries.length}회 (themes=${themes.join(',')})`,
    );

    // 코스 생성과 같은 기준으로 첫 만남에 부적합한 곳을 걷어낸다
    const spots = rank(
      sanitizePool(raw).filter(
        (spot) =>
          // 사진이 없으면 홈 화면에 걸 수 없다
          spot.firstImage !== null &&
          filters.some((filter) => matchesFilter(spot, filter)),
      ),
    );

    this.cache.set(key, { spots, expiresAt: Date.now() + CACHE_TTL_MS });
    return spots;
  }

  private toDto(spot: TourSpot): RecommendedSpotDto {
    return {
      contentId: spot.contentId,
      name: spot.title,
      // 전국 조회는 areaCode가 비어 오므로 주소에서 되짚는다
      region: regionFromAddress(spot.address),
      category: categoryLabelOf(spot.lclsSystm1, spot.lclsSystm2),
      address: spot.address,
      latitude: spot.latitude,
      longitude: spot.longitude,
      imageUrl: spot.firstImage,
    };
  }
}

/**
 * 랜드마크를 뒤로 미루고, 같은 조건이면 contentId 순.
 * 페이지를 넘겨도 순서가 흔들리지 않아야 커서가 의미를 갖는다.
 */
function rank(spots: TourSpot[]): TourSpot[] {
  const isLandmark = (spot: TourSpot) => spot.lclsSystm2 === LANDMARK_CODE;

  return [...spots].sort((a, b) => {
    const landmark = Number(isLandmark(a)) - Number(isLandmark(b));
    if (landmark !== 0) return landmark;
    return a.contentId.localeCompare(b.contentId);
  });
}

/** 커서는 목록에서 몇 번째부터 볼지만 담는다 */
function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64');
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString()) as {
      offset?: unknown;
    };
    return typeof parsed.offset === 'number' && parsed.offset >= 0
      ? parsed.offset
      : 0;
  } catch {
    // 손으로 아무 값이나 넣어도 첫 페이지를 보여준다
    return 0;
  }
}
