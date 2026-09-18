// 소개글을 언제 TourAPI에 물어보고 언제 DB에서 꺼내 쓰는지.
//
// 개발계정 한도가 엔드포인트별 하루 1,000건이라, 같은 장소를 다시 부르지 않는 것이
// 이 서비스의 존재 이유다.
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TourApiClient } from '../algorithm/tour-api.client';
import { SpotDescriptionService } from './spot-description.service';

const DAY_MS = 24 * 60 * 60 * 1000;

function buildService(
  stored: { contentId: string; overview: string | null; fetchedAt: Date }[],
  fetched: Map<string, string> = new Map(),
) {
  const prisma = {
    spotDescription: {
      findMany: jest.fn().mockResolvedValue(stored),
      upsert: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaService;

  const fetchOverviews = jest.fn().mockResolvedValue(fetched);
  const tourApi = { fetchOverviews } as unknown as TourApiClient;

  return {
    service: new SpotDescriptionService(prisma, tourApi),
    fetchOverviews,
  };
}

describe('SpotDescriptionService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('DB에 있으면 TourAPI를 부르지 않는다', async () => {
    const { service, fetchOverviews } = buildService([
      {
        contentId: '1001',
        overview: '흥화문은 경희궁의 정문이다.',
        fetchedAt: new Date(),
      },
    ]);

    await expect(service.overviewsOf(['1001'])).resolves.toEqual(
      new Map([['1001', '흥화문은 경희궁의 정문이다.']]),
    );
    expect(fetchOverviews).not.toHaveBeenCalled();
  });

  it('처음 보는 장소만 골라서 부른다', async () => {
    const { service, fetchOverviews } = buildService(
      [
        {
          contentId: '1001',
          overview: '있는 소개글이다.',
          fetchedAt: new Date(),
        },
      ],
      new Map([['1002', '새로 받은 소개글이다.']]),
    );

    const result = await service.overviewsOf(['1001', '1002']);

    expect(fetchOverviews).toHaveBeenCalledWith(['1002']);
    expect(result.get('1001')).toBe('있는 소개글이다.');
    expect(result.get('1002')).toBe('새로 받은 소개글이다.');
  });

  it('소개글이 없는 장소는 7일 안에는 다시 묻지 않는다', async () => {
    // 없는 것도 행을 남겨 두지 않으면 매번 다시 부르게 된다
    const { service, fetchOverviews } = buildService([
      {
        contentId: '1001',
        overview: null,
        fetchedAt: new Date(Date.now() - 6 * DAY_MS),
      },
    ]);

    await expect(service.overviewsOf(['1001'])).resolves.toEqual(
      new Map([['1001', null]]),
    );
    expect(fetchOverviews).not.toHaveBeenCalled();
  });

  it('7일이 지나면 없던 장소도 다시 물어본다', async () => {
    // 관광공사가 나중에 원문을 채워 넣는 경우가 있다
    const { service, fetchOverviews } = buildService(
      [
        {
          contentId: '1001',
          overview: null,
          fetchedAt: new Date(Date.now() - 8 * DAY_MS),
        },
      ],
      new Map([['1001', '이제는 생긴 소개글이다.']]),
    );

    const result = await service.overviewsOf(['1001']);

    expect(fetchOverviews).toHaveBeenCalledWith(['1001']);
    expect(result.get('1001')).toBe('이제는 생긴 소개글이다.');
  });

  it('저장이 실패해도 이번 응답은 그대로 내보낸다', async () => {
    const { service } = buildService(
      [],
      new Map([['1001', '받아온 소개글이다.']]),
    );
    (
      service as unknown as { prisma: { $transaction: jest.Mock } }
    ).prisma.$transaction.mockRejectedValue(new Error('DB 장애'));

    await expect(service.overviewsOf(['1001'])).resolves.toEqual(
      new Map([['1001', '받아온 소개글이다.']]),
    );
  });

  it('빈 목록이면 아무것도 하지 않는다', async () => {
    const { service, fetchOverviews } = buildService([]);

    await expect(service.overviewsOf([])).resolves.toEqual(new Map());
    expect(fetchOverviews).not.toHaveBeenCalled();
  });
});
