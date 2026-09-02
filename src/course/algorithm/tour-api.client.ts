// 관공서 오픈 api 불러오는 곳
import { Injectable, Logger } from '@nestjs/common';
import { Region } from '../../generated/prisma/enums';
import { AREA_CODE, PoolQuery } from './tour-category';
import { TourSpot } from './types';

const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';

/** 조회 1건당 후보 수. 서울 FD가 1000건이 넘어 100건이면 편중된다. */
const NUM_OF_ROWS = 200;

const TIMEOUT_MS = 5000;

/** 흔히 섞여 오는 HTML 엔티티. 나머지는 그대로 둔다 */
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/**
 * 소개글을 화면에 그대로 쓸 수 있는 평문으로 만든다.
 *
 * overview는 대체로 평문이지만 <br>이나 <b>가 섞여 오는 항목이 있다.
 * 화면에서 HTML로 그리지 않으므로 태그가 그대로 보이게 된다. 줄바꿈 태그는
 * 줄바꿈으로 살리고 나머지 태그는 지운다.
 */
function toPlainText(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const text = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g,
      (entity) => HTML_ENTITIES[entity] ?? entity,
    )
    // 태그를 지우면서 생긴 빈 줄과 줄 끝 공백을 정리한다
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .trim();

  return text.length > 0 ? text : null;
}

/** TourAPI 원본 응답 1건. 필드명이 전부 소문자인 것에 주의. */
interface RawTourItem {
  contentid?: string;
  contenttypeid?: string;
  title?: string;
  addr1?: string;
  sigungucode?: string;
  /** 법정동 시·도 코드 (서울 = 11) */
  lDongRegnCd?: string;
  /** 법정동 시군구 코드 (중구 = 140). 앞의 것과 붙이면 표준 5자리가 된다 */
  lDongSignguCd?: string;
  mapx?: string;
  mapy?: string;
  firstimage?: string;
  lclsSystm1?: string;
  lclsSystm2?: string;
  lclsSystm3?: string;
}

@Injectable()
export class TourApiClient {
  private readonly logger = new Logger(TourApiClient.name);

  /**
   * data.go.kr은 인증키를 인코딩/디코딩 두 가지로 발급한다.
   * 인코딩 키를 URLSearchParams에 넣으면 %가 %25로 이중 인코딩되어 인증이 실패하므로,
   * 이미 인코딩된 키면 그대로 쓴다.
   */
  private get encodedServiceKey(): string {
    const key = process.env.TOUR_API_SERVICE_KEY;
    if (!key) {
      throw new Error('TOUR_API_SERVICE_KEY 환경변수가 설정되지 않았습니다.');
    }

    return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
  }

  /**
   * 지역 후보 풀을 받아온다.
   * 대분류별로 1회씩만 호출하고, 중분류 필터링과 반경 탐색은 메모리에서 처리한다.
   */
  async fetchPool(region: Region, queries: PoolQuery[]): Promise<TourSpot[]> {
    return this.fetch(queries, AREA_CODE[region]);
  }

  /**
   * 지역을 정하지 않고 전국에서 받아온다.
   * areaCode를 빼면 TourAPI가 전국을 준다. 프로필에 지역이 없어서
   * 어디를 추천할지 모를 때 쓴다.
   */
  async fetchNationwide(queries: PoolQuery[]): Promise<TourSpot[]> {
    return this.fetch(queries);
  }

  private async fetch(
    queries: PoolQuery[],
    areaCode?: string,
  ): Promise<TourSpot[]> {
    const results = await Promise.all(
      queries.map((query) => this.fetchOne(areaCode, query)),
    );

    // 대분류가 겹치는 조건이 있으면 같은 장소가 중복될 수 있다.
    const byContentId = new Map<string, TourSpot>();
    for (const spot of results.flat()) {
      if (!byContentId.has(spot.contentId))
        byContentId.set(spot.contentId, spot);
    }

    return [...byContentId.values()];
  }

  /**
   * 장소 소개글(overview)을 contentId별로 받아온다.
   *
   * 목록 조회(areaBasedList2)에는 없는 필드라 detailCommon2를 한 번 더 부른다.
   * 코스 하나에 4곳뿐이라 병렬로 던지고, 한 곳이 실패해도 코스는 만들어져야 하므로
   * 못 받은 장소는 지도에서 빠지듯 그냥 빠진다(Map에 안 담김).
   */
  async fetchOverviews(contentIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(contentIds)];

    const entries = await Promise.all(
      unique.map(async (contentId) => {
        const overview = await this.fetchOverview(contentId);
        return overview ? ([contentId, overview] as const) : null;
      }),
    );

    return new Map(entries.filter((entry) => entry !== null));
  }

  private async fetchOverview(contentId: string): Promise<string | null> {
    const params = new URLSearchParams({
      MobileOS: 'ETC',
      MobileApp: 'Haengyeon',
      _type: 'json',
      contentId,
    });

    const url = `${BASE_URL}/detailCommon2?serviceKey=${this.encodedServiceKey}&${params}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(
          `TourAPI 소개글 응답 실패 (${response.status}) contentId=${contentId}`,
        );
        return null;
      }

      const body = await response.json();
      const raw = body?.response?.body?.items?.item;
      const item = Array.isArray(raw) ? raw[0] : raw;

      return toPlainText(item?.overview);
    } catch (error) {
      // 소개글은 없어도 코스가 성립한다. 하나 실패했다고 생성을 막지 않는다
      this.logger.warn(
        `TourAPI 소개글 호출 실패 contentId=${contentId}: ${error}`,
      );
      return null;
    }
  }

  private async fetchOne(
    areaCode: string | undefined,
    query: PoolQuery,
  ): Promise<TourSpot[]> {
    const params = new URLSearchParams({
      MobileOS: 'ETC',
      MobileApp: 'Haengyeon',
      _type: 'json',
      numOfRows: String(NUM_OF_ROWS),
      pageNo: '1',
      // 대표이미지 보유 순
      arrange: 'R',
    });

    // 빼면 전국
    if (areaCode) params.set('areaCode', areaCode);
    if (query.lclsSystm1) params.set('lclsSystm1', query.lclsSystm1);
    if (query.contentTypeId) params.set('contentTypeId', query.contentTypeId);

    // serviceKey는 인코딩된 상태라 URLSearchParams를 거치지 않는다
    const url = `${BASE_URL}/areaBasedList2?serviceKey=${this.encodedServiceKey}&${params}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(
          `TourAPI 응답 실패 (${response.status}) areaCode=${areaCode ?? '전국'} ${JSON.stringify(query)}`,
        );
        return [];
      }

      const body = await response.json();
      return this.parseItems(body);
    } catch (error) {
      // 조회 1건이 실패해도 나머지로 코스를 만들 수 있어야 한다
      this.logger.warn(
        `TourAPI 호출 실패 areaCode=${areaCode ?? '전국'} ${JSON.stringify(query)}: ${error}`,
      );
      return [];
    }
  }

  private parseItems(body: any): TourSpot[] {
    // 결과가 없으면 items가 빈 문자열('')로 오는 경우가 있다.
    const items = body?.response?.body?.items?.item;
    if (!Array.isArray(items)) return [];

    return items
      .map((item: RawTourItem) => this.toTourSpot(item))
      .filter((spot): spot is TourSpot => spot !== null);
  }

  private toTourSpot(item: RawTourItem): TourSpot | null {
    const latitude = Number(item.mapy);
    const longitude = Number(item.mapx);

    // 좌표가 없으면 거리 계산이 불가능하다
    if (
      !item.contentid ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null;
    }
    if (latitude === 0 || longitude === 0) return null;

    return {
      contentId: item.contentid,
      contentTypeId: item.contenttypeid ?? '',
      title: item.title ?? '',
      address: item.addr1 ?? '',
      // 시·도(areaCode) 안에서만 유일한 코드다. 안 주는 항목도 있어 null을 허용한다
      sigunguCode: item.sigungucode || null,
      legalSigunguCode: this.toLegalSigunguCode(item),
      latitude,
      longitude,
      firstImage: item.firstimage || null,
      lclsSystm1: item.lclsSystm1 || null,
      lclsSystm2: item.lclsSystm2 || null,
      lclsSystm3: item.lclsSystm3 || null,
    };
  }

  /**
   * 법정동 코드 두 조각을 붙여 행정구역 표준코드 5자리로 만든다.
   * 시·도 2자리 + 시군구 3자리 (서울 11 + 중구 140 = 11140).
   *
   * 길이가 안 맞으면 붙이지 않고 버린다. 어중간한 코드를 넘기면 지도에서
   * 엉뚱한 구에 스탬프가 찍히는데, 그건 값이 없는 것보다 나쁘다.
   */
  private toLegalSigunguCode(item: RawTourItem): string | null {
    const sido = item.lDongRegnCd;
    const sigungu = item.lDongSignguCd;
    if (!sido || !sigungu) return null;

    if (sido.length !== 2 || sigungu.length !== 3) {
      this.logger.warn(
        `법정동 코드 길이가 예상과 다릅니다. contentId=${item.contentid} ` +
          `lDongRegnCd=${sido} lDongSignguCd=${sigungu}`,
      );
      return null;
    }

    return `${sido}${sigungu}`;
  }
}
