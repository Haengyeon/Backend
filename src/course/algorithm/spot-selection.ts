// 후보가 기준점에서 1키로
import { CourseTheme } from '../../generated/prisma/enums';
import { templateFor } from './course-template';
import { sanitizePool } from './first-date-policy';
import { haversineKm } from './geo';
import { PathScore, scorePath } from './path-score';
import { THEME_FILTER, matchesFilter } from './tour-category';
import { SlotSpec, TourSpot } from './types';

/** 앵커 기준 탐색 반경 */
export const RADIUS_STEPS_KM = [1, 2, 3, 4, 5];

/** 위 반경으로 못 찾았을 때의 확장 반경. 여기부터는 완화 사유를 기록한다. */
export const RELAX_RADIUS_STEPS_KM = [7, 10];

export const ANCHOR_TRIES = 15;

/** 슬롯당 조합 탐색에 넣을 후보 수 */
export const CANDIDATES_PER_SLOT = 6;

/** 다양성 선택에 넣을 코스의 상한 (총 이동거리 / 역주행 페널티) */
export const ACCEPTABLE_TOTAL_KM = 4;
export const ACCEPTABLE_BACKTRACK_KM = 0.5;

export interface SelectedSpot {
  role: string;
  spot: TourSpot;
  /** 조건을 완화해서 뽑았으면 사유, 아니면 null */
  relaxation: string | null;
}

export interface SelectedCourse {
  spots: SelectedSpot[];
  totalDistanceKm: number;
  /** 역주행 + 재방문 페널티 합(km 환산). 0이면 되돌아감 없는 동선. */
  backtrackPenaltyKm: number;
  /** 최소화 대상 점수 (이동거리 + 가중 페널티). 코스 간 비교용. */
  score: number;
}

/** 시드 기반 해시. matchAttemptId를 넘기면 커플마다 다르면서 재현 가능한 순서가 된다. */
function seededScore(seed: string, key: string): number {
  const input = `${seed}:${key}`;
  let hash = 2166136261;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

/** 선호 키워드를 가진 후보를 앞세운다. 후보를 줄이지 않기 위해 필터가 아닌 정렬로 처리. */
function prefersTitle(spot: TourSpot, spec?: SlotSpec): number {
  if (!spec?.preferTitleKeywords?.length) return 0;
  return spec.preferTitleKeywords.some((keyword) =>
    spot.title.includes(keyword),
  )
    ? 0
    : 1;
}

function rank(
  candidates: TourSpot[],
  seed: string,
  spec?: SlotSpec,
): TourSpot[] {
  return [...candidates].sort((a, b) => {
    const preferred = prefersTitle(a, spec) - prefersTitle(b, spec);
    if (preferred !== 0) return preferred;

    const image = Number(Boolean(b.firstImage)) - Number(Boolean(a.firstImage));
    if (image !== 0) return image;

    const score =
      seededScore(seed, b.contentId) - seededScore(seed, a.contentId);
    if (score !== 0) return score;

    return a.contentId.localeCompare(b.contentId);
  });
}

function byDistance(candidates: TourSpot[], origin: TourSpot): TourSpot[] {
  return [...candidates].sort((a, b) => {
    const diff = haversineKm(origin, a) - haversineKm(origin, b);
    if (diff !== 0) return diff;
    return a.contentId.localeCompare(b.contentId);
  });
}

type CandidateSource = 'ROLE' | 'THEME' | 'ANY';

interface SlotCandidates {
  spec: SlotSpec;
  list: TourSpot[];
  source: CandidateSource;
}

/** 확정된 스팟의 앵커 거리를 보고 완화 사유를 만든다. 후보군에는 가까운 것과 먼 것이 섞여 있다. */
function describeRelaxation(
  anchor: TourSpot,
  spot: TourSpot,
  source: CandidateSource,
): string | null {
  if (source === 'THEME') return '역할 후보 소진 -> 테마 기준 대체';
  if (source === 'ANY') return '테마 후보 소진 -> 지역 전체 최근접';

  const distanceKm = haversineKm(anchor, spot);
  const maxNormal = RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1];
  if (distanceKm <= maxNormal) return null;

  for (const radiusKm of RELAX_RADIUS_STEPS_KM) {
    if (distanceKm <= radiusKm) {
      return `${maxNormal}km 내 후보 없음 -> ${radiusKm}km로 확장`;
    }
  }

  return `${RELAX_RADIUS_STEPS_KM[RELAX_RADIUS_STEPS_KM.length - 1]}km 내 후보 없음 -> 반경 무제한`;
}

/**
 * 슬롯 하나의 후보군을 뽑는다. 하나로 확정하지 않는 이유는 조합 단계에서
 * 전체 경로를 보고 정하기 위해서다.
 *
 * 역할 조건으로 못 찾으면 테마 기준 -> 지역 전체 순으로 완화한다.
 * 결제 완료 후 호출되므로 빈 코스를 낼 수 없다.
 */
function collectSlotCandidates(
  pool: TourSpot[],
  spec: SlotSpec,
  anchor: TourSpot,
  theme: CourseTheme,
  seed: string,
): SlotCandidates | null {
  const matching = pool.filter(
    (spot) =>
      spot.contentId !== anchor.contentId && matchesFilter(spot, spec.filter),
  );

  if (matching.length > 0) {
    return {
      spec,
      list: buildList(matching, anchor, seed, spec),
      source: 'ROLE',
    };
  }

  const byTheme = pool.filter(
    (spot) =>
      spot.contentId !== anchor.contentId &&
      matchesFilter(spot, THEME_FILTER[theme]),
  );
  if (byTheme.length > 0) {
    return {
      spec,
      list: buildList(byTheme, anchor, seed, spec),
      source: 'THEME',
    };
  }

  const anySpot = pool.filter((spot) => spot.contentId !== anchor.contentId);
  if (anySpot.length > 0) {
    return {
      spec,
      list: buildList(anySpot, anchor, seed, spec),
      source: 'ANY',
    };
  }

  return null;
}

/**
 * 후보가 충분히 모이는 가장 작은 반경을 쓰되, 목표 개수에 못 미치면 반경 밖에서 채운다.
 * 넉넉히 남겨야 다른 슬롯이 같은 장소를 가져갔을 때 조합이 막히지 않는다.
 */
function buildList(
  matching: TourSpot[],
  anchor: TourSpot,
  seed: string,
  spec: SlotSpec,
): TourSpot[] {
  for (const radiusKm of RADIUS_STEPS_KM) {
    const near = matching.filter(
      (spot) => haversineKm(anchor, spot) <= radiusKm,
    );
    if (near.length >= CANDIDATES_PER_SLOT) {
      return rank(near, seed, spec).slice(0, CANDIDATES_PER_SLOT);
    }
  }

  const maxNormal = RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1];
  const within = rank(
    matching.filter((spot) => haversineKm(anchor, spot) <= maxNormal),
    seed,
    spec,
  );
  const outside = byDistance(
    matching.filter((spot) => haversineKm(anchor, spot) > maxNormal),
    anchor,
  );

  return [...within, ...outside].slice(0, CANDIDATES_PER_SLOT);
}

interface ScoredCombination {
  spots: TourSpot[];
  path: PathScore;
}

/**
 * 후보군을 조합해 가능한 경로를 모두 만들고 최적 하나를 고른다.
 * 슬롯 i의 후보는 항상 i번째 자리에 들어간다. 시간대 의미가 있어 순서는 바꾸지 않는다.
 */
function bestCombination(
  anchor: TourSpot,
  slots: SlotCandidates[],
  requireDistinct: boolean,
): ScoredCombination | null {
  let best: ScoredCombination | null = null;

  const walk = (index: number, chosen: TourSpot[], usedIds: Set<string>) => {
    if (index === slots.length) {
      const spots = [anchor, ...chosen];
      const path = scorePath(spots);
      if (!best || path.score < best.path.score - 1e-9) {
        best = { spots, path };
      }
      return;
    }

    const { spec, list } = slots[index];

    for (const candidate of list) {
      if (usedIds.has(candidate.contentId)) continue;

      if (requireDistinct && spec.distinctFromOrder) {
        const reference = [anchor, ...chosen][spec.distinctFromOrder - 1];
        if (
          reference?.lclsSystm2 &&
          reference.lclsSystm2 === candidate.lclsSystm2
        ) {
          continue;
        }
      }

      usedIds.add(candidate.contentId);
      walk(index + 1, [...chosen, candidate], usedIds);
      usedIds.delete(candidate.contentId);
    }
  };

  walk(0, [], new Set([anchor.contentId]));
  return best;
}

/**
 * 후보군 조합 기반 전체 경로 최적화.
 *
 * 앵커(1번 슬롯) 후보마다 나머지 슬롯의 후보군을 뽑고, 조합을 전부 만들어
 * 점수가 가장 낮은 경로를 고른다. 그중 기준 이내인 코스들에서 시드로 하나를 정해
 * 같은 조건이어도 커플마다 다른 코스가 나오게 한다.
 *
 * 후보가 아예 없으면 null.
 */
export function selectCourse(
  rawPool: TourSpot[],
  theme: CourseTheme,
  seed: string,
): SelectedCourse | null {
  // 완화 체인 어느 단계에서도 나오면 안 되므로 풀 자체에서 걷어낸다
  const pool = sanitizePool(rawPool);
  const template = templateFor(theme);

  let anchors = rank(
    pool.filter((spot) => matchesFilter(spot, template[0].filter)),
    seed,
    template[0],
  ).slice(0, ANCHOR_TRIES);

  let anchorRelaxation: string | null = null;

  if (anchors.length === 0) {
    anchors = rank(
      pool.filter((spot) => matchesFilter(spot, THEME_FILTER[theme])),
      seed,
    ).slice(0, ANCHOR_TRIES);
    anchorRelaxation = '1번 역할 후보 없음 -> 테마 기준 앵커';
  }

  // 테마에 맞는 곳이 지역에 하나도 없어도 빈 코스를 낼 수는 없다
  if (anchors.length === 0) {
    anchors = rank(pool, seed).slice(0, ANCHOR_TRIES);
    anchorRelaxation = '테마 후보 없음 -> 지역 전체에서 앵커 선정';
  }

  const courses: SelectedCourse[] = [];

  for (const anchor of anchors) {
    const slots: SlotCandidates[] = [];
    for (const spec of template.slice(1)) {
      const candidates = collectSlotCandidates(pool, spec, anchor, theme, seed);
      if (!candidates) break;
      slots.push(candidates);
    }
    if (slots.length < template.length - 1) continue;

    // 중분류 중복 회피를 먼저 시도하고, 그걸로 만들 수 있는 경로가 없으면 푼다
    const combination =
      bestCombination(anchor, slots, true) ??
      bestCombination(anchor, slots, false);
    if (!combination) continue;

    courses.push({
      spots: combination.spots.map((spot, index) => ({
        role: template[index].role,
        spot,
        relaxation:
          index === 0
            ? anchorRelaxation
            : describeRelaxation(anchor, spot, slots[index - 1].source),
      })),
      totalDistanceKm: combination.path.totalDistanceKm,
      backtrackPenaltyKm:
        combination.path.reversalKm + combination.path.revisitKm,
      score: combination.path.score,
    });
  }

  if (courses.length === 0) return null;

  // 거리만 보면 되돌아가는 경로가 섞여 들어온다
  const acceptable = courses.filter(
    (course) =>
      course.totalDistanceKm <= ACCEPTABLE_TOTAL_KM &&
      course.backtrackPenaltyKm <= ACCEPTABLE_BACKTRACK_KM,
  );

  if (acceptable.length === 0) {
    return [...courses].sort((a, b) => a.score - b.score)[0];
  }

  const index = Math.floor(
    seededScore(seed, `pick:${acceptable.length}`) * acceptable.length,
  );
  return acceptable[Math.min(index, acceptable.length - 1)];
}
