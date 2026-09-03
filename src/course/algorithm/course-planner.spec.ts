import { CourseTheme, Hobby, Region } from '../../generated/prisma/enums';
import { affinityOf } from './affinity';
import {
  CoursePlanningError,
  DEFAULT_STAY_MINUTES,
  buildCoursePlan,
  resolveTheme,
} from './course-planner';
import { COURSE_TEMPLATE, SPOT_COUNT, templateFor } from './course-template';
import { isFirstDateSafe } from './first-date-policy';
import { buildMission } from './mission-text';
import { matchesFilter } from './tour-category';
import { estimateMoveMinutes, haversineKm } from './geo';
import { selectCourse } from './spot-selection';
import { reversalPenaltyKm, revisitPenaltyKm, scorePath } from './path-score';
import { selectTheme } from './theme-selection';
import { TourSpot } from './types';

function spot(overrides: Partial<TourSpot> & { contentId: string }): TourSpot {
  return {
    contentTypeId: '12',
    title: `장소-${overrides.contentId}`,
    address: '주소',
    sigunguCode: null,
    legalSigunguCode: null,
    latitude: 37.5,
    longitude: 127.0,
    firstImage: 'https://example.com/image.jpg',
    lclsSystm1: null,
    lclsSystm2: null,
    lclsSystm3: null,
    ...overrides,
  };
}

/** 기준점(37.5, 127.0)에서 동쪽으로 km만큼 이동한 경도. 위도 37.5에서 1도 ≈ 88.3km */
function lngAtKm(km: number): number {
  return 127.0 + km / 88.3;
}

const nature = (id: string, sub: string, km: number) =>
  spot({
    contentId: id,
    lclsSystm1: 'NA',
    lclsSystm2: sub,
    longitude: lngAtKm(km),
  });
const meal = (id: string, sub: string, km: number) =>
  spot({
    contentId: id,
    contentTypeId: '39',
    lclsSystm1: 'FD',
    lclsSystm2: sub,
    longitude: lngAtKm(km),
  });

describe('STEP 1 - 테마 확정 (취미의 유일한 사용처)', () => {
  it('교집합이 1개면 연관도와 무관하게 바로 확정한다', () => {
    const result = selectTheme(
      [CourseTheme.NATURE_HEALING, CourseTheme.ACTIVITY],
      [CourseTheme.NATURE_HEALING],
      [Hobby.READING],
    );

    expect(result.theme).toBe(CourseTheme.NATURE_HEALING);
  });

  // 명세 예시: 공통 취미 [사진, 카페] / 교집합 [사진명소, 로컬맛집]
  // 사진명소 3+2=5, 로컬맛집 1+2=3 -> 사진명소
  it('교집합이 2개면 공통 취미 연관도 합이 큰 쪽을 고른다', () => {
    const result = selectTheme(
      [CourseTheme.PHOTO_SPOT, CourseTheme.LOCAL_FOOD_MARKET],
      [CourseTheme.LOCAL_FOOD_MARKET, CourseTheme.PHOTO_SPOT],
      [Hobby.PHOTO, Hobby.CAFE],
    );

    expect(result.theme).toBe(CourseTheme.PHOTO_SPOT);
    expect(result.scores).toEqual([
      { theme: CourseTheme.PHOTO_SPOT, score: 5 },
      { theme: CourseTheme.LOCAL_FOOD_MARKET, score: 3 },
    ]);
  });

  it('동점이면 CourseTheme 선언 순서상 앞선 테마를 고른다', () => {
    const themes = [CourseTheme.NATURE_HEALING, CourseTheme.HISTORY_CULTURE];
    // 음악은 예술감성에만 점수가 있어 이 두 테마는 모두 0점
    const result = selectTheme(themes, themes, [Hobby.MUSIC]);

    expect(result.theme).toBe(CourseTheme.NATURE_HEALING);
  });

  it('A와 B를 바꿔 넣어도 같은 테마가 나온다', () => {
    const a = [CourseTheme.ART_SENSIBILITY, CourseTheme.NIGHT_DATE];
    const b = [CourseTheme.NIGHT_DATE, CourseTheme.ART_SENSIBILITY];
    const hobbies = [Hobby.MOVIE];

    expect(selectTheme(a, b, hobbies).theme).toBe(
      selectTheme(b, a, hobbies).theme,
    );
  });

  it('공통 테마가 없으면 NO_COMMON_THEME으로 실패한다', () => {
    expect(() =>
      resolveTheme([CourseTheme.ACTIVITY], [CourseTheme.HISTORY_CULTURE], []),
    ).toThrow(CoursePlanningError);
  });
});

describe('STEP 2 - 테마 구성 (놀 곳 중심)', () => {
  const codesOf = (theme: CourseTheme, index: number) =>
    COURSE_TEMPLATE[theme][index].filter.categories?.flatMap(
      (g) => g.lclsSystm2 ?? [],
    ) ?? [];

  /** 식사·카페를 유지하는 예외 테마 */
  const WITH_MEALS: CourseTheme[] = [
    CourseTheme.PHOTO_SPOT,
    CourseTheme.LOCAL_FOOD_MARKET,
  ];
  const PURE_THEMES = Object.values(CourseTheme).filter(
    (theme) => !WITH_MEALS.includes(theme),
  );

  it('모든 테마가 정확히 4칸이다', () => {
    for (const theme of Object.values(CourseTheme)) {
      expect(COURSE_TEMPLATE[theme]).toHaveLength(SPOT_COUNT);
    }
  });

  // 예전에는 로컬맛집·사진명소만 밥과 카페를 갖고 나머지 6개 테마는 활동 4칸이었다.
  // 그 코스는 90분짜리 활동을 네 번 연달아 하는 일정이라 앉을 자리도 대화할 자리도
  // 없었다. 이제는 테마와 상관없이 2번이 밥, 3번이 카페다.
  it('모든 테마가 식사와 카페를 한 칸씩 갖는다', () => {
    for (const theme of Object.values(CourseTheme)) {
      const codes = COURSE_TEMPLATE[theme].flatMap((_, i) => codesOf(theme, i));
      expect(codes).toContain('FD05'); // 카페
      expect(codes.some((c) => c.startsWith('FD') && c !== 'FD05')).toBe(true); // 식사
    }
  });

  it('식사와 카페는 활동보다 짧게 머문다', () => {
    for (const theme of Object.values(CourseTheme)) {
      for (const slot of COURSE_TEMPLATE[theme]) {
        const isFood = slot.filter.categories?.some(
          (g) => g.lclsSystm1 === 'FD',
        );
        if (isFood) {
          // 밥 먹는 데 90분(DEFAULT_STAY_MINUTES)을 잡으면 코스가 종일이 된다
          expect(slot.stayMinutes).toBeLessThan(DEFAULT_STAY_MINUTES);
        }
      }
    }
  });

  it('자연힐링·걷기여행은 1번과 4번이 자연·공원이고 4번은 노을을 우선한다', () => {
    for (const theme of [
      CourseTheme.NATURE_HEALING,
      CourseTheme.WALKING_TRIP,
    ]) {
      const template = COURSE_TEMPLATE[theme];
      for (const index of [0, 3]) {
        expect(
          template[index].filter.categories?.map((g) => g.lclsSystm1),
        ).toEqual(['NA', 'VE']);
      }
      expect(template[3].preferTitleKeywords).toContain('노을');
    }
  });

  // 활동 칸이 1번과 4번 둘뿐이라, 4번이 1번과 겹치지만 않으면 된다.
  // (예전에는 2·3번도 활동이라 연쇄로 서로 달라야 했다)
  it('활동이 두 번 나오는 테마는 4번이 1번과 중분류가 달라야 한다', () => {
    for (const theme of [
      CourseTheme.NATURE_HEALING,
      CourseTheme.WALKING_TRIP,
      CourseTheme.ACTIVITY,
    ]) {
      expect(COURSE_TEMPLATE[theme][3].distinctFromOrder).toBe(1);
    }
  });

  it('역사문화는 실내 전시(오전) -> 야외 고궁(저녁)으로 자리를 고정한다', () => {
    const template = COURSE_TEMPLATE[CourseTheme.HISTORY_CULTURE];
    expect(template[0].role).toBe('실내 역사·전시');
    expect(codesOf(CourseTheme.HISTORY_CULTURE, 0)).toEqual([
      'VE07',
      'HS01',
      'HS02',
      'HS03',
    ]);
    expect(template[3].role).toBe('야외 고궁·역사공원');
    expect(template[3].filter.categories).toEqual([
      { lclsSystm1: 'HS', lclsSystm2: ['HS01'] },
      { lclsSystm1: 'NA', lclsSystm2: ['NA04'] },
    ]);
  });

  it('예술감성은 예술 1칸 + 공방·체험 1칸이다', () => {
    const template = COURSE_TEMPLATE[CourseTheme.ART_SENSIBILITY];
    expect(codesOf(CourseTheme.ART_SENSIBILITY, 0)).toEqual(['VE06', 'VE07']);
    expect(template[3].role).toBe('공방·체험');
    expect(codesOf(CourseTheme.ART_SENSIBILITY, 3)).not.toContain('EX05');
  });

  it('액티비티는 1번과 4번이 레저이고 항공(LS03)은 제외한다', () => {
    for (const index of [0, 3]) {
      expect(codesOf(CourseTheme.ACTIVITY, index)).toEqual([
        'LS01',
        'LS02',
        'LS04',
      ]);
    }
  });

  it('야경데이트는 야경이 마지막 칸에 고정된다', () => {
    const template = COURSE_TEMPLATE[CourseTheme.NIGHT_DATE];
    expect(template[3].role).toBe('야경');
    expect(template[3].filter.keywordMode).toBe('ALTERNATIVE');
    expect(codesOf(CourseTheme.NIGHT_DATE, 0)).toEqual([
      'NA04',
      'NA05',
      'VE03',
    ]);
  });

  it('야경 필터는 분류가 안 맞아도 제목 키워드만 맞으면 통과한다', () => {
    const nightFilter = COURSE_TEMPLATE[CourseTheme.NIGHT_DATE][3].filter;

    expect(
      matchesFilter(
        spot({
          contentId: 'a',
          title: '롯데월드타워',
          lclsSystm1: 'VE',
          lclsSystm2: 'VE01',
        }),
        nightFilter,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        spot({
          contentId: 'b',
          title: '한강 야경 포인트',
          lclsSystm1: 'NA',
          lclsSystm2: 'NA02',
        }),
        nightFilter,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        spot({
          contentId: 'c',
          title: '동네 분식집',
          lclsSystm1: 'FD',
          lclsSystm2: 'FD03',
        }),
        nightFilter,
      ),
    ).toBe(false);
  });
});

describe('첫 만남 TPO - 블랙리스트', () => {
  const blocked = (overrides: Partial<TourSpot>) =>
    isFirstDateSafe(spot({ contentId: 'x', ...overrides }));

  it('숙박(AC) 대분류와 웰니스/스파(EX05)를 제외한다', () => {
    expect(blocked({ lclsSystm1: 'AC', lclsSystm2: 'AC01' })).toBe(false);
    expect(blocked({ lclsSystm1: 'EX', lclsSystm2: 'EX05' })).toBe(false);
  });

  it('숙박·노출 관련 이름을 제외한다', () => {
    for (const name of [
      '아쿠아스파',
      '유성온천',
      '불한증막 사우나',
      '△△모텔',
      '□□호텔',
      '바다펜션',
      '서울게스트하우스',
      '제주풀빌라',
    ]) {
      expect(blocked({ title: name })).toBe(false);
    }
  });

  it('정규 식사 슬롯의 포장·배달 전문점을 제외한다', () => {
    for (const name of [
      '포장전문 족발',
      '배달만하는집',
      '테이크아웃커피',
      '투고샌드위치',
      '딜리버리피자',
    ]) {
      expect(
        blocked({ title: name, lclsSystm1: 'FD', lclsSystm2: 'FD01' }),
      ).toBe(false);
    }
  });

  it('산(NA01)과 등산성 지명을 제외한다', () => {
    expect(blocked({ lclsSystm1: 'NA', lclsSystm2: 'NA01' })).toBe(false);
    for (const name of [
      '남한산성',
      '성산일출봉',
      '등산로입구',
      '북한산 탐방로',
      '지리산 종주길',
      '거문오름',
    ]) {
      expect(blocked({ title: name })).toBe(false);
    }
  });

  it('레저(LS)로 분류된 가짜 레저(단순 걷기)를 제외한다', () => {
    for (const name of [
      '정동길',
      '북한산 둘레길',
      '해변 산책로',
      '갈맷길 3코스',
      '올레길 7코스',
    ]) {
      expect(
        blocked({ title: name, lclsSystm1: 'LS', lclsSystm2: 'LS01' }),
      ).toBe(false);
    }
  });

  it('가짜 레저 키워드는 레저 카테고리에만 적용된다', () => {
    // 음식점 이름에 '길'이 들어가도 걸러지면 안 된다
    expect(
      blocked({ title: '먹자길 순대국', lclsSystm1: 'FD', lclsSystm2: 'FD01' }),
    ).toBe(true);
    expect(
      blocked({ title: '산책로카페', lclsSystm1: 'FD', lclsSystm2: 'FD05' }),
    ).toBe(true);
  });

  it('진짜 레저는 통과한다', () => {
    for (const name of ['뚝섬 윈드서핑장', '더클라임 클라이밍', '한강 카약']) {
      expect(
        blocked({ title: name, lclsSystm1: 'LS', lclsSystm2: 'LS02' }),
      ).toBe(true);
    }
  });

  it('정상적인 장소는 통과한다', () => {
    expect(
      blocked({ title: '북촌한옥마을', lclsSystm1: 'HS', lclsSystm2: 'HS01' }),
    ).toBe(true);
    expect(
      blocked({ title: '어라운드데이', lclsSystm1: 'FD', lclsSystm2: 'FD05' }),
    ).toBe(true);
  });

  it('완화 체인으로도 블랙리스트 장소가 코스에 들어오지 않는다', () => {
    // 카페가 스파뿐인 지역 — 완화되더라도 스파는 나오면 안 된다
    const pool = [
      nature('anchor', 'NA02', 0),
      nature('n1', 'NA03', 0.3),
      spot({
        contentId: 'spa',
        title: '리조트 스파',
        lclsSystm1: 'EX',
        lclsSystm2: 'EX05',
        longitude: lngAtKm(0.4),
      }),
      nature('n2', 'NA04', 0.6),
      nature('n3', 'NA05', 0.8),
    ];

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');

    expect(course.spots).toHaveLength(4);
    expect(course.spots.map((s) => s.spot.contentId)).not.toContain('spa');
  });

  it('자연힐링 슬롯 필터에서 산(NA01)과 스파(EX05)가 빠져 있다', () => {
    const groups = templateFor(CourseTheme.NATURE_HEALING)[0].filter.categories;
    const codes = groups.flatMap((g) => g.lclsSystm2 ?? []);
    expect(codes).not.toContain('NA01');
    expect(codes).not.toContain('EX05');
  });
});

describe('첫 만남 TPO - HS02(야외 역사유물) 특수 처리', () => {
  it('HS02를 후보에서 배제하지 않는다', () => {
    const relic = spot({
      contentId: 'r',
      lclsSystm1: 'HS',
      lclsSystm2: 'HS02',
    });
    expect(isFirstDateSafe(relic)).toBe(true);
  });

  it('역사문화 1번 슬롯 필터에 HS02가 들어 있다', () => {
    const groups = templateFor(CourseTheme.HISTORY_CULTURE)[0].filter
      .categories;
    const codes = groups.flatMap((g) => g.lclsSystm2 ?? []);
    expect(codes).toContain('HS02');
  });

  it('HS02 스팟에는 주변 산책을 안내하는 미션이 자동 생성된다', () => {
    const mission = buildMission(
      spot({
        contentId: 'r',
        title: '월정사 팔각구층석탑',
        lclsSystm1: 'HS',
        lclsSystm2: 'HS02',
      }),
    );

    expect(mission.title).toContain('주변 산책');
    expect(mission.description).toContain('유적지');
    expect(mission.description).toContain('절터');
    expect(mission.description).toContain('산책');
  });

  it('HS02가 아닌 곳은 기본 인증샷 미션을 쓴다', () => {
    const mission = buildMission(
      spot({
        contentId: 'p',
        title: '경복궁',
        lclsSystm1: 'HS',
        lclsSystm2: 'HS01',
      }),
    );

    expect(mission.title).toBe('경복궁에서 사진 찍기');
  });

  it('음식점·카페는 식사/대화에 맞는 미션 문구를 쓴다', () => {
    const cafeMission = buildMission(
      spot({
        contentId: 'c',
        title: '어라운드데이',
        lclsSystm1: 'FD',
        lclsSystm2: 'FD05',
      }),
    );
    const mealMission = buildMission(
      spot({
        contentId: 'm',
        title: '서화',
        lclsSystm1: 'FD',
        lclsSystm2: 'FD01',
      }),
    );

    expect(cafeMission.title).toContain('함께 사진');
    expect(mealMission.title).toContain('함께 식사');
  });

  it('코스 전체에 스팟마다 미션이 붙는다', () => {
    const pool = [
      spot({
        contentId: 'ex',
        lclsSystm1: 'VE',
        lclsSystm2: 'VE07',
        longitude: lngAtKm(0),
      }),
      meal('m1', 'FD01', 0.3),
      spot({
        contentId: 'shrine',
        lclsSystm1: 'HS',
        lclsSystm2: 'HS03',
        longitude: lngAtKm(0.5),
      }),
      spot({
        contentId: 'relic',
        title: '삼층석탑',
        lclsSystm1: 'HS',
        lclsSystm2: 'HS02',
        longitude: lngAtKm(0.7),
      }),
      spot({
        contentId: 'palace',
        lclsSystm1: 'HS',
        lclsSystm2: 'HS01',
        longitude: lngAtKm(0.9),
      }),
    ];

    const plan = buildCoursePlan(
      { region: Region.SEOUL, theme: CourseTheme.HISTORY_CULTURE, seed: 's' },
      pool,
    );

    expect(plan.spots.every((s) => s.mission.title.length > 0)).toBe(true);
    const relic = plan.spots.find((s) => s.spot.contentId === 'relic');
    expect(relic.mission.title).toContain('주변 산책');
  });
});

describe('앵커 선정 - 넓은 도에서 외딴 곳을 피한다', () => {
  // 강원·경북은 도 하나가 200km를 넘는다. 앵커를 도 전체에서 뽑기 때문에
  // 혼자 떨어진 곳이 걸리면 나머지 세 자리를 반경 밖에서 끌어와 코스가 성립하지 않는다.
  it('주변에 갈 곳이 없는 후보는 앵커가 되지 않는다', () => {
    const pool = [
      // 뭉쳐 있는 네 곳
      nature('near1', 'NA02', 0),
      nature('near2', 'NA03', 0.5),
      nature('near3', 'NA04', 0.8),
      nature('near4', 'NA05', 1.2),
      // 200km 밖에 혼자 있는 곳
      nature('remote', 'NA02', 200),
    ];

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');

    const picked = course.spots.map((s) => s.spot.contentId);
    expect(picked).not.toContain('remote');
  });

  it('뭉친 곳이 하나도 없으면 거르지 않는다 - 빈 코스를 낼 수는 없다', () => {
    // 전부 100km씩 떨어져 있어 어느 후보도 이웃이 없다
    const scattered = [
      nature('s1', 'NA02', 0),
      nature('s2', 'NA03', 100),
      nature('s3', 'NA04', 200),
      nature('s4', 'NA05', 300),
    ];

    const course = selectCourse(scattered, CourseTheme.NATURE_HEALING, 'seed');

    expect(course).not.toBeNull();
    expect(course.spots).toHaveLength(4);
  });
});

describe('섬끼리 묶이지 않는다', () => {
  // 거리 계산이 직선거리라 배로만 가는 곳도 "2km"로 나온다.
  // 실제로 여수 코스가 낭도항 -> 사도 -> 추도로 뽑힌 적이 있다.
  const island = (id: string, name: string, km: number) =>
    spot({
      contentId: id,
      title: name,
      lclsSystm1: 'NA',
      lclsSystm2: 'NA02',
      longitude: lngAtKm(km),
    });
  const land = (id: string, name: string, sub: string, km: number) =>
    spot({
      contentId: id,
      title: name,
      lclsSystm1: 'NA',
      lclsSystm2: sub,
      longitude: lngAtKm(km),
    });

  it('섬으로 보이는 곳은 한 코스에 하나까지만 들어간다', () => {
    const pool = [
      island('i1', '사도', 0),
      island('i2', '추도', 0.4),
      island('i3', '낭도항', 0.8),
      land('l1', '용화해변', 'NA03', 1.0),
      land('l2', '맹방솔밭', 'NA04', 1.4),
      land('l3', '근덕공원', 'NA05', 1.8),
      land('l4', '초곡전망대', 'NA03', 2.2),
    ];

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');

    const islands = course.spots.filter((s) =>
      ['사도', '추도', '낭도항'].includes(s.spot.title),
    );
    expect(islands.length).toBeLessThanOrEqual(1);
  });

  it('후보가 전부 섬이면 규칙을 풀어서라도 코스를 만든다', () => {
    // 신안·옹진처럼 섬뿐인 지역. 결제가 끝난 뒤라 빈 코스를 낼 수 없다
    const pool = [
      island('i1', '사도', 0),
      island('i2', '추도', 0.4),
      island('i3', '낭도', 0.8),
      island('i4', '오동도', 1.2),
      island('i5', '거문도', 1.6),
    ];

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');

    expect(course).not.toBeNull();
    expect(course.spots).toHaveLength(4);
  });
});

describe('STEP 3 - 앵커 기반 선정', () => {
  // 자연힐링 템플릿용 기본 풀: 앵커 근처에 역할별 후보가 다 있는 상태
  // 2·3번이 밥과 카페 자리라 자연 장소만으로는 코스를 채울 수 없다
  const compactPool = [
    nature('n1', 'NA02', 0),
    meal('food', 'FD01', 0.5),
    meal('cafe', 'FD05', 0.8),
    nature('n4', 'NA05', 1.2),
  ];

  it('역할 순서대로 4칸을 채운다', () => {
    const course = selectCourse(
      compactPool,
      CourseTheme.NATURE_HEALING,
      'seed',
    );

    expect(course.spots.map((s) => s.role)).toEqual([
      '자연·공원',
      '점심',
      '카페',
      '노을·자연',
    ]);
    expect(new Set(course.spots.map((s) => s.spot.contentId)).size).toBe(4);
  });

  it('앵커 반경 1km 후보를 5km 후보보다 먼저 집는다', () => {
    const pool = [
      nature('anchor', 'NA02', 0),
      nature('near', 'NA03', 0.9),
      nature('far', 'NA03', 4.5), // 이미지 있어도 더 멀면 밀린다
      nature('c1', 'NA04', 0.5),
      nature('evening', 'NA05', 0.7),
    ];
    pool[1].firstImage = null; // near는 이미지 없음

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');
    const ids = course.spots.map((s) => s.spot.contentId);

    expect(ids).toContain('near');
    expect(ids).not.toContain('far');
  });

  // 자연 칸이 1번과 4번뿐이라(2·3번은 밥·카페) 그 둘의 중분류가 달라야 한다.
  // 같은 중분류만 있으면 다음 테스트처럼 같은 걸로 대체한다.
  it('자연 두 칸은 서로 중분류가 다른 후보를 우선한다', () => {
    const pool = [
      nature('anchor', 'NA02', 0),
      nature('same-sub', 'NA02', 0.3), // 앵커와 같은 중분류
      nature('diff-a', 'NA03', 0.5),
      meal('food', 'FD01', 0.6),
      meal('cafe', 'FD05', 0.7),
    ];

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');

    expect(course.spots[3].spot.lclsSystm2).not.toBe(
      course.spots[0].spot.lclsSystm2,
    );
  });

  it('다른 중분류가 없으면 같은 중분류의 다른 장소로 대체한다', () => {
    const pool = [
      nature('anchor', 'NA02', 0),
      nature('same-1', 'NA02', 0.5),
      nature('same-2', 'NA02', 0.6),
      nature('same-3', 'NA02', 0.9),
    ];

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');

    expect(course.spots).toHaveLength(4);
    expect(new Set(course.spots.map((s) => s.spot.contentId)).size).toBe(4);
  });

  it('5km 밖에만 후보가 있으면 완화 사유를 남기고 채운다', () => {
    const pool = [
      // 야외 고궁(HS01/NA04) 후보가 20km 밖에만 있는 지역.
      // NA04는 1번 칸(실내 전시) 조건에 안 맞아 앵커가 될 수 없다.
      spot({
        contentId: 'museum',
        lclsSystm1: 'VE',
        lclsSystm2: 'VE07',
        longitude: lngAtKm(0),
      }),
      spot({
        contentId: 'shrine',
        lclsSystm1: 'HS',
        lclsSystm2: 'HS03',
        longitude: lngAtKm(0.3),
      }),
      spot({
        contentId: 'relic',
        lclsSystm1: 'HS',
        lclsSystm2: 'HS02',
        longitude: lngAtKm(0.5),
      }),
      spot({
        contentId: 'far-park',
        lclsSystm1: 'NA',
        lclsSystm2: 'NA04',
        longitude: lngAtKm(20),
      }),
    ];

    const course = selectCourse(pool, CourseTheme.HISTORY_CULTURE, 'seed');
    const far = course.spots.find((s) => s.spot.contentId === 'far-park');

    expect(course.spots).toHaveLength(4);
    expect(far.relaxation).not.toBeNull();
  });

  it('역할 후보가 지역에 아예 없으면 테마 기준으로 대체한다', () => {
    // 예술 후보가 하나도 없는 지역 (자연만 있음)
    const pool = [
      nature('n1', 'NA02', 0),
      nature('n2', 'NA03', 0.5),
      nature('n3', 'NA04', 0.7),
      nature('n4', 'NA05', 0.9),
    ];

    const course = selectCourse(pool, CourseTheme.ART_SENSIBILITY, 'seed');

    expect(course.spots).toHaveLength(4);
    expect(course.spots.some((s) => s.relaxation)).toBe(true);
  });

  it('풀이 비면 null을 반환한다', () => {
    expect(selectCourse([], CourseTheme.NATURE_HEALING, 'seed')).toBeNull();
  });
});

describe('STEP 4 - 전체 경로 최적화 (지그재그 방지)', () => {
  /** 동서 방향 좌표만 쓰는 헬퍼 - 부호로 방향을 만든다 */
  const at = (id: string, km: number, sub: string, group: string) =>
    spot({
      contentId: id,
      lclsSystm1: group,
      lclsSystm2: sub,
      longitude: lngAtKm(km),
    });

  it('일직선 경로에는 역주행 페널티가 없다', () => {
    const straight = [
      at('a', 0, 'NA02', 'NA'),
      at('b', 1, 'FD01', 'FD'),
      at('c', 2, 'FD05', 'FD'),
    ];
    expect(reversalPenaltyKm(straight)).toBeCloseTo(0, 5);
  });

  it('왔던 방향으로 되돌아가면 역주행 페널티가 붙는다', () => {
    // 0 -> 2 -> 0.5 : 두번째 구간에서 완전히 반대로 꺾인다
    const pingpong = [
      at('a', 0, 'NA02', 'NA'),
      at('b', 2, 'FD01', 'FD'),
      at('c', 0.5, 'FD05', 'FD'),
    ];
    expect(reversalPenaltyKm(pingpong)).toBeGreaterThan(1);
  });

  it('예전에 들른 지역으로 돌아오면 재방문 페널티가 붙는다', () => {
    const backToStart = [
      at('a', 0, 'NA02', 'NA'),
      at('b', 3, 'FD01', 'FD'),
      at('c', 6, 'FD05', 'FD'),
      at('d', 0.2, 'FD02', 'FD'), // 출발지 바로 옆으로 복귀
    ];
    expect(revisitPenaltyKm(backToStart)).toBeGreaterThan(0);
  });

  it('총 이동거리가 같아도 지그재그보다 일직선 경로의 점수가 좋다', () => {
    const straight = [
      at('a', 0, 'NA02', 'NA'),
      at('b', 1, 'FD01', 'FD'),
      at('c', 2, 'FD05', 'FD'),
      at('d', 3, 'FD02', 'FD'),
    ];
    const zigzag = [
      at('a', 0, 'NA02', 'NA'),
      at('b', 1.5, 'FD01', 'FD'),
      at('c', 0.5, 'FD05', 'FD'),
      at('d', 2, 'FD02', 'FD'),
    ];

    expect(scorePath(straight).score).toBeLessThan(scorePath(zigzag).score);
  });

  it('W자 핑퐁 대신 일직선 조합을 고른다', () => {
    // 각 슬롯마다 '앵커 바로 옆'과 '한 방향으로 진행' 두 후보를 준다.
    // 탐욕 방식이면 매번 가까운 쪽을 집어 0 -> 0.3 -> 0.6 -> 0.9 로 뭉치지만,
    // 방향이 꺾이는 배치를 주면 조합 탐색이 일직선을 고른다.
    const pool = [
      at('anchor', 0, 'NA02', 'NA'),
      // 서쪽(-1) vs 동쪽(1)
      at('west', -1, 'NA03', 'NA'),
      at('east-1', 1, 'NA03', 'NA'),
      at('east-2', 2, 'NA04', 'NA'),
      at('east-3', 3, 'NA05', 'NA'),
    ];

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');
    const ids = course.spots.map((s) => s.spot.contentId);

    // 서쪽으로 갔다가 동쪽으로 되돌아오는 경로를 피해야 한다
    expect(ids).not.toContain('west');
    expect(course.backtrackPenaltyKm).toBeCloseTo(0, 2);
  });

  it('야경은 앵커 바로 옆에 있어도 마지막 칸을 지킨다', () => {
    const pool = [
      at('park', 0, 'NA04', 'NA'),
      at('tower', 0.1, 'VE01', 'VE'), // 앵커 바로 옆이지만 4번 자리
      at('cafe', 0.4, 'FD05', 'FD'),
      at('dinner', 0.8, 'FD01', 'FD'),
    ];

    const course = selectCourse(pool, CourseTheme.NIGHT_DATE, 'seed');

    expect(course.spots[3].role).toBe('야경');
    expect(course.spots[3].spot.contentId).toBe('tower');
  });

  it('같은 장소가 두 번 들어가지 않는다', () => {
    // 자연 슬롯이 1번과 4번 두 개인데 자연 후보가 2곳뿐인 상황
    const pool = [
      at('n1', 0, 'NA02', 'NA'),
      at('n2', 0.3, 'NA03', 'NA'),
      at('n3', 0.5, 'NA04', 'NA'),
      at('n4', 0.7, 'NA05', 'NA'),
    ];

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');
    const ids = course.spots.map((s) => s.spot.contentId);

    expect(new Set(ids).size).toBe(4);
  });

  it('후보가 부족해도 중복 대신 다른 장소로 채운다', () => {
    // 자연 후보가 앵커 1곳뿐 -> 4번 칸은 완화되더라도 앵커를 재사용하면 안 된다
    const pool = [
      at('only-nature', 0, 'NA02', 'NA'),
      at('other-1', 0.3, 'VE07', 'VE'),
      at('other-2', 0.5, 'VE06', 'VE'),
      at('other-3', 0.7, 'HS01', 'HS'),
    ];

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');
    const ids = course.spots.map((s) => s.spot.contentId);

    expect(new Set(ids).size).toBe(4);
    expect(ids.filter((id) => id === 'only-nature')).toHaveLength(1);
  });

  it('선정된 코스에는 역주행이 거의 없다 (촘촘한 후보군에서)', () => {
    const pool = Array.from({ length: 12 }, (_, i) => [
      at(`n${i}`, i * 0.4, 'NA02', 'NA'),
      at(`m${i}`, i * 0.4 + 0.1, 'NA03', 'NA'),
      at(`c${i}`, i * 0.4 + 0.2, 'NA04', 'NA'),
      at(`e${i}`, i * 0.4 + 0.3, 'NA05', 'NA'),
    ]).flat();

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');
    expect(course.backtrackPenaltyKm).toBeLessThan(0.5);
  });
});

describe('STEP 4 - 순서 확정과 다양성', () => {
  it('같은 시드면 항상 같은 코스가 나온다', () => {
    const pool = Array.from({ length: 30 }, (_, i) => [
      nature(`n${i}`, 'NA02', i * 0.3),
      nature(`m${i}`, 'NA03', i * 0.3 + 0.1),
      nature(`c${i}`, 'NA04', i * 0.3 + 0.2),
      nature(`d${i}`, 'NA05', i * 0.3 + 0.25),
    ]).flat();

    const run = () =>
      selectCourse(pool, CourseTheme.NATURE_HEALING, 'fixed')
        .spots.map((s) => s.spot.contentId)
        .join(',');

    expect(run()).toBe(run());
  });

  it('시드가 다르면 다른 코스가 나올 수 있다 (다양성)', () => {
    // 서로 떨어진 두 군집 — 둘 다 총 이동거리 4km 이내라 acceptable
    const clusterA = [
      nature('a-n1', 'NA02', 0),
      nature('a-m1', 'NA03', 0.3),
      nature('a-c1', 'NA05', 0.5),
      nature('a-e1', 'NA04', 0.7),
    ];
    const clusterB = [
      nature('b-n1', 'NA02', 50),
      nature('b-m1', 'NA03', 50.3),
      nature('b-c1', 'NA05', 50.5),
      nature('b-e1', 'NA04', 50.7),
    ];
    const pool = [...clusterA, ...clusterB];

    const starts = new Set(
      Array.from(
        { length: 10 },
        (_, i) =>
          selectCourse(pool, CourseTheme.NATURE_HEALING, `seed-${i}`).spots[0]
            .spot.contentId,
      ),
    );

    expect(starts.size).toBeGreaterThan(1);
  });

  it('선택된 코스의 총 이동거리는 4km 이내다 (가까운 군집이 있을 때)', () => {
    const pool = [
      nature('n1', 'NA02', 0),
      nature('n2', 'NA03', 0.4),
      nature('n3', 'NA04', 0.6),
      nature('n4', 'NA05', 1.0),
    ];

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');
    expect(course.totalDistanceKm).toBeLessThanOrEqual(4);
  });

  it('순수 테마는 순서가 자유로워 가장 짧은 경로로 정렬된다', () => {
    // 0, 1, 2, 3km에 흩어진 자연 4곳 -> 한 방향으로 훑는 순서가 최단
    const pool = [
      nature('a', 'NA02', 0),
      nature('b', 'NA03', 1),
      nature('c', 'NA04', 2),
      nature('d', 'NA05', 3),
    ];

    const course = selectCourse(pool, CourseTheme.NATURE_HEALING, 'seed');

    expect(course.totalDistanceKm).toBeCloseTo(3, 1);
    expect(course.backtrackPenaltyKm).toBeCloseTo(0, 2);
  });
});

describe('거리 계산', () => {
  it('서울시청-강남역 직선거리는 약 8km다', () => {
    const distance = haversineKm(
      { latitude: 37.5665, longitude: 126.978 },
      { latitude: 37.4979, longitude: 127.0276 },
    );

    expect(distance).toBeGreaterThan(7);
    expect(distance).toBeLessThan(9);
  });

  it('명세대로 거리 구간별 이동시간을 매긴다', () => {
    expect(estimateMoveMinutes(2)).toBe(10);
    expect(estimateMoveMinutes(4)).toBe(15);
    expect(estimateMoveMinutes(9)).toBe(20);
  });
});

describe('전체 플랜 (buildCoursePlan)', () => {
  const pool = [
    nature('n1', 'NA02', 0),
    meal('food', 'FD01', 0.4),
    meal('cafe', 'FD05', 0.6),
    nature('n4', 'NA05', 1.0),
  ];

  it('스팟 4개, 순서, 총 소요시간을 채워서 반환한다', () => {
    const plan = buildCoursePlan(
      { region: Region.SEOUL, theme: CourseTheme.NATURE_HEALING, seed: 's' },
      pool,
    );

    expect(plan.spots).toHaveLength(4);
    expect(plan.spots.map((s) => s.order)).toEqual([1, 2, 3, 4]);
    expect(plan.spots[0].moveMinutesFromPrevious).toBeNull();
    expect(plan.spots[1].moveMinutesFromPrevious).toBeGreaterThan(0);
    // 자연 90 + 점심 60 + 카페 50 + 자연 90 = 290. 여기에 이동시간이 붙는다.
    // 예전에는 90 x 4 = 360이었다 — 밥도 커피도 90분씩 잡던 시절이다.
    expect(plan.durationMinutes).toBeGreaterThanOrEqual(290);
    expect(plan.totalDistanceKm).toBeGreaterThan(0);
  });

  it('후보 풀이 비면 NOT_ENOUGH_SPOTS로 실패한다', () => {
    expect(() =>
      buildCoursePlan(
        { region: Region.SEOUL, theme: CourseTheme.NATURE_HEALING, seed: 's' },
        [],
      ),
    ).toThrow(/스팟/);
  });
});

describe('연관도 표 (STEP 1 전용)', () => {
  it('명세의 표와 값이 일치한다', () => {
    expect(affinityOf(Hobby.PHOTO, CourseTheme.PHOTO_SPOT)).toBe(3);
    expect(affinityOf(Hobby.CAFE, CourseTheme.PHOTO_SPOT)).toBe(2);
    expect(affinityOf(Hobby.PHOTO, CourseTheme.LOCAL_FOOD_MARKET)).toBe(1);
    expect(affinityOf(Hobby.CAFE, CourseTheme.LOCAL_FOOD_MARKET)).toBe(2);
    expect(affinityOf(Hobby.SEA, CourseTheme.NATURE_HEALING)).toBe(3);
    expect(affinityOf(Hobby.EXERCISE, CourseTheme.WALKING_TRIP)).toBe(2);
    expect(affinityOf(Hobby.ART, CourseTheme.ART_SENSIBILITY)).toBe(3);
  });

  it('노션 표에 없던 취미(IT/독서/동물/음악)도 가까운 테마에는 점수가 있다', () => {
    expect(affinityOf(Hobby.READING, CourseTheme.ART_SENSIBILITY)).toBe(3);
    expect(affinityOf(Hobby.MUSIC, CourseTheme.ART_SENSIBILITY)).toBe(3);
    expect(affinityOf(Hobby.IT, CourseTheme.NATURE_HEALING)).toBe(3);
    expect(affinityOf(Hobby.ANIMAL, CourseTheme.NATURE_HEALING)).toBe(3);
    expect(affinityOf(Hobby.ANIMAL, CourseTheme.WALKING_TRIP)).toBe(3);
  });

  it('그 취미들도 지정한 테마 밖에서는 여전히 0점이다', () => {
    const mapped = new Map<Hobby, CourseTheme[]>([
      [Hobby.READING, [CourseTheme.ART_SENSIBILITY]],
      [Hobby.MUSIC, [CourseTheme.ART_SENSIBILITY]],
      [Hobby.IT, [CourseTheme.NATURE_HEALING]],
      [Hobby.ANIMAL, [CourseTheme.NATURE_HEALING, CourseTheme.WALKING_TRIP]],
    ]);

    for (const [hobby, themes] of mapped) {
      for (const theme of Object.values(CourseTheme)) {
        if (themes.includes(theme)) continue;
        expect(affinityOf(hobby, theme)).toBe(0);
      }
    }
  });
});
