// 홈 하단 "진행중인 전국 축제·공연·행사"
//
// TourAPI 결과를 저장하지 않는다. 그날 목록을 통째로 캐시해 두고,
// 요청마다 프로필 취미에 맞는 행사를 앞으로 당겨 잘라서 준다.
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Hobby } from '../../generated/prisma/enums';
import { TourApiClient } from '../../course/algorithm/tour-api.client';
import { TourFestival } from '../../course/algorithm/types';
import { kstToday } from '../../course/course-date.util';
import {
  decodeOffsetCursor,
  encodeOffsetCursor,
} from '../../common/offset-cursor.util';
import { hobbyMatchCount } from '../festival-category';
import {
  FESTIVAL_DEFAULT_LIMIT,
  FESTIVAL_MAX_LIMIT,
} from '../dto/request/festival-query.dto';
import {
  FestivalDto,
  FestivalListResponseDto,
} from '../dto/response/festival-response.dto';

/**
 * 행사 목록은 하루 중에는 거의 안 바뀐다.
 *
 * 캐시에 날짜가 함께 들어 있어 자정을 넘기면 어차피 새로 받는다. 그래서 TTL은
 * 하루를 덮을 만큼 길어도 된다. 1시간이던 때는 하루에 24번씩 같은 목록을 받았는데,
 * 개발계정 한도가 엔드포인트별 1,000건이라 그럴 여유가 없다.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** 실패 후 다시 부르기까지. 바로 다시 부르면 TourAPI 장애 동안 홈이 매번 타임아웃까지 멈춘다 */
const RETRY_AFTER_MS = 60 * 1000;

interface CacheEntry {
  /** KST 'YYYY-MM-DD' */
  date: string;
  festivals: TourFestival[];
  expiresAt: number;
}

@Injectable()
export class FestivalService {
  private readonly logger = new Logger(FestivalService.name);

  // 홈 화면은 열 때마다 불린다. 캐시가 없으면 TourAPI 일일 한도가 금방 녹는다.
  private cache: CacheEntry | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tourApi: TourApiClient,
  ) {}

  async listOngoing(
    userId: string,
    query: { limit?: number; cursor?: string },
  ): Promise<FestivalListResponseDto> {
    const take = Math.min(
      Math.max(query.limit ?? FESTIVAL_DEFAULT_LIMIT, 1),
      FESTIVAL_MAX_LIMIT,
    );
    const offset = decodeOffsetCursor(query.cursor);

    const [ongoing, hobbies] = await Promise.all([
      this.loadOngoing(kstToday()),
      this.hobbiesOf(userId),
    ]);
    const festivals = byHobbies(ongoing, hobbies);

    const page = festivals.slice(offset, offset + take);
    const hasMore = offset + take < festivals.length;

    return {
      items: page.map(toDto),
      nextCursor: hasMore ? encodeOffsetCursor(offset + take) : null,
      hasMore,
    };
  }

  private async hobbiesOf(userId: string): Promise<Hobby[]> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { hobbies: true },
    });

    return profile?.hobbies ?? [];
  }

  /**
   * 오늘 목록을 미리 받아 캐시에 올려 둔다. 스케줄러가 자정 직후에 부른다.
   *
   * 첫 사용자가 TourAPI 응답을 기다리지 않게 되고, 호출 수도 트래픽과 무관하게
   * 하루 한 번으로 고정된다.
   */
  async refresh(): Promise<number> {
    const festivals = await this.loadOngoing(kstToday());
    return festivals.length;
  }

  private async loadOngoing(today: string): Promise<TourFestival[]> {
    const cached = this.cache;
    // 날짜도 본다. 자정을 넘겨 캐시를 쓰면 어제 끝난 행사가 남는다
    if (cached && cached.date === today && cached.expiresAt > Date.now()) {
      return cached.festivals;
    }

    const fetched = await this.tourApi.fetchOngoingFestivals(today);

    // 실패하면 직전 목록을 오늘 기준으로 다시 걸러 쓴다. 섹션이 통째로 비는 것보다 낫다
    const festivals = rank(
      (fetched ?? cached?.festivals ?? []).filter(
        (festival) =>
          // 포스터가 없으면 홈 카드에 걸 수 없다
          festival.firstImage !== null && isOngoing(festival, today),
      ),
    );

    if (fetched) {
      this.logger.log(`진행 중 행사 ${festivals.length}건 (${today})`);
    }

    this.cache = {
      date: today,
      festivals,
      expiresAt: Date.now() + (fetched ? CACHE_TTL_MS : RETRY_AFTER_MS),
    };
    return festivals;
  }
}

function isOngoing(festival: TourFestival, today: string): boolean {
  return festival.startDate <= today && today <= festival.endDate;
}

/**
 * 최근에 시작한 행사부터, 시작일이 같으면 먼저 끝나는 것부터.
 * 페이지를 넘겨도 순서가 흔들리지 않게 마지막은 contentId로 정한다.
 */
function rank(festivals: TourFestival[]): TourFestival[] {
  return [...festivals].sort(
    (a, b) =>
      b.startDate.localeCompare(a.startDate) ||
      a.endDate.localeCompare(b.endDate) ||
      a.contentId.localeCompare(b.contentId),
  );
}

/**
 * 취미에 많이 맞는 행사부터. 점수가 같으면 원래 순서(최근 시작 순)를 지킨다.
 * 캐시된 목록을 건드리지 않도록 새 배열에서 정렬한다.
 */
function byHobbies(
  festivals: TourFestival[],
  hobbies: Hobby[],
): TourFestival[] {
  return festivals
    .map((festival) => ({
      festival,
      score: hobbyMatchCount(hobbies, festival.lclsSystm3),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ festival }) => festival);
}

function toDto(festival: TourFestival): FestivalDto {
  return {
    contentId: festival.contentId,
    name: festival.title,
    startDate: festival.startDate,
    endDate: festival.endDate,
    imageUrl: festival.firstImage,
    address: festival.address,
  };
}
