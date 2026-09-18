// 장소 소개글을 TourAPI 대신 DB에서 꺼내 쓴다.
//
// 소개글(detailCommon2)은 장소마다 한 번씩 불러야 해서 호출이 장소 수만큼 든다.
// 홈 추천과 코스 생성이 둘 다 이걸 부르는데, 개발계정 한도는 엔드포인트별로
// 하루 1,000건이라 사용자가 조금만 늘어도 녹는다.
//
// 원문은 거의 바뀌지 않으니 한 번 받으면 계속 쓸 수 있다. 인메모리로 들고 있으면
// 배포할 때마다 통째로 날아가서 같은 장소를 처음부터 다시 부르게 되므로 DB에 남긴다.
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TourApiClient } from '../algorithm/tour-api.client';

/**
 * 소개글을 못 받은 장소를 다시 물어보기까지 기다리는 기간.
 *
 * 없는 것과 아직 안 받은 것을 구분하지 않으면 소개글 없는 장소를 영원히 다시 부른다.
 * 그렇다고 영영 안 물어보면 나중에 생긴 소개글을 못 받는다. 관광공사가 원문을
 * 채워 넣는 속도를 생각하면 일주일이면 충분하다.
 */
const RETRY_MISSING_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SpotDescriptionService {
  private readonly logger = new Logger(SpotDescriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tourApi: TourApiClient,
  ) {}

  /**
   * contentId별 소개글 원문. 없는 장소는 null.
   *
   * DB에 있으면 그대로 쓰고, 없거나 오래전에 비어 있던 것만 TourAPI에 물어본다.
   * 요약하지 않은 원문을 돌려준다 — 요약 규칙이 바뀌어도 다시 부를 일이 없어야 한다.
   */
  async overviewsOf(contentIds: string[]): Promise<Map<string, string | null>> {
    const unique = [...new Set(contentIds)].filter((id) => id.length > 0);
    if (unique.length === 0) return new Map();

    const rows = await this.prisma.spotDescription.findMany({
      where: { contentId: { in: unique } },
      select: { contentId: true, overview: true, fetchedAt: true },
    });

    const known = new Map(rows.map((row) => [row.contentId, row]));
    const retryBefore = new Date(Date.now() - RETRY_MISSING_AFTER_MS);

    // 처음 보는 곳과, 비어 있는 채로 오래된 곳만 다시 물어본다
    const missing = unique.filter((id) => {
      const row = known.get(id);
      if (!row) return true;
      return row.overview === null && row.fetchedAt < retryBefore;
    });

    if (missing.length > 0) {
      const fetched = await this.tourApi.fetchOverviews(missing);
      await this.save(missing, fetched);

      for (const id of missing) {
        known.set(id, {
          contentId: id,
          overview: fetched.get(id) ?? null,
          fetchedAt: new Date(),
        });
      }

      this.logger.log(
        `소개글 ${missing.length}곳을 TourAPI에서 받았습니다 ` +
          `(요청 ${unique.length}곳 중 ${unique.length - missing.length}곳은 DB에서)`,
      );
    }

    return new Map(unique.map((id) => [id, known.get(id)?.overview ?? null]));
  }

  /**
   * 넘긴 것 중 아직 한 번도 받아 본 적 없는 장소만 골라낸다.
   *
   * 미리 받아 둘 대상을 정할 때 쓴다. 이미 받은 것을 빼야 예열이 날마다
   * 다음 장소로 넘어간다 — 안 그러면 매일 같은 앞자리만 확인하고 끝난다.
   */
  async unknownAmong(contentIds: string[], limit: number): Promise<string[]> {
    const unique = [...new Set(contentIds)].filter((id) => id.length > 0);
    if (unique.length === 0 || limit <= 0) return [];

    const rows = await this.prisma.spotDescription.findMany({
      where: { contentId: { in: unique } },
      select: { contentId: true },
    });

    const known = new Set(rows.map((row) => row.contentId));
    return unique.filter((id) => !known.has(id)).slice(0, limit);
  }

  /**
   * 받은 결과를 남긴다. 못 받은 장소도 행을 만들어 둔다 —
   * 그래야 "없는 곳"과 "아직 안 물어본 곳"이 구분된다.
   *
   * 저장이 실패해도 이번 응답은 이미 만들어졌으므로 화면을 막지 않는다.
   * 다음 조회 때 다시 받게 될 뿐이다.
   */
  private async save(
    contentIds: string[],
    fetched: Map<string, string>,
  ): Promise<void> {
    const now = new Date();

    try {
      await this.prisma.$transaction(
        contentIds.map((contentId) => {
          const overview = fetched.get(contentId) ?? null;
          return this.prisma.spotDescription.upsert({
            where: { contentId },
            create: { contentId, overview, fetchedAt: now },
            update: { overview, fetchedAt: now },
          });
        }),
      );
    } catch (error) {
      this.logger.warn(`소개글 저장에 실패했습니다: ${error}`);
    }
  }
}
