// 행사 조회(searchFestival2)를 어떻게 부르고 응답을 어떻게 읽는지.
//
// 실제 TourAPI는 부르지 않고 fetch를 목 처리한다.
import { Logger } from '@nestjs/common';
import { Region } from '../../generated/prisma/enums';
import { TourApiClient } from './tour-api.client';

function festivalBody(items: unknown[]) {
  return {
    response: {
      header: { resultCode: '0000', resultMsg: 'OK' },
      body: {
        // 결과가 없으면 items 자리에 빈 문자열이 온다
        items: items.length > 0 ? { item: items } : '',
        numOfRows: 1000,
        pageNo: 1,
        totalCount: items.length,
      },
    },
  };
}

let fetchMock: jest.SpyInstance;

function respond(body: unknown, status = 200, remaining = 900, limit = 1000) {
  // 클라이언트가 본문을 글자로 먼저 받는다(게이트웨이가 XML로 덮어쓰는 경우가 있어서).
  // 문자열을 그대로 넘기면 XML 오류 응답을 흉내낼 수 있다.
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    // 클라이언트가 잔여 호출 수를 여기서 읽는다
    headers: new Headers({
      'x-ratelimit-limit': String(limit),
      'x-ratelimit-remaining': String(remaining),
    }),
    text: async () => text,
    json: async () => body,
  } as Response);
}

beforeEach(() => {
  jest.replaceProperty(process, 'env', {
    ...process.env,
    TOUR_API_SERVICE_KEY: 'test-key',
  });
  fetchMock = jest.spyOn(global, 'fetch');
  // 실패 경로에서 찍는 경고로 테스트 출력이 지저분해지지 않게 한다
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchOngoingFestivals', () => {
  it('시작일과 종료일에 같은 날을 넣는다', async () => {
    // 시작일만 넣으면 아직 안 열린 행사까지 온다
    respond(festivalBody([]));

    await new TourApiClient().fetchOngoingFestivals('2026-09-17');

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/B551011/KorService2/searchFestival2');
    expect(url.searchParams.get('eventStartDate')).toBe('20260917');
    expect(url.searchParams.get('eventEndDate')).toBe('20260917');
  });

  it('기간을 YYYY-MM-DD로 바꾸고 분류 코드를 챙기며, 기간이 없는 항목은 버린다', async () => {
    respond(
      festivalBody([
        {
          contentid: '4107768',
          title: '국립현대무용단 〈자리와 주름: 영월〉',
          addr1: '강원특별자치도 영월군 북면 밤재로 231-9',
          eventstartdate: '20260916',
          eventenddate: '20260919',
          firstimage: 'https://tong.visitkorea.or.kr/poster.jpg',
          lclsSystm3: 'EV020500',
        },
        {
          contentid: '4107769',
          title: '기간 없는 행사',
          eventstartdate: '',
          eventenddate: '20260919',
        },
      ]),
    );

    const festivals = await new TourApiClient().fetchOngoingFestivals(
      '2026-09-17',
    );

    expect(festivals).toEqual([
      {
        contentId: '4107768',
        title: '국립현대무용단 〈자리와 주름: 영월〉',
        address: '강원특별자치도 영월군 북면 밤재로 231-9',
        startDate: '2026-09-16',
        endDate: '2026-09-19',
        firstImage: 'https://tong.visitkorea.or.kr/poster.jpg',
        lclsSystm3: 'EV020500',
      },
    ]);
  });

  it('결과가 없으면 빈 목록이다', async () => {
    respond(festivalBody([]));

    await expect(
      new TourApiClient().fetchOngoingFestivals('2026-09-17'),
    ).resolves.toEqual([]);
  });

  describe('실패는 빈 목록과 구분되게 null이다', () => {
    it('200으로 온 오류 응답', async () => {
      // 필수값이 빠지면 TourAPI가 실제로 이렇게 준다
      respond({
        responseTime: '2026-09-17T14:14:42.619',
        resultCode: '11',
        resultMsg: 'NO_MANDATORY_REQUEST_PARAMETERS_ERROR1(eventStartDate)',
      });

      await expect(
        new TourApiClient().fetchOngoingFestivals('2026-09-17'),
      ).resolves.toBeNull();
    });

    it('HTTP 오류', async () => {
      respond({}, 500);

      await expect(
        new TourApiClient().fetchOngoingFestivals('2026-09-17'),
      ).resolves.toBeNull();
    });

    it('타임아웃', async () => {
      fetchMock.mockRejectedValue(new Error('The operation was aborted'));

      await expect(
        new TourApiClient().fetchOngoingFestivals('2026-09-17'),
      ).resolves.toBeNull();
    });
  });
});

// 일일 한도를 넘기면 data.go.kr이 200에 오류를 담아 보낸다. 걸러내지 않으면
// "결과 0건"과 구분되지 않아, 홈이 비고 코스 생성이 실패해도 원인을 알 수 없다.
describe('일일 한도 초과', () => {
  let error: jest.SpyInstance;

  beforeEach(() => {
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  it('JSON으로 오면 빈 결과가 아니라 실패로 다룬다', async () => {
    respond({
      resultCode: '22',
      resultMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR',
    });

    await expect(
      new TourApiClient().fetchOngoingFestivals('2026-09-17'),
    ).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('일일 한도를 초과'),
    );
  });

  it('게이트웨이가 XML로 덮어써도 알아챈다', async () => {
    // _type=json을 줘도 게이트웨이 단계 오류는 XML로 오는 경우가 있다
    respond(
      '<OpenAPI_ServiceResponse><cmmMsgHeader>' +
        '<returnReasonCode>22</returnReasonCode>' +
        '</cmmMsgHeader></OpenAPI_ServiceResponse>',
    );

    await expect(
      new TourApiClient().fetchOngoingFestivals('2026-09-17'),
    ).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('일일 한도를 초과'),
    );
  });

  it('후보 조회도 조용히 0건으로 넘어가지 않는다', async () => {
    // 여기서 놓치면 코스 생성이 "갈 만한 곳이 없다"로 실패한다
    respond({
      resultCode: '22',
      resultMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR',
    });

    await expect(
      new TourApiClient().fetchPool(Region.SEOUL, [{ contentTypeId: '12' }]),
    ).resolves.toEqual([]);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('일일 한도를 초과'),
    );
  });
});

// data.go.kr이 응답 헤더로 잔여 호출 수를 알려준다. 직접 세는 것보다 정확하다 —
// 재시작해도 이어지고 한도까지 알려줘서 개발/운영 계정을 코드가 몰라도 된다.
describe('잔여 호출 수', () => {
  it('헤더에서 읽어 둔다', async () => {
    respond(festivalBody([]), 200, 742, 1000);

    const client = new TourApiClient();
    await client.fetchOngoingFestivals('2026-09-17');

    expect(client.quotaRemaining()).toEqual({
      searchFestival2: { limit: 1000, remaining: 742 },
    });
  });

  it('한도의 20% 아래로 떨어지면 알린다', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    respond(festivalBody([]), 200, 150, 1000);

    await new TourApiClient().fetchOngoingFestivals('2026-09-17');

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('남은 호출이 150건'),
    );
  });

  it('다 쓰면 경고가 아니라 오류로 남긴다', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    respond(festivalBody([]), 200, 0, 1000);

    await new TourApiClient().fetchOngoingFestivals('2026-09-17');

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('일일 한도를 다 썼습니다'),
    );
  });

  it('헤더가 없으면 아무것도 기록하지 않는다', async () => {
    // 프록시가 헤더를 떼는 경우가 있다. 그래도 조회 자체는 되어야 한다
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(festivalBody([])),
      json: async () => festivalBody([]),
    } as Response);

    const client = new TourApiClient();
    await expect(client.fetchOngoingFestivals('2026-09-17')).resolves.toEqual(
      [],
    );
    expect(client.quotaRemaining()).toEqual({});
  });
});
