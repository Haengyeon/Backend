// 관공서 오픈 api 불러오는 곳
import { Injectable, Logger } from '@nestjs/common';
import { Region } from '../../generated/prisma/enums';
import { AREA_CODE, PoolQuery } from './tour-category';
import { TourFestival, TourSpot } from './types';

const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';

/** 조회 1건당 후보 수. 서울 FD가 1000건이 넘어 100건이면 편중된다. */
const NUM_OF_ROWS = 200;

/** 그날 진행 중인 행사는 수십~수백 건이라 한 페이지로 받는다 */
const FESTIVAL_NUM_OF_ROWS = 1000;

const TIMEOUT_MS = 5000;

/**
 * data.go.kr이 일일 한도 초과를 알리는 코드.
 *
 * 개발계정은 한도가 낮아서 홈을 몇 번 돌면 닿는다. 넘겼을 때 응답이
 * "결과 0건"과 똑같이 생겨서, 걸러내지 않으면 관광지가 없는 것처럼 보인다.
 */
const QUOTA_EXCEEDED_CODE = '22';

/** 남은 호출이 한도의 이 비율 아래로 떨어지면 알린다. 조치할 시간을 벌기 위해서다 */
const QUOTA_WARN_RATIO = 0.2;

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

/** TourAPI 날짜('20260917')를 'YYYY-MM-DD'로. 형식이 다르면 null */
function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return null;

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/** TourAPI 원본 응답 1건. 필드명이 전부 소문자인 것에 주의. */
interface RawTourItem {
  contentid?: string;
  contenttypeid?: string;
  title?: string;
  addr1?: string;
  sigungucode?: string;
  /** 행정구역 표준코드의 시·도 부분 (서울 = 11) */
  lDongRegnCd?: string;
  /** 행정구역 표준코드의 시군구 부분 (중구 = 140). 앞의 것과 붙이면 5자리가 된다 */
  lDongSignguCd?: string;
  mapx?: string;
  mapy?: string;
  firstimage?: string;
  lclsSystm1?: string;
  lclsSystm2?: string;
  lclsSystm3?: string;
  /** 행사 조회(searchFestival2)에만 온다. 'YYYYMMDD' */
  eventstartdate?: string;
  eventenddate?: string;
}

@Injectable()
export class TourApiClient {
  private readonly logger = new Logger(TourApiClient.name);

  /**
   * 엔드포인트별로 마지막에 확인한 잔여 호출 수.
   *
   * 우리가 세는 게 아니라 응답 헤더에 실려 온 값을 받아 적는 것이다.
   */
  private readonly quota = new Map<
    string,
    { limit: number; remaining: number }
  >();

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
  /**
   * 후보 장소를 긁어온다.
   *
   * sigunguCode를 주면 그 시군구 안에서만 찾는다.
   * 시·도 전체로 찾으면 서울 강남에서 노원까지 도는 코스가 나올 수 있어,
   * 매칭이 시군구 단위로 성사된 이상 후보도 같은 범위로 좁혀야 한다.
   */
  async fetchPool(
    region: Region,
    queries: PoolQuery[],
    sigunguCode?: string | null,
  ): Promise<TourSpot[]> {
    return this.fetch(queries, AREA_CODE[region], sigunguCode ?? undefined);
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
    sigunguCode?: string,
  ): Promise<TourSpot[]> {
    const results = await Promise.all(
      queries.map((query) => this.fetchOne(areaCode, query, sigunguCode)),
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

      this.trackQuota(response, 'detailCommon2');
      if (!response.ok) {
        this.logger.warn(
          `TourAPI 소개글 응답 실패 (${response.status}) contentId=${contentId}`,
        );
        return null;
      }

      const body = await this.readBody(
        response,
        `detailCommon2 contentId=${contentId}`,
      );
      if (!body) return null;

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

  /**
   * 그날 진행 중인 행사를 전국에서 받아온다.
   *
   * 시작일만 주면 아직 안 열린 행사까지 오므로 종료일에도 같은 날을 준다.
   * 실패는 null이다. 빈 목록과 구분해야 호출하는 쪽이 실패를 캐시하지 않는다.
   */
  async fetchOngoingFestivals(date: string): Promise<TourFestival[] | null> {
    const day = date.replace(/-/g, '');
    const params = new URLSearchParams({
      MobileOS: 'ETC',
      MobileApp: 'Haengyeon',
      _type: 'json',
      numOfRows: String(FESTIVAL_NUM_OF_ROWS),
      pageNo: '1',
      // 대표이미지 보유 순
      arrange: 'R',
      eventStartDate: day,
      eventEndDate: day,
    });

    const url = `${BASE_URL}/searchFestival2?serviceKey=${this.encodedServiceKey}&${params}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      this.trackQuota(response, 'searchFestival2');
      if (!response.ok) {
        this.logger.warn(
          `TourAPI 행사 응답 실패 (${response.status}) date=${day}`,
        );
        return null;
      }

      const body = await this.readBody(response, `searchFestival2 date=${day}`);
      if (!body) return null;

      const total = Number(body.response.body?.totalCount);
      if (total > FESTIVAL_NUM_OF_ROWS) {
        this.logger.warn(
          `진행 중 행사 ${total}건 중 ${FESTIVAL_NUM_OF_ROWS}건만 받았습니다. date=${day}`,
        );
      }

      // 결과가 없으면 items가 빈 문자열('')로 온다
      const items = body.response.body?.items?.item;
      if (!Array.isArray(items)) return [];

      return items
        .map((item: RawTourItem) => this.toTourFestival(item))
        .filter((festival): festival is TourFestival => festival !== null);
    } catch (error) {
      this.logger.warn(`TourAPI 행사 호출 실패 date=${day}: ${error}`);
      return null;
    }
  }

  /**
   * 응답 헤더에 실려 온 잔여 호출 수를 받아 적는다.
   *
   * data.go.kr이 x-ratelimit-limit / x-ratelimit-remaining으로 알려준다.
   * 직접 세는 것보다 정확하다 — 서버를 재시작해도 이어지고, 다른 데서 부른 것까지
   * 합산된 값이다. 한도도 헤더가 알려주므로 개발계정인지 운영계정인지 코드가
   * 몰라도 되고, 승인이 나면 저절로 새 한도를 따른다.
   */
  private trackQuota(response: Response, endpoint: string): void {
    const limit = Number(response.headers.get('x-ratelimit-limit'));
    const left = Number(response.headers.get('x-ratelimit-remaining'));
    if (!Number.isFinite(limit) || !Number.isFinite(left) || limit <= 0) return;

    const before = this.quota.get(endpoint)?.remaining ?? limit;
    this.quota.set(endpoint, { limit, remaining: left });

    // 문턱을 넘어서는 순간에만 알린다. 매 호출마다 찍으면 로그에 묻힌다
    const threshold = Math.floor(limit * QUOTA_WARN_RATIO);
    if (left <= 0) {
      this.logger.error(
        `TourAPI ${endpoint} 일일 한도를 다 썼습니다 (한도 ${limit})`,
      );
    } else if (left <= threshold && before > threshold) {
      this.logger.warn(
        `TourAPI ${endpoint} 남은 호출이 ${left}건입니다 (한도 ${limit})`,
      );
    }
  }

  /** 엔드포인트별 잔여 호출 수. 운영 점검용 */
  quotaRemaining(): Record<string, { limit: number; remaining: number }> {
    return Object.fromEntries(this.quota);
  }

  /**
   * 응답 본문을 읽어 JSON으로 만든다. 오류면 null.
   *
   * data.go.kr은 한도 초과나 키 오류도 HTTP 200으로 내려보낸다. 게이트웨이가
   * _type=json을 무시하고 XML로 덮어쓰는 경우도 있어 본문을 글자로 먼저 받는다.
   *
   * 여기서 걸러내지 않으면 오류 응답이 "결과 0건"으로 둔갑한다. 그러면 홈은
   * 빈 화면이 되고 코스는 후보를 못 찾아 생성이 실패하는데, 로그에 아무것도
   * 남지 않아 원인을 찾을 수 없다.
   */
  private async readBody(response: Response, where: string): Promise<any> {
    const text = await response.text();

    // 게이트웨이가 XML로 내려보내는 오류. JSON.parse에 걸리기 전에 먼저 본다
    if (
      text.includes(
        `<returnReasonCode>${QUOTA_EXCEEDED_CODE}</returnReasonCode>`,
      )
    ) {
      this.logger.error(`TourAPI 일일 한도를 초과했습니다. ${where}`);
      return null;
    }

    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      this.logger.warn(
        `TourAPI 응답을 해석할 수 없습니다. ${where}: ${text.slice(0, 200)}`,
      );
      return null;
    }

    // 오류는 두 모양으로 온다. 정상 경로를 탄 오류는 response.header 안에,
    // 게이트웨이가 먼저 막은 오류(한도 초과·키 오류)는 최상위에 실려 온다.
    const code = body?.response?.header?.resultCode ?? body?.resultCode;
    if (code !== undefined && code !== '0000') {
      if (code === QUOTA_EXCEEDED_CODE) {
        this.logger.error(`TourAPI 일일 한도를 초과했습니다. ${where}`);
      } else {
        const message =
          body?.response?.header?.resultMsg ?? body?.resultMsg ?? '';
        this.logger.warn(`TourAPI 조회 오류 (${code}) ${where}: ${message}`);
      }
      return null;
    }

    return body;
  }

  private async fetchOne(
    areaCode: string | undefined,
    query: PoolQuery,
    sigunguCode?: string,
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
    // areaCode 없이 sigunguCode만 보내면 TourAPI가 무시한다. 항상 짝으로 보낸다.
    if (areaCode && sigunguCode) params.set('sigunguCode', sigunguCode);
    if (query.lclsSystm1) params.set('lclsSystm1', query.lclsSystm1);
    if (query.contentTypeId) params.set('contentTypeId', query.contentTypeId);

    // serviceKey는 인코딩된 상태라 URLSearchParams를 거치지 않는다
    const url = `${BASE_URL}/areaBasedList2?serviceKey=${this.encodedServiceKey}&${params}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      this.trackQuota(response, 'areaBasedList2');

      if (!response.ok) {
        this.logger.warn(
          `TourAPI 응답 실패 (${response.status}) areaCode=${areaCode ?? '전국'} ${JSON.stringify(query)}`,
        );
        return [];
      }

      const body = await this.readBody(
        response,
        `areaBasedList2 areaCode=${areaCode ?? '전국'} ${JSON.stringify(query)}`,
      );
      if (!body) return [];

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
   * 두 조각을 붙여 행정구역 표준코드 5자리로 만든다.
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
        `행정구역 표준코드 길이가 예상과 다릅니다. contentId=${item.contentid} ` +
          `lDongRegnCd=${sido} lDongSignguCd=${sigungu}`,
      );
      return null;
    }

    return `${sido}${sigungu}`;
  }

  private toTourFestival(item: RawTourItem): TourFestival | null {
    const startDate = toIsoDate(item.eventstartdate);
    const endDate = toIsoDate(item.eventenddate);

    // 기간이 없으면 진행 중인지 판단할 수 없다
    if (!item.contentid || !item.title || !startDate || !endDate) return null;

    return {
      contentId: item.contentid,
      title: item.title,
      address: item.addr1 ?? '',
      startDate,
      endDate,
      firstImage: item.firstimage || null,
      lclsSystm3: item.lclsSystm3 || null,
    };
  }
}
