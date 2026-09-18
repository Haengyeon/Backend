// 코스는 양쪽 결제가 끝난 뒤에 만들어진다. 거기서 후보가 모자라면
// 돈은 냈는데 코스가 없는 상태가 된다. 그 전에 걸러내는 것이 preflight다.
//
// 실측으로 부산 북구(로컬맛집·액티비티), 서울 금천구(걷기여행)가 그렇게 실패한다.
import { CourseGeneratorService } from './course-generator.service';
import { CourseTheme, Region } from '../../generated/prisma/enums';
import { TourApiClient } from './tour-api.client';
import { TourSpot } from './types';

/** 좌표를 km 간격으로 흩어 놓은 가짜 후보. 분류는 전부 통과하도록 넉넉히 준다 */
function pool(count: number, spacingKm: number): TourSpot[] {
  const CATEGORIES = [
    ['NA', 'NA04'],
    ['FD', 'FD01'],
    ['FD', 'FD05'],
    ['VE', 'VE03'],
    ['SH', 'SH06'],
    ['EX', 'EX01'],
  ];

  return Array.from({ length: count }, (_, index) => {
    const [lclsSystm1, lclsSystm2] = CATEGORIES[index % CATEGORIES.length];
    return {
      contentId: `spot-${index}`,
      contentTypeId: '12',
      title: `장소 ${index}`,
      address: '서울특별시 중구 어딘가',
      sigunguCode: '24',
      legalSigunguCode: '11140',
      latitude: 37.5 + (index * spacingKm) / 110.57,
      longitude: 127.0,
      firstImage: 'https://example.com/a.jpg',
      lclsSystm1,
      lclsSystm2,
      lclsSystm3: null,
    };
  });
}

/** fetchPool 응답만 바꿔 끼운 생성기. 사전 판정은 DB도 소개글도 안 쓴다 */
function buildService(fetchPool: jest.Mock) {
  return new CourseGeneratorService(
    {} as never,
    {
      fetchPool,
    } as unknown as TourApiClient,
    {} as never,
  );
}

const THEMES = [CourseTheme.NATURE_HEALING, CourseTheme.LOCAL_FOOD_MARKET];

describe('preflight', () => {
  it('코스가 나오면 그 테마로 통과한다', async () => {
    const fetchPool = jest.fn().mockResolvedValue(pool(60, 0.3));
    const service = buildService(fetchPool);

    const result = await service.preflight(Region.SEOUL, '24', THEMES);

    expect(result.ok).toBe(true);
    expect(result.theme).toBe(THEMES[0]);
    expect(result.withinMoveBudget).toBe(true);
  });

  it('첫 테마가 되면 거기서 멈춘다', async () => {
    // 응답을 붙잡고 TourAPI를 부르는 중이라 호출을 아껴야 한다
    const fetchPool = jest.fn().mockResolvedValue(pool(60, 0.3));
    const service = buildService(fetchPool);

    await service.preflight(Region.SEOUL, '24', THEMES);

    expect(fetchPool).toHaveBeenCalledTimes(1);
  });

  it('첫 테마가 안 되면 다음 테마로 넘어간다', async () => {
    const fetchPool = jest
      .fn()
      .mockResolvedValueOnce(pool(2, 0.3)) // 4곳을 못 채운다
      .mockResolvedValueOnce(pool(60, 0.3));
    const service = buildService(fetchPool);

    const result = await service.preflight(Region.SEOUL, '24', THEMES);

    expect(result.ok).toBe(true);
    expect(result.theme).toBe(THEMES[1]);
    expect(fetchPool).toHaveBeenCalledTimes(2);
  });

  it('어떤 테마로도 안 되면 막는다', async () => {
    // 여기서 통과시키면 결제만 끝나고 코스가 없는 상태가 된다
    const fetchPool = jest.fn().mockResolvedValue(pool(2, 0.3));
    const service = buildService(fetchPool);

    const result = await service.preflight(Region.SEOUL, '24', THEMES);

    expect(result.ok).toBe(false);
  });

  it('이동 시간이 예산을 넘어도 막지는 않는다', async () => {
    // 코스는 나오므로 결제가 깨지지 않는다.
    // 넓은 군을 통째로 매칭 불가로 만드는 것은 기획이 정할 일이다
    const fetchPool = jest.fn().mockResolvedValue(pool(60, 20));
    const service = buildService(fetchPool);

    const result = await service.preflight(Region.SEOUL, '24', THEMES);

    expect(result.ok).toBe(true);
    expect(result.withinMoveBudget).toBe(false);
  });

  it('예산 안에 드는 테마가 있으면 그쪽을 고른다', async () => {
    const fetchPool = jest
      .fn()
      .mockResolvedValueOnce(pool(60, 20)) // 코스는 나오지만 이동이 길다
      .mockResolvedValueOnce(pool(60, 0.3));
    const service = buildService(fetchPool);

    const result = await service.preflight(Region.SEOUL, '24', THEMES);

    expect(result.theme).toBe(THEMES[1]);
    expect(result.withinMoveBudget).toBe(true);
  });

  it('TourAPI가 죽어도 매칭을 막지 않는다', async () => {
    // 여기서 막으면 외부 서비스가 흔들릴 때 매칭이 통째로 멈춘다
    const fetchPool = jest
      .fn()
      .mockRejectedValue(new Error('TourAPI 타임아웃'));
    const service = buildService(fetchPool);

    const result = await service.preflight(Region.SEOUL, '24', THEMES);

    expect(result.ok).toBe(true);
  });
});

// 매칭 한 건이 같은 풀을 여러 번 받는다 — 사전 판정에서 테마마다 한 번,
// 결제 뒤 실제 생성에서 또 한 번. 개발계정 한도가 엔드포인트별 1,000건이라 크다.
describe('후보 풀 캐시', () => {
  it('같은 지역·테마는 TourAPI를 다시 부르지 않는다', async () => {
    const fetchPool = jest.fn().mockResolvedValue(pool(12, 1));
    const service = buildService(fetchPool);

    await service.preflight(Region.SEOUL, '24', [CourseTheme.NATURE_HEALING]);
    await service.preflight(Region.SEOUL, '24', [CourseTheme.NATURE_HEALING]);

    expect(fetchPool).toHaveBeenCalledTimes(1);
  });

  it('시군구가 다르면 따로 받는다', async () => {
    // 시군구 코드는 시·도 안에서만 유일해서, 지역을 빼면 엉뚱한 풀을 쓰게 된다
    const fetchPool = jest.fn().mockResolvedValue(pool(12, 1));
    const service = buildService(fetchPool);

    await service.preflight(Region.SEOUL, '24', [CourseTheme.NATURE_HEALING]);
    await service.preflight(Region.SEOUL, '17', [CourseTheme.NATURE_HEALING]);

    expect(fetchPool).toHaveBeenCalledTimes(2);
  });

  it('테마가 다르면 따로 받는다', async () => {
    const fetchPool = jest.fn().mockResolvedValue(pool(12, 1));
    const service = buildService(fetchPool);

    await service.preflight(Region.SEOUL, '24', [CourseTheme.NATURE_HEALING]);
    await service.preflight(Region.SEOUL, '24', [
      CourseTheme.LOCAL_FOOD_MARKET,
    ]);

    expect(fetchPool).toHaveBeenCalledTimes(2);
  });
});
