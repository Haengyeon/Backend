// 행사 조회(searchFestival2)를 어떻게 부르고 응답을 어떻게 읽는지.
//
// 실제 TourAPI는 부르지 않고 fetch를 목 처리한다.
import { Logger } from '@nestjs/common';
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

function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
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
