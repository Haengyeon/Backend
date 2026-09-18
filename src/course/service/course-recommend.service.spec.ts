// 홈 추천 관광지의 소개글.
//
// 목록 조회에는 소개글이 없어서 장소마다 TourAPI를 한 번 더 부른다.
// 홈은 자주 열리므로 화면에 나갈 장소만 부르는지, 받은 원문을 어떻게 줄이는지 본다.
// 같은 장소를 다시 부르지 않는 것은 SpotDescriptionService가 맡는다.
import { Logger } from '@nestjs/common';
import { CourseRecommendService } from './course-recommend.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TourApiClient } from '../algorithm/tour-api.client';
import { SpotDescriptionService } from './spot-description.service';
import { TourSpot } from '../algorithm/types';

const USER_ID = 'user-1';

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
    // 소개글은 DB에 쌓인다. 여기서는 늘 비어 있다고 보고 TourAPI를 타게 둔다 —
    // 무엇을 부르는지가 이 파일의 관심사다. 재호출 여부는 SpotDescriptionService 몫
    spotDescription: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaService;

  const fetchOverviews = jest.fn().mockResolvedValue(overviews);
  const tourApi = {
    fetchNationwide: jest.fn().mockResolvedValue([spot('1001'), spot('1002')]),
    fetchOverviews,
  } as unknown as TourApiClient;

  return {
    service: new CourseRecommendService(
      prisma,
      tourApi,
      new SpotDescriptionService(prisma, tourApi),
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
});
