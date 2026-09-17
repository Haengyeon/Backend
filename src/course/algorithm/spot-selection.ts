// 후보 수백 곳 중에서 하루 코스가 되는 4곳을 고른다.
//
// 구성표(course-template.ts)는 "1번은 카페, 2번은 맛집" 같은 틀만 정한다.
// 그 자리에 실제로 어느 장소를 넣을지는 여기서 정한다.
//
// 고르는 순서
//   1. 앵커(1번 장소) — 주변에 갈 곳이 몇 군데 있는 곳으로 고른다.
//      한적한 곳을 잡으면 나머지 3곳이 멀어져서 하루에 못 돈다.
//   2. 나머지 슬롯 — 앵커에서 가까운 순으로 후보를 모은다.
//      1~5km에 없으면 7, 10km로 넓히고 왜 넓혔는지 남긴다(relaxation).
//   3. 조합 — 후보를 조합해 경로를 다 만들고 이동거리가 짧은 것을 고른다.
//   4. 같은 조건이어도 커플마다 다른 코스가 나오도록 matchAttemptId로 하나 고른다.
import { CourseTheme } from '../../generated/prisma/enums';
import { templateFor } from './course-template';
import { sanitizePool } from './first-date-policy';
import { haversineKm } from './geo';
import { PathScore, scorePath } from './path-score';
import { THEME_FILTER, matchesFilter } from './tour-category';
import { SlotSpec, TourSpot } from './types';

// ─── 탐색 반경 ────────────────────────────────────────────────────
//
// 반경은 고정값이 아니라 그 지역 후보가 얼마나 뭉쳐 있는지를 보고 정한다.
// 시군구는 면적이 서울 중구 10km²부터 인제군 1,646km²까지 165배 차이 나서
// 한 벌의 상수로 양쪽을 감당할 수 없다.
//
// 실측한 산포도(3번째 최근접 이웃까지 거리의 중앙값):
//   서울 중구 0.23km · 수원시 0.35km · 화성시 1.05km · 울진군 4.81km · 인제군 6.75km

/** 반경 사다리의 배수. 기준 단위(아래)에 이 값을 곱해 단계를 만든다 */
export const RADIUS_MULTIPLIERS = [1, 2, 3, 4, 5];

/** 위 사다리로 못 찾았을 때의 확장 배수. 여기부터는 완화 사유를 기록한다 */
export const RELAX_MULTIPLIERS = [7, 10];

/**
 * 기준 단위의 상·하한.
 *
 * 하한이 없으면 후보가 빽빽한 도심에서 1단계가 수십 미터가 되어 사다리를 헛돈다.
 * 상한이 없으면 인제군이 33km짜리 사다리를 갖게 되는데, 그건 하루 코스가 아니다.
 * 상한에 걸린 지역은 후보를 반경 밖에서 끌어오게 되고, 그 사실이 완화 사유로 남는다.
 */
export const MIN_RADIUS_UNIT_KM = 0.4;
export const MAX_RADIUS_UNIT_KM = 3;

/** 산포도를 잴 때 보는 이웃 번호. 한 슬롯을 채우려면 주변에 몇 곳은 있어야 한다 */
const SPREAD_NEIGHBOR_RANK = 3;

export const ANCHOR_TRIES = 15;

/** 한 코스에 넣을 수 있는 섬 후보 수. 둘이면 사이를 배로 건너야 한다 */
export const MAX_ISLAND_SPOTS = 1;

/** 앵커가 되려면 사다리 끝 반경 안에 있어야 하는 다른 후보 수. 4곳을 도니 셋은 있어야 한다 */
export const ANCHOR_MIN_NEIGHBORS = 3;

/** 슬롯당 조합 탐색에 넣을 후보 수 */
export const CANDIDATES_PER_SLOT = 6;

/**
 * 풀이 이보다 작으면 슬롯당 후보를 늘린다.
 *
 * 후보가 30건뿐인 시군구(인제·울진)는 조합이 사실상 하나로 수렴해서
 * 재매칭해도 매번 같은 코스가 나왔다. 고를 것이 적을수록 더 넓게 봐야 한다.
 */
export const SMALL_POOL_SIZE = 60;
export const CANDIDATES_PER_SLOT_SMALL = 10;

/**
 * 하루 코스로 인정하는 이동 시간 상한(분). 체류 시간은 빼고 이동만이다.
 *
 * 거리 대신 시간으로 재는 이유는 routeMoveMinutes 주석에 있다.
 * 이 예산을 넘는 코스밖에 못 만드는 지역은 결제 전에 걸러야 한다(course-preflight).
 */
export const MOVE_MINUTES_BUDGET = 90;

/**
 * 다양성 선택에 넣을 코스의 상한.
 *
 * 절대 거리(예전: 4km)로 자르면 넓은 군은 어떤 코스도 통과하지 못해
 * 다양성 선택 자체를 못 타고 늘 최단 코스 하나로 떨어졌다.
 * 그 지역에서 실제로 나온 최단 코스를 기준으로 상대 평가한다.
 */
export const ACCEPTABLE_DISTANCE_RATIO = 1.3;

/**
 * 되돌아감 허용치. 총거리에 비례하되 짧은 코스를 위해 바닥을 둔다.
 * 도보권 2km 코스에서 0.4km 되돌아감은 흔하지만 20km 코스에서는 오차다.
 */
export const ACCEPTABLE_BACKTRACK_RATIO = 0.2;
export const ACCEPTABLE_BACKTRACK_FLOOR_KM = 0.5;

/**
 * 이 지역에서 쓸 탐색 설정. 풀을 한 번 훑어 정하고 선정 내내 쓴다.
 */
export interface SearchScale {
  /** 기준 단위(km). 후보들이 얼마나 뭉쳐 있는지 */
  unitKm: number;
  /** 정상 탐색 반경 단계 */
  stepsKm: number[];
  /** 못 찾았을 때의 확장 반경 단계 */
  relaxStepsKm: number[];
  /** 슬롯당 조합에 넣을 후보 수 */
  candidatesPerSlot: number;
}

/** 산포도 계산에 넣을 최대 표본. 중앙값이라 전수로 안 재도 값이 거의 안 변한다 */
const SPREAD_SAMPLE_SIZE = 300;

/**
 * 후보들이 얼마나 뭉쳐 있는지 잰다.
 *
 * 각 후보에서 3번째로 가까운 이웃까지의 거리를 구하고 그 중앙값을 쓴다.
 * "한 곳에 서면 주변 몇 km 안에 갈 만한 데가 셋쯤 있다"는 뜻이라
 * 슬롯 하나를 채우는 데 필요한 반경과 바로 이어진다.
 *
 * 평균이 아니라 중앙값인 이유는 멀리 떨어진 섬 하나가 값을 통째로 끌어올리기 때문이다.
 */
function spreadUnitKm(pool: TourSpot[]): number {
  const sample =
    pool.length <= SPREAD_SAMPLE_SIZE
      ? pool
      : pool.filter(
          (_, index) =>
            index % Math.ceil(pool.length / SPREAD_SAMPLE_SIZE) === 0,
        );

  const distances: number[] = [];
  for (const spot of sample) {
    const neighbors = pool
      .filter((other) => other.contentId !== spot.contentId)
      .map((other) => haversineKm(spot, other))
      .sort((a, b) => a - b);

    if (neighbors.length >= SPREAD_NEIGHBOR_RANK) {
      distances.push(neighbors[SPREAD_NEIGHBOR_RANK - 1]);
    }
  }

  if (distances.length === 0) return MAX_RADIUS_UNIT_KM;

  distances.sort((a, b) => a - b);
  const median = distances[Math.floor(distances.length / 2)];

  return Math.min(MAX_RADIUS_UNIT_KM, Math.max(MIN_RADIUS_UNIT_KM, median));
}

export function searchScaleOf(pool: TourSpot[]): SearchScale {
  const unitKm = spreadUnitKm(pool);

  return {
    unitKm,
    stepsKm: RADIUS_MULTIPLIERS.map((multiplier) => unitKm * multiplier),
    relaxStepsKm: RELAX_MULTIPLIERS.map((multiplier) => unitKm * multiplier),
    candidatesPerSlot:
      pool.length < SMALL_POOL_SIZE
        ? CANDIDATES_PER_SLOT_SMALL
        : CANDIDATES_PER_SLOT,
  };
}

export interface SelectedSpot {
  role: string;
  spot: TourSpot;
  /** 조건을 완화해서 뽑았으면 사유, 아니면 null */
  relaxation: string | null;
}

export interface SelectedCourse {
  spots: SelectedSpot[];
  totalDistanceKm: number;
  /** 이동에만 드는 시간(분). 체류 시간은 빼고. */
  moveMinutes: number;
  /**
   * 이동 시간이 하루 코스 예산 안에 드는지.
   *
   * false면 그 지역에서는 이만큼 움직이지 않고는 4곳을 못 채운다는 뜻이다.
   * 결제 전 판정(course-preflight)이 이 값을 보고 거른다.
   */
  withinMoveBudget: boolean;
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
  scale: SearchScale,
): string | null {
  if (source === 'THEME') return '역할 후보 소진 -> 테마 기준 대체';
  if (source === 'ANY') return '테마 후보 소진 -> 지역 전체 최근접';

  const distanceKm = haversineKm(anchor, spot);
  const maxNormal = scale.stepsKm[scale.stepsKm.length - 1];
  if (distanceKm <= maxNormal) return null;

  const round = (km: number) => km.toFixed(1);

  for (const radiusKm of scale.relaxStepsKm) {
    if (distanceKm <= radiusKm) {
      return `${round(maxNormal)}km 내 후보 없음 -> ${round(radiusKm)}km로 확장`;
    }
  }

  const maxRelax = scale.relaxStepsKm[scale.relaxStepsKm.length - 1];
  return `${round(maxRelax)}km 내 후보 없음 -> 반경 무제한`;
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
  scale: SearchScale,
): SlotCandidates | null {
  const matching = pool.filter(
    (spot) =>
      spot.contentId !== anchor.contentId && matchesFilter(spot, spec.filter),
  );

  if (matching.length > 0) {
    return {
      spec,
      list: buildList(matching, anchor, seed, spec, scale),
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
      list: buildList(byTheme, anchor, seed, spec, scale),
      source: 'THEME',
    };
  }

  const anySpot = pool.filter((spot) => spot.contentId !== anchor.contentId);
  if (anySpot.length > 0) {
    return {
      spec,
      list: buildList(anySpot, anchor, seed, spec, scale),
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
  scale: SearchScale,
): TourSpot[] {
  for (const radiusKm of [...scale.stepsKm, ...scale.relaxStepsKm]) {
    const near = matching.filter(
      (spot) => haversineKm(anchor, spot) <= radiusKm,
    );
    if (near.length >= scale.candidatesPerSlot) {
      return rank(near, seed, spec).slice(0, scale.candidatesPerSlot);
    }
  }

  const maxNormal = scale.stepsKm[scale.stepsKm.length - 1];
  const within = rank(
    matching.filter((spot) => haversineKm(anchor, spot) <= maxNormal),
    seed,
    spec,
  );
  const outside = byDistance(
    matching.filter((spot) => haversineKm(anchor, spot) > maxNormal),
    anchor,
  );

  return [...within, ...outside].slice(0, scale.candidatesPerSlot);
}

interface ScoredCombination {
  spots: TourSpot[];
  path: PathScore;
}

/**
 * 이름만 보고 섬(또는 섬으로 드나드는 항)인지 짐작한다.
 *
 * 거리 계산이 직선거리라서 배로만 오갈 수 있는 곳도 "2km"로 나온다.
 * 실제로 여수 코스가 낭도항 -> 사도 -> 추도로 뽑힌 적이 있는데, 셋 다 다른 섬이라
 * 총 3.4km짜리 도보 코스처럼 안내될 뻔했다.
 *
 * 이름으로 거르는 건 거칠다. 육지인데 '~도'로 끝나거나 육지 항구도 걸린다.
 * 그래서 완전히 막지 않고 "한 코스에 하나까지"만 허용한다. 오동도처럼 다리로
 * 걸어 들어가는 섬 하나는 그대로 두고, 섬을 두 개 이상 묶는 것만 막는다.
 * 지형 데이터를 붙이기 전까지 쓰는 임시 방편이다.
 */
function looksLikeIsland(spot: TourSpot): boolean {
  // "추도(여수)"처럼 괄호가 붙으면 끝 글자를 못 본다
  const name = spot.title.replace(/\(.*?\)/g, ' ').trim();

  // 주소 첫 칸은 시·도다. '강원특별자치도'가 늘 걸리므로 떼고 본다
  const address = spot.address.split(/\s+/).slice(1).join(' ');

  if (/섬/.test(name) || /섬/.test(address)) return true;

  // '사도', '초곡항'처럼 이름이 도·항으로 끝나는 경우
  if (/[가-힣](?:도|항)(?:\s|$)/.test(`${name} `)) return true;

  // 이름은 안 걸려도 주소에 '사도길', '낭도리'처럼 섬 이름이 남는다.
  // (여수 낭도리 공룡발자국화석 산지가 이 경우다)
  return /[가-힣]도(?=길|리)/.test(address);
}

/**
 * 후보군을 조합해 가능한 경로를 모두 만들고 최적 하나를 고른다.
 * 슬롯 i의 후보는 항상 i번째 자리에 들어간다. 시간대 의미가 있어 순서는 바꾸지 않는다.
 */
function bestCombination(
  anchor: TourSpot,
  slots: SlotCandidates[],
  requireDistinct: boolean,
  limitIslands: boolean,
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

      // 섬끼리 묶이면 사이를 배로 건너야 한다
      if (
        limitIslands &&
        looksLikeIsland(candidate) &&
        [anchor, ...chosen].filter(looksLikeIsland).length >= MAX_ISLAND_SPOTS
      ) {
        continue;
      }

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
 * 주변에 갈 곳이 없는 앵커 후보를 걸러낸다.
 *
 * 풀은 시군구로 좁혀져 있지만(#68) 그 안에서도 후보가 고르게 퍼져 있지는 않다.
 * 인제군처럼 넓은 군은 한쪽 끝의 외딴 폭포가 앵커가 될 수 있고, 그러면 나머지
 * 세 자리를 전부 반경 밖에서 끌어오게 된다. buildList가 사다리 안에 후보가
 * 모자라면 가까운 순으로 밖에서 채우기 때문에, 하루에 못 도는 코스가 조용히 만들어진다.
 *
 * 사용자 위치를 모르니 "관광지가 뭉쳐 있는 곳"을 대신 기준으로 삼는다.
 * 서울처럼 어디나 밀집한 지역은 거의 다 통과해서 영향이 없고,
 * 넓은 군에서는 읍내·관광 거점이 자연히 앞으로 온다.
 *
 * 뭉친 곳이 하나도 없으면 거르지 않는다. 빈 코스를 낼 수는 없기 때문이다.
 * 그런 지역은 애초에 결제 전 판정에서 걸러지는 것이 맞다.
 */
function clustered(
  candidates: TourSpot[],
  pool: TourSpot[],
  scale: SearchScale,
): TourSpot[] {
  // 사다리 끝까지 봐서 이웃이 없으면 어떤 조합으로도 뭉치지 않는다
  const radiusKm = scale.stepsKm[scale.stepsKm.length - 1];

  const hasNeighbors = (anchor: TourSpot) => {
    let count = 0;
    for (const spot of pool) {
      if (spot.contentId === anchor.contentId) continue;
      if (haversineKm(anchor, spot) > radiusKm) continue;
      if (++count >= ANCHOR_MIN_NEIGHBORS) return true;
    }
    return false;
  };

  const dense = candidates.filter(hasNeighbors);
  return dense.length > 0 ? dense : candidates;
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

  // 반경은 이 지역 후보가 얼마나 뭉쳐 있는지 보고 정한다. 한 번만 재서 끝까지 쓴다
  const scale = searchScaleOf(pool);

  let anchors = rank(
    clustered(
      pool.filter((spot) => matchesFilter(spot, template[0].filter)),
      pool,
      scale,
    ),
    seed,
    template[0],
  ).slice(0, ANCHOR_TRIES);

  let anchorRelaxation: string | null = null;

  if (anchors.length === 0) {
    anchors = rank(
      clustered(
        pool.filter((spot) => matchesFilter(spot, THEME_FILTER[theme])),
        pool,
        scale,
      ),
      seed,
    ).slice(0, ANCHOR_TRIES);
    anchorRelaxation = '1번 역할 후보 없음 -> 테마 기준 앵커';
  }

  // 테마에 맞는 곳이 지역에 하나도 없어도 빈 코스를 낼 수는 없다
  if (anchors.length === 0) {
    anchors = rank(clustered(pool, pool, scale), seed).slice(0, ANCHOR_TRIES);
    anchorRelaxation = '테마 후보 없음 -> 지역 전체에서 앵커 선정';
  }

  const buildCourses = (limitIslands: boolean): SelectedCourse[] => {
    const built: SelectedCourse[] = [];

    for (const anchor of anchors) {
      const slots: SlotCandidates[] = [];
      for (const spec of template.slice(1)) {
        const candidates = collectSlotCandidates(
          pool,
          spec,
          anchor,
          theme,
          seed,
          scale,
        );
        if (!candidates) break;
        slots.push(candidates);
      }
      if (slots.length < template.length - 1) continue;

      // 중분류 중복 회피를 먼저 시도하고, 그걸로 만들 수 있는 경로가 없으면 푼다
      const combination =
        bestCombination(anchor, slots, true, limitIslands) ??
        bestCombination(anchor, slots, false, limitIslands);
      if (!combination) continue;

      built.push({
        spots: combination.spots.map((spot, index) => ({
          role: template[index].role,
          spot,
          relaxation:
            index === 0
              ? anchorRelaxation
              : describeRelaxation(
                  anchor,
                  spot,
                  slots[index - 1].source,
                  scale,
                ),
        })),
        totalDistanceKm: combination.path.totalDistanceKm,
        moveMinutes: combination.path.moveMinutes,
        withinMoveBudget: combination.path.moveMinutes <= MOVE_MINUTES_BUDGET,
        backtrackPenaltyKm:
          combination.path.reversalKm + combination.path.revisitKm,
        score: combination.path.score,
      });
    }

    return built;
  };

  // 섬 제한은 앵커를 다 돌려본 뒤에 푼다. 앵커별로 바로 풀어 버리면
  // 첫 앵커가 섬이라는 이유만으로 섬 코스가 나온다 — 다른 앵커에는
  // 육지 조합이 있는데도. 신안·옹진처럼 후보가 전부 섬인 지역에서만 풀린다.
  const courses = (() => {
    const limited = buildCourses(true);
    return limited.length > 0 ? limited : buildCourses(false);
  })();

  if (courses.length === 0) return null;

  // 기준을 그 지역에서 실제로 나온 최단 코스에 건다.
  // 절대 거리로 자르면 넓은 군은 어떤 코스도 통과하지 못해 다양성 선택을 못 탄다
  const shortestKm = Math.min(
    ...courses.map((course) => course.totalDistanceKm),
  );
  const distanceLimitKm = shortestKm * ACCEPTABLE_DISTANCE_RATIO;

  // 거리만 보면 되돌아가는 경로가 섞여 들어온다
  const acceptable = courses.filter(
    (course) =>
      course.withinMoveBudget &&
      course.totalDistanceKm <= distanceLimitKm &&
      course.backtrackPenaltyKm <=
        Math.max(
          ACCEPTABLE_BACKTRACK_FLOOR_KM,
          course.totalDistanceKm * ACCEPTABLE_BACKTRACK_RATIO,
        ),
  );

  if (acceptable.length === 0) {
    return [...courses].sort((a, b) => a.score - b.score)[0];
  }

  const index = Math.floor(
    seededScore(seed, `pick:${acceptable.length}`) * acceptable.length,
  );
  return acceptable[Math.min(index, acceptable.length - 1)];
}
