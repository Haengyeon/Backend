// 혼잡도는 실측이 아니라 규칙 기반 추정이다.
// 그래서 값이 아니라 순서(주말 > 평일, 점심 식당 > 오후 식당)를 검증한다.
// 테이블 숫자를 조정해도 순서가 유지되면 이 테스트는 안 깨진다.
import { CourseTheme } from '../../generated/prisma/enums';
import {
  createCongestionEstimator,
  dayTypeOf,
  hotspotIndex,
  timeCongestion,
} from './congestion';
import { COURSE_TEMPLATE } from './course-template';
import { CONGESTION_WEIGHT, scorePath } from './path-score';
import {
  MIN_CALM_COURSES,
  calmerCourses,
  selectCourse,
} from './spot-selection';
import { TimeBand, TourSpot } from './types';

const FRIDAY = new Date('2026-09-18T00:00:00Z');
const SATURDAY = new Date('2026-09-19T00:00:00Z');
const SUNDAY = new Date('2026-09-20T00:00:00Z');
const WEDNESDAY = new Date('2026-09-23T00:00:00Z');
const CHUSEOK_THURSDAY = new Date('2026-09-24T00:00:00Z');

const BANDS: TimeBand[] = ['MORNING', 'LUNCH', 'AFTERNOON', 'EVENING', 'NIGHT'];

/** 기준점(37.5, 127.0)에서 동·북쪽으로 km만큼 옮긴 가짜 후보 */
function spot(
  contentId: string,
  lclsSystm1: string | null,
  lclsSystm2: string | null,
  eastKm = 0,
  northKm = 0,
): TourSpot {
  return {
    contentId,
    contentTypeId: '12',
    title: `장소-${contentId}`,
    address: '서울특별시 중구',
    sigunguCode: '24',
    legalSigunguCode: '11140',
    latitude: 37.5 + northKm / 110.57,
    longitude: 127.0 + eastKm / 88.3,
    firstImage: 'https://example.com/image.jpg',
    lclsSystm1,
    lclsSystm2,
    lclsSystm3: null,
  };
}

const KINDS: [string, string][] = [
  ['FD', 'FD01'],
  ['FD', 'FD04'],
  ['FD', 'FD05'],
  ['SH', 'SH06'],
  ['VE', 'VE07'],
  ['HS', 'HS01'],
  ['VE', 'VE01'],
  ['VE', 'VE03'],
  ['NA', 'NA04'],
  ['LS', 'LS01'],
];

describe('혼잡도 - 요일 판정', () => {
  it('토·일은 주말, 수요일은 평일이다', () => {
    expect(dayTypeOf(SATURDAY, 'LUNCH')).toBe('WEEKEND');
    expect(dayTypeOf(SUNDAY, 'LUNCH')).toBe('WEEKEND');
    expect(dayTypeOf(WEDNESDAY, 'LUNCH')).toBe('WEEKDAY');
  });

  it('평일에 낀 공휴일(추석)은 주말로 본다', () => {
    expect(dayTypeOf(CHUSEOK_THURSDAY, 'AFTERNOON')).toBe('WEEKEND');
  });

  it('금요일은 저녁부터 주말처럼 본다', () => {
    expect(dayTypeOf(FRIDAY, 'LUNCH')).toBe('WEEKDAY');
    expect(dayTypeOf(FRIDAY, 'EVENING')).toBe('WEEKEND');
    expect(dayTypeOf(FRIDAY, 'NIGHT')).toBe('WEEKEND');
  });
});

describe('혼잡도 - 종류·시간대 추정', () => {
  it('어떤 종류·시간대·요일이든 0~1 사이다', () => {
    for (const [l1, l2] of KINDS) {
      for (const band of BANDS) {
        for (const dayType of ['WEEKDAY', 'WEEKEND'] as const) {
          const level = timeCongestion(spot('x', l1, l2), band, dayType);
          expect(level).toBeGreaterThanOrEqual(0);
          expect(level).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('같은 종류·시간대면 주말이 평일보다 붐빈다', () => {
    for (const [l1, l2] of KINDS) {
      for (const band of BANDS) {
        const target = spot('x', l1, l2);
        expect(timeCongestion(target, band, 'WEEKEND')).toBeGreaterThanOrEqual(
          timeCongestion(target, band, 'WEEKDAY'),
        );
      }
    }
  });

  it('식당은 점심이 오후보다 붐빈다', () => {
    const meal = spot('meal', 'FD', 'FD01');
    expect(timeCongestion(meal, 'LUNCH', 'WEEKEND')).toBeGreaterThan(
      timeCongestion(meal, 'AFTERNOON', 'WEEKEND'),
    );
  });

  it('카페는 오후가 오전보다 붐빈다', () => {
    const cafe = spot('cafe', 'FD', 'FD05');
    expect(timeCongestion(cafe, 'AFTERNOON', 'WEEKEND')).toBeGreaterThan(
      timeCongestion(cafe, 'MORNING', 'WEEKEND'),
    );
  });

  it('전망·랜드마크는 밤이 오전보다 붐빈다', () => {
    const landmark = spot('tower', 'VE', 'VE01');
    expect(timeCongestion(landmark, 'NIGHT', 'WEEKEND')).toBeGreaterThan(
      timeCongestion(landmark, 'MORNING', 'WEEKEND'),
    );
  });

  it('분류를 모르면 중립(0.5)이다', () => {
    expect(timeCongestion(spot('x', null, null), 'LUNCH', 'WEEKEND')).toBe(0.5);
    expect(timeCongestion(spot('x', 'VE', 'VE12'), 'LUNCH', 'WEEKEND')).toBe(
      0.5,
    );
  });

  it('템플릿이 슬롯마다 시간대를 적고, 야경은 밤·점심은 점심이다', () => {
    for (const slots of Object.values(COURSE_TEMPLATE)) {
      for (const slot of slots) {
        expect(BANDS).toContain(slot.timeBand);
        if (slot.role.includes('점심')) expect(slot.timeBand).toBe('LUNCH');
      }
    }
    expect(COURSE_TEMPLATE[CourseTheme.NIGHT_DATE][3].timeBand).toBe('NIGHT');
  });
});

describe('혼잡도 - 주변 밀집도 (관광지별 차이)', () => {
  // 0.1km 간격 5×5 격자 + 멀리 떨어진 한 곳. 반경 0.15km면 이웃 수가
  // 가운데 4 > 모서리 3 > 꼭짓점 2 > 외딴 곳 0으로 딱 떨어진다
  const grid: TourSpot[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      grid.push(spot(`g${row}${col}`, 'FD', 'FD05', col * 0.1, row * 0.1));
    }
  }
  const lonely = spot('lonely', 'FD', 'FD05', 10, 10);
  const index = hotspotIndex([...grid, lonely], 0.15);

  it('몰려 있을수록 높다 (가운데 > 모서리 > 꼭짓점 > 외딴 곳)', () => {
    const center = index.get('g22')!;
    const edge = index.get('g02')!;
    const corner = index.get('g00')!;

    expect(center).toBeGreaterThan(edge);
    expect(edge).toBeGreaterThan(corner);
    expect(corner).toBeGreaterThan(index.get('lonely')!);
  });

  it('0~1 백분위이고 동점은 같은 값을 받는다', () => {
    for (const value of index.values()) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(index.get('g00')).toBe(index.get('g44'));
  });

  it('비교할 대상이 없으면 중립이다', () => {
    expect(hotspotIndex([lonely], 1).get('lonely')).toBe(0.5);

    // 전부 외딴 곳이면 전부 동점
    const apart = [spot('a', 'FD', 'FD05', 0), spot('b', 'FD', 'FD05', 50)];
    expect([...hotspotIndex(apart, 1).values()]).toEqual([0.5, 0.5]);
  });

  it('같은 종류·시간대라도 번화가 카페가 골목 카페보다 붐빈다', () => {
    const congestionOf = createCongestionEstimator(
      [...grid, lonely],
      SATURDAY,
      0.15,
    );

    expect(congestionOf(grid[12], 'AFTERNOON')).toBeGreaterThan(
      congestionOf(lonely, 'AFTERNOON'),
    );
  });
});

describe('혼잡도 - 경로 점수', () => {
  const straight = [0, 1, 2, 3].map((km) => spot(`s${km}`, 'NA', 'NA04', km));

  it('혼잡도를 안 넘기면 예전 점수 그대로다', () => {
    expect(scorePath(straight, [0, 0, 0, 0]).score).toBe(
      scorePath(straight).score,
    );
  });

  it('거리가 같으면 한산한 경로가 이긴다', () => {
    expect(scorePath(straight, [0.2, 0.2, 0.2, 0.2]).score).toBeLessThan(
      scorePath(straight, [0.8, 0.8, 0.8, 0.8]).score,
    );
  });

  it(`혼잡도는 점수를 최대 ${CONGESTION_WEIGHT * 100}%까지만 움직인다`, () => {
    // 한산해도 그만큼 넘게 멀면 가까운 쪽을 고른다
    const longer = straight.map((target, index) =>
      spot(
        target.contentId,
        'NA',
        'NA04',
        index * (1 + CONGESTION_WEIGHT) * 1.01,
      ),
    );

    expect(scorePath(straight, [1, 1, 1, 1]).score).toBeLessThan(
      scorePath(longer, [0, 0, 0, 0]).score,
    );
  });
});

describe('혼잡도 - 코스 선정에 반영', () => {
  // 로컬맛집: 시장 -> 점심 -> 카페 -> 저녁. 저녁 후보 둘이 카페에서 같은 거리에 있다.
  // 한쪽은 전시관이 몰린 번화가, 한쪽은 한적한 곳이다. 전시관은 이 테마 슬롯에 안 들어간다
  const base = [
    spot('market', 'SH', 'SH06', 0),
    spot('lunch', 'FD', 'FD01', 0.3),
    spot('cafe', 'FD', 'FD05', 0.6),
  ];
  const busyDinner = spot('busy-dinner', 'FD', 'FD02', 0.9, 0.5);
  const busyStreet = [0, 1, 2, 3, 4, 5].map((i) =>
    spot(`gallery-${i}`, 'VE', 'VE07', 0.9 + (i % 3) * 0.05, 0.55 + i * 0.02),
  );

  const dinnerOf = (course: ReturnType<typeof selectCourse>) =>
    course!.spots[3].spot.contentId;

  it('여행일이 없으면 혼잡도를 매기지 않는다', () => {
    const quietDinner = spot('quiet-dinner', 'FD', 'FD02', 0.9, -0.5);
    const course = selectCourse(
      [...base, busyDinner, quietDinner, ...busyStreet],
      CourseTheme.LOCAL_FOOD_MARKET,
      'seed',
    );

    expect(course!.congestion).toBe(0);
    expect(course!.spots.every((item) => item.congestion === null)).toBe(true);
  });

  it('거리가 같으면 덜 붐비는 저녁 자리를 고른다 (시드와 무관)', () => {
    const quietDinner = spot('quiet-dinner', 'FD', 'FD02', 0.9, -0.5);
    const pool = [...base, busyDinner, quietDinner, ...busyStreet];

    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const course = selectCourse(
        pool,
        CourseTheme.LOCAL_FOOD_MARKET,
        seed,
        SATURDAY,
      );
      expect(dinnerOf(course)).toBe('quiet-dinner');
    }
  });

  it('한산해도 한참 멀면 가까운 곳을 고른다 (거리가 우선)', () => {
    const farQuietDinner = spot('far-quiet-dinner', 'FD', 'FD02', 2.5, -0.5);
    const course = selectCourse(
      [...base, busyDinner, farQuietDinner, ...busyStreet],
      CourseTheme.LOCAL_FOOD_MARKET,
      'seed',
      SATURDAY,
    );

    expect(dinnerOf(course)).toBe('busy-dinner');
  });
});

describe('혼잡도 - 추첨 후보', () => {
  const courses = (levels: number[]) =>
    levels.map((congestion, id) => ({ id, congestion }));

  it('덜 붐비는 절반만 남기고 원래 순서는 그대로 둔다', () => {
    const picked = calmerCourses(
      courses([0.8, 0.3, 0.7, 0.1, 0.6, 0.4, 0.5, 0.2]),
    );
    expect(picked.map((course) => course.congestion)).toEqual([
      0.3, 0.1, 0.4, 0.2,
    ]);
  });

  it(`후보가 적어도 ${MIN_CALM_COURSES}개는 남긴다 - 적은 군에서 코스가 굳지 않게`, () => {
    expect(calmerCourses(courses([0.9, 0.1, 0.5, 0.3]))).toHaveLength(3);
    expect(calmerCourses(courses([0.9, 0.1]))).toHaveLength(2);
  });

  it('여행일이 없으면(전부 0) 아무것도 안 뺀다', () => {
    expect(calmerCourses(courses(new Array(8).fill(0)))).toHaveLength(8);
  });
});
