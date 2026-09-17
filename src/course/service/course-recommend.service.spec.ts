// 홈 추천 관광지의 소개글.
//
// 목록 조회에는 소개글이 없어서 장소마다 TourAPI를 한 번 더 부른다.
// 홈은 자주 열리므로 화면에 나갈 장소만, 캐시에 없을 때만 부르는지 본다.
import { Logger } from '@nestjs/common';
import { CourseRecommendService } from './course-recommend.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TourApiClient } from '../algorithm/tour-api.client';
import { TourSpot } from '../algorithm/types';

const USER_ID = 'user-1';
const HOUR_MS = 60 * 60 * 1000;

function spot(contentId: string): TourSpot {
  return {
    contentId,
    // 취미가 없으면 전체 테마를 보고, 포토스팟 테마가 관광지(12)를 모두 받는다
    contentTypeId: '12',
    title: `장소-${contentId}`,
    address: '서울특별시 중구 세종대로 99',
    sigunguCode: null,
    legalSigunguCode: null,
    latitude: 37.5,
    longitude: 127.0,
    firstImage: 'https://example.com/image.jpg',
    lclsSystm1: null,
    lclsSystm2: null,
    lclsSystm3: null,
  };
}

function buildService(overviews: Map<string, string>) {
  const prisma = {
    profile: { findUnique: jest.fn().mockResolvedValue({ hobbies: [] }) },
    courseSpot: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const fetchOverviews = jest.fn().mockResolvedValue(overviews);
  const tourApi = {
    fetchNationwide: jest.fn().mockResolvedValue([spot('1001'), spot('1002')]),
    fetchOverviews,
  } as unknown as TourApiClient;

  return {
    service: new CourseRecommendService(
      prisma as unknown as PrismaService,
      tourApi,
    ),
    fetchOverviews,
  };
}

describe('CourseRecommendService — 추천 관광지 소개글', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('소개글이 없는 장소는 null이고, 긴 소개글은 문장 끝에서 자른다', async () => {
    const { service } = buildService(
      new Map([
        [
          '1001',
          '중명전은 대한제국의 중요한 현장이다. 1904년 경운궁 대화재 이후 중명전으로 거처를 옮긴 고종황제의 편전으로 사용되었다.',
        ],
      ]),
    );

    const { items } = await service.recommend(USER_ID, {});

    expect(items.map((item) => [item.contentId, item.description])).toEqual([
      ['1001', '중명전은 대한제국의 중요한 현장이다.'],
      ['1002', null],
    ]);
  });

  it('화면에 나갈 장소만 소개글을 부른다', async () => {
    // 후보 전체를 부르면 홈을 열 때마다 TourAPI 한도가 녹는다
    const { service, fetchOverviews } = buildService(new Map());

    await service.recommend(USER_ID, { limit: 1 });

    expect(fetchOverviews).toHaveBeenCalledWith(['1001']);
  });

  it('받아 둔 소개글은 다시 부르지 않고, 못 받은 곳만 1시간 뒤 다시 부른다', async () => {
    const { service, fetchOverviews } = buildService(
      new Map([['1001', '흥화문은 경희궁의 정문이다.']]),
    );
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);

    await service.recommend(USER_ID, {});
    await service.recommend(USER_ID, {});
    expect(fetchOverviews).toHaveBeenCalledTimes(1);

    // 원래 소개글이 없는 곳인지 일시 장애였는지 몰라서 짧게만 기억한다
    clock.mockReturnValue(now + HOUR_MS);
    await service.recommend(USER_ID, {});

    expect(fetchOverviews).toHaveBeenCalledTimes(2);
    expect(fetchOverviews).toHaveBeenLastCalledWith(['1002']);
  });
});
