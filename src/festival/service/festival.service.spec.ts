// 홈 하단 "진행중인 축제·공연·행사" 목록.
//
// TourAPI와 프로필은 목 처리하고, 거르기·정렬·페이징과 캐시가 언제 풀리는지를 본다.
import { Logger } from '@nestjs/common';
import { FestivalService } from './festival.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Hobby } from '../../generated/prisma/enums';
import { TourApiClient } from '../../course/algorithm/tour-api.client';
import { TourFestival } from '../../course/algorithm/types';

const USER_ID = 'user-1';

/** 2026-09-17 12:00 KST */
const NOON_KST = new Date('2026-09-17T03:00:00Z');

const MINUTE = 60 * 1000;

const OTHER_EVENT = 'EV030400'; // 기타행사. 어떤 취미에도 안 맞는다
const MOVIE = 'EV020800';
const EXHIBITION = 'EV030100';
const ART_FESTIVAL = 'EV010200';

function festival(
  overrides: Partial<TourFestival> & { contentId: string },
): TourFestival {
  return {
    title: `행사 ${overrides.contentId}`,
    address: '서울특별시 중구 세종대로 110',
    startDate: '2026-09-15',
    endDate: '2026-09-20',
    firstImage: `https://tong.visitkorea.or.kr/${overrides.contentId}.jpg`,
    lclsSystm3: OTHER_EVENT,
    ...overrides,
  };
}

/** hobbies가 null이면 프로필이 없는 사용자 */
function buildService(
  result: TourFestival[] | null,
  hobbies: Hobby[] | null = [],
) {
  const fetchOngoingFestivals = jest.fn().mockResolvedValue(result);
  const findUnique = jest.fn().mockResolvedValue(hobbies ? { hobbies } : null);

  const service = new FestivalService(
    { profile: { findUnique } } as unknown as PrismaService,
    { fetchOngoingFestivals } as unknown as TourApiClient,
  );

  return { service, fetchOngoingFestivals, findUnique };
}

const idsOf = (response: { items: { contentId: string }[] }) =>
  response.items.map((item) => item.contentId);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOON_KST);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('listOngoing', () => {
  it('한국 날짜로 조회한다', async () => {
    // 09-17 00:30 KST는 UTC로 아직 09-16이다
    jest.setSystemTime(new Date('2026-09-16T15:30:00Z'));
    const { service, fetchOngoingFestivals } = buildService([]);

    await service.listOngoing(USER_ID, {});

    expect(fetchOngoingFestivals).toHaveBeenCalledWith('2026-09-17');
  });

  it('최근에 시작한 행사부터, 시작일이 같으면 먼저 끝나는 것부터 준다', async () => {
    const { service } = buildService([
      festival({
        contentId: '1',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      }),
      festival({
        contentId: '2',
        startDate: '2026-09-16',
        endDate: '2026-09-20',
      }),
      festival({
        contentId: '3',
        startDate: '2026-09-16',
        endDate: '2026-09-19',
      }),
    ]);

    const response = await service.listOngoing(USER_ID, {});

    expect(idsOf(response)).toEqual(['3', '2', '1']);
  });

  it('포스터가 없거나 오늘 진행 중이 아닌 행사는 뺀다', async () => {
    const { service } = buildService([
      festival({ contentId: 'no-image', firstImage: null }),
      festival({
        contentId: 'ended',
        startDate: '2026-09-01',
        endDate: '2026-09-16',
      }),
      festival({
        contentId: 'upcoming',
        startDate: '2026-09-18',
        endDate: '2026-09-20',
      }),
      festival({
        contentId: 'today',
        startDate: '2026-09-17',
        endDate: '2026-09-17',
      }),
    ]);

    const response = await service.listOngoing(USER_ID, {});

    expect(idsOf(response)).toEqual(['today']);
  });

  it('화면에 쓰는 필드만 옮긴다', async () => {
    const { service } = buildService([
      festival({
        contentId: '4107768',
        title: '국립현대무용단 〈자리와 주름: 영월〉',
        address: '강원특별자치도 영월군 북면 밤재로 231-9',
        startDate: '2026-09-16',
        endDate: '2026-09-19',
        firstImage: 'https://tong.visitkorea.or.kr/poster.jpg',
        lclsSystm3: 'EV020500',
      }),
    ]);

    const response = await service.listOngoing(USER_ID, {});

    expect(response.items).toEqual([
      {
        contentId: '4107768',
        name: '국립현대무용단 〈자리와 주름: 영월〉',
        startDate: '2026-09-16',
        endDate: '2026-09-19',
        imageUrl: 'https://tong.visitkorea.or.kr/poster.jpg',
        address: '강원특별자치도 영월군 북면 밤재로 231-9',
      },
    ]);
  });

  it('커서로 다음 페이지를 이어 받는다', async () => {
    const { service } = buildService(
      ['1', '2', '3'].map((contentId) => festival({ contentId })),
    );

    const first = await service.listOngoing(USER_ID, { limit: 2 });
    expect(idsOf(first)).toEqual(['1', '2']);
    expect(first.hasMore).toBe(true);

    const second = await service.listOngoing(USER_ID, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(idsOf(second)).toEqual(['3']);
    expect(second).toMatchObject({ hasMore: false, nextCursor: null });
  });
});

describe('listOngoing - 취미 순서', () => {
  // 날짜순이면 recent → movie-new → older → movie-old
  const mixed = () => [
    festival({ contentId: 'recent', startDate: '2026-09-17' }),
    festival({
      contentId: 'movie-new',
      startDate: '2026-09-16',
      lclsSystm3: MOVIE,
    }),
    festival({ contentId: 'older', startDate: '2026-09-15' }),
    festival({
      contentId: 'movie-old',
      startDate: '2026-09-01',
      lclsSystm3: MOVIE,
    }),
  ];

  it('취미에 맞는 행사가 앞에 오고, 그 안과 나머지는 최근 시작 순을 지킨다', async () => {
    const { service, findUnique } = buildService(mixed(), [Hobby.MOVIE]);

    const response = await service.listOngoing(USER_ID, {});

    expect(idsOf(response)).toEqual([
      'movie-new',
      'movie-old',
      'recent',
      'older',
    ]);
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      select: { hobbies: true },
    });
  });

  it('여러 취미에 맞을수록 앞에 온다', async () => {
    // 전시회는 미술·전시 둘 다에, 문화예술축제는 미술에만 맞는다
    const { service } = buildService(
      [
        festival({
          contentId: 'art-festival',
          startDate: '2026-09-17',
          lclsSystm3: ART_FESTIVAL,
        }),
        festival({ contentId: 'other', startDate: '2026-09-16' }),
        festival({
          contentId: 'exhibition',
          startDate: '2026-09-10',
          lclsSystm3: EXHIBITION,
        }),
      ],
      [Hobby.ART, Hobby.EXHIBITION],
    );

    const response = await service.listOngoing(USER_ID, {});

    expect(idsOf(response)).toEqual(['exhibition', 'art-festival', 'other']);
  });

  it.each([
    ['맞는 분류가 없는 취미', [Hobby.IT, Hobby.CAFE]],
    ['프로필이 없는 사용자', null],
  ])('%s면 최근 시작 순 그대로다', async (_, hobbies) => {
    const { service } = buildService(mixed(), hobbies);

    const response = await service.listOngoing(USER_ID, {});

    expect(idsOf(response)).toEqual([
      'recent',
      'movie-new',
      'older',
      'movie-old',
    ]);
  });

  it('한 사람의 취미 순서가 캐시된 목록에 남지 않는다', async () => {
    const { service, findUnique } = buildService(mixed(), [Hobby.MOVIE]);
    await service.listOngoing('movie-fan', {});

    findUnique.mockResolvedValue({ hobbies: [] });
    const response = await service.listOngoing('someone-else', {});

    expect(idsOf(response)).toEqual([
      'recent',
      'movie-new',
      'older',
      'movie-old',
    ]);
  });

  it('취미 순서에서도 커서가 이어진다', async () => {
    const { service } = buildService(mixed(), [Hobby.MOVIE]);

    const first = await service.listOngoing(USER_ID, { limit: 2 });
    const second = await service.listOngoing(USER_ID, {
      limit: 2,
      cursor: first.nextCursor!,
    });

    expect(idsOf(first)).toEqual(['movie-new', 'movie-old']);
    expect(idsOf(second)).toEqual(['recent', 'older']);
  });
});

describe('listOngoing - 캐시', () => {
  it('같은 날에는 한 시간 동안 TourAPI를 다시 부르지 않는다', async () => {
    const { service, fetchOngoingFestivals } = buildService([
      festival({ contentId: '1' }),
    ]);

    await service.listOngoing(USER_ID, {});
    jest.advanceTimersByTime(59 * MINUTE);
    await service.listOngoing(USER_ID, {});
    expect(fetchOngoingFestivals).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2 * MINUTE);
    await service.listOngoing(USER_ID, {});
    expect(fetchOngoingFestivals).toHaveBeenCalledTimes(2);
  });

  it('자정이 지나면 한 시간이 안 됐어도 새 날짜로 다시 부른다', async () => {
    // 캐시를 그대로 쓰면 어제 끝난 행사가 남는다
    jest.setSystemTime(new Date('2026-09-17T14:50:00Z')); // 23:50 KST
    const { service, fetchOngoingFestivals } = buildService([]);

    await service.listOngoing(USER_ID, {});
    jest.advanceTimersByTime(15 * MINUTE); // 00:05 KST
    await service.listOngoing(USER_ID, {});

    expect(fetchOngoingFestivals.mock.calls).toEqual([
      ['2026-09-17'],
      ['2026-09-18'],
    ]);
  });

  it('조회에 실패하면 직전 목록을 오늘 기준으로 걸러 쓰고 1분 뒤 다시 부른다', async () => {
    jest.setSystemTime(new Date('2026-09-17T14:50:00Z')); // 23:50 KST
    const { service, fetchOngoingFestivals } = buildService([
      festival({ contentId: 'ends-17th', endDate: '2026-09-17' }),
      festival({ contentId: 'ends-20th', endDate: '2026-09-20' }),
    ]);
    await service.listOngoing(USER_ID, {});

    fetchOngoingFestivals.mockResolvedValue(null);
    jest.advanceTimersByTime(15 * MINUTE); // 00:05 KST

    const response = await service.listOngoing(USER_ID, {});
    expect(idsOf(response)).toEqual(['ends-20th']);

    // 실패 직후에는 다시 부르지 않는다
    await service.listOngoing(USER_ID, {});
    expect(fetchOngoingFestivals).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(MINUTE + 1);
    await service.listOngoing(USER_ID, {});
    expect(fetchOngoingFestivals).toHaveBeenCalledTimes(3);
  });

  it('처음부터 실패하면 빈 목록을 준다', async () => {
    const { service } = buildService(null);

    await expect(service.listOngoing(USER_ID, {})).resolves.toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
  });
});
