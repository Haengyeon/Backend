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
import {
  decodeOffsetCursor,
  encodeOffsetCursor,
} from '../../common/offset-cursor.util';
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
import { summarizeDescription } from '../course-text.util';
import { SpotDescriptionService } from './spot-description.service';
import {
  RECOMMEND_DEFAULT_LIMIT,
  RECOMMEND_MAX_LIMIT,
} from '../dto/request/recommended-query.dto';
import {
  RecommendedResponseDto,
  RecommendedSpotDto,
} from '../dto/response/recommended-response.dto';

/**
 * 테마 조합당 캐시 유지 시간.
 *
 * 1시간이던 때는 같은 조합을 하루에 24번까지 다시 받았다. 근거가 있어서 그랬던 게
 * 아니라 처음에 보수적으로 잡은 값이었다. 관광지 목록은 그렇게 자주 바뀌지 않는다 —
 * areaBasedSyncList2로 확인해 보면 변경분이 보름에 수십 건 수준이다.
 *
 * 하루로 늘리면 호출이 사용자 수와 무관해진다. 테마 3개 조합이 최대 56가지이므로,
 * 사람이 몇 명이 오든 조합당 하루 한 번씩 = 하루 56회가 상한이 된다.
 * 개발계정 한도가 엔드포인트별 1,000건이라 이 상한이 있는 게 중요하다.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
    private readonly spotDescriptions: SpotDescriptionService,
  ) {}

  async recommend(
    userId: string,
    query: { limit?: number; cursor?: string },
  ): Promise<RecommendedResponseDto> {
    const take = Math.min(
      Math.max(query.limit ?? RECOMMEND_DEFAULT_LIMIT, 1),
      RECOMMEND_MAX_LIMIT,
    );
    const offset = decodeOffsetCursor(query.cursor);

    const themes = await this.themesFromHobbies(userId);
    const pool = await this.loadPool(themes);
    const visited = await this.visitedContentIds(userId);

    // 이미 다녀왔거나 다녀갈 예정인 곳은 추천에서 뺀다
    const items = pool.filter((spot) => !visited.has(spot.contentId));

    const page = items.slice(offset, offset + take);
    const hasMore = offset + take < items.length;
    const descriptions = await this.descriptionsOf(page);

    return {
      items: page.map((spot) =>
        this.toDto(spot, descriptions.get(spot.contentId) ?? null),
      ),
      nextCursor: hasMore ? encodeOffsetCursor(offset + take) : null,
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

    // 취미를 하나도 안 고른 사람이 있다. 그때는 고를 근거가 없으니 전체 테마를 본다.
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

  /**
   * 추천에 나올 만한 장소의 소개글을 미리 받아 둔다. 스케줄러가 새벽에 부른다.
   *
   * 낮에 사용자가 홈을 열 때 detailCommon2를 부르지 않게 하는 게 목적이다.
   * 같은 호출이라도 새벽에 정해진 양만 쓰면 한도를 예측할 수 있다.
   *
   * 테마를 전부 넣어 가장 넓은 풀을 받는다. 어떤 사용자의 조합이든 이 풀의
   * 부분집합이라, 여기만 채워 두면 대부분 DB에서 해결된다.
   *
   * 아직 안 받은 것만 골라 예산만큼 처리해서, 날마다 다음 장소로 넘어간다.
   */
  async warmDescriptions(budget: number): Promise<number> {
    const pool = await this.loadPool(Object.values(CourseTheme));

    const pending = await this.spotDescriptions.unknownAmong(
      pool.map((spot) => spot.contentId),
      budget,
    );
    if (pending.length === 0) return 0;

    await this.spotDescriptions.overviewsOf(pending);
    return pending.length;
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

  /**
   * 이번 페이지에 나갈 장소의 소개글.
   *
   * 목록 조회에는 소개글이 없어서 장소마다 한 번 더 불러야 한다.
   * 후보 전체를 부르면 TourAPI 한도가 녹으므로 화면에 나갈 장소만 맡긴다.
   *
   * 실제 호출 여부는 SpotDescriptionService가 정한다 — DB에 있으면 안 부른다.
   * 요약은 여기서 한다. DB에는 원문이 들어 있어서 요약 규칙이 바뀌어도
   * TourAPI를 다시 부를 일이 없다.
   */
  private async descriptionsOf(
    spots: TourSpot[],
  ): Promise<Map<string, string | null>> {
    const overviews = await this.spotDescriptions.overviewsOf(
      spots.map((spot) => spot.contentId),
    );

    return new Map(
      spots.map((spot) => [
        spot.contentId,
        summarizeDescription(overviews.get(spot.contentId) ?? null),
      ]),
    );
  }

  private toDto(
    spot: TourSpot,
    description: string | null,
  ): RecommendedSpotDto {
    return {
      contentId: spot.contentId,
      name: spot.title,
      // 전국 조회는 areaCode가 비어 오므로 주소에서 되짚는다
      region: regionFromAddress(spot.address),
      category: categoryLabelOf(spot.lclsSystm1, spot.lclsSystm2),
      description,
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
