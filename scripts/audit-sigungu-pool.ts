// 시군구별로 TourAPI에 후보가 몇 건이나 있는지 센다.
//
// 코스 하나에 스팟 4곳이 필요한데, 후보가 모자라면 결제가 다 끝난 뒤에야
// NOT_ENOUGH_SPOTS로 터진다. 어느 시군구가 위험한지 미리 알아 두려고 만든 것이다.
//
//   npx ts-node scripts/audit-sigungu-pool.ts
//   npx ts-node scripts/audit-sigungu-pool.ts --threshold 20
//   npx ts-node scripts/audit-sigungu-pool.ts --deep
//
// 기본 조회는 전체 후보 수만 센다. 실제 코스는 테마별 필터를 거쳐 만들어지므로
// 이 숫자가 넉넉해도 특정 테마에서는 4곳을 못 채울 수 있다. --deep을 주면
// 후보가 적은 곳만 골라 테마 8개로 코스를 실제로 만들어 본다(시군구당 호출 수십 회).
//
// 매칭 선택지를 줄이는 것은 이 숫자를 보고 따로 결정한다. 스크립트는 세기만 한다.
import 'dotenv/config';

import { CourseTheme, Region } from '../src/generated/prisma/enums';
import { buildCoursePlan } from '../src/course/algorithm/course-planner';
import { templateFor } from '../src/course/algorithm/course-template';
import { TourApiClient } from '../src/course/algorithm/tour-api.client';
import {
  AREA_CODE,
  THEME_FILTER,
  toPoolQueries,
} from '../src/course/algorithm/tour-category';
import { SIGUNGU_MAP_CELLS } from '../src/course/algorithm/sigungu-cells';
import { SIGUNGU_NAME } from '../src/course/algorithm/sigungu-name';
import { REGION_LABEL } from '../src/course/algorithm/labels';

const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const TIMEOUT_MS = 10_000;

/** 동시 호출 수. 너무 올리면 data.go.kr이 막는다 */
const CONCURRENCY = 6;

/** 이 밑이면 코스 생성이 위태롭다고 본다. 코스 하나에 스팟 4곳 + 테마 필터를 거친다 */
const DEFAULT_THRESHOLD = 20;

function serviceKey(): string {
  const key = process.env.TOUR_API_SERVICE_KEY;
  if (!key) throw new Error('TOUR_API_SERVICE_KEY가 없습니다.');
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

/** 그 시군구의 전체 후보 수. 실패하면 null이고 집계에서 뺀다 */
async function countSpots(
  areaCode: string,
  sigunguCode: string,
): Promise<number | null> {
  const params = new URLSearchParams({
    MobileOS: 'ETC',
    MobileApp: 'Haengyeon',
    _type: 'json',
    numOfRows: '1',
    pageNo: '1',
    areaCode,
    sigunguCode,
  });

  try {
    const response = await fetch(
      `${BASE_URL}/areaBasedList2?serviceKey=${serviceKey()}&${params}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!response.ok) return null;

    const total = (await response.json())?.response?.body?.totalCount;
    return typeof total === 'number' ? total : Number(total) || 0;
  } catch {
    return null;
  }
}

type Row = { region: Region; code: string; name: string; count: number | null };

/**
 * 테마 8개로 코스를 실제로 만들어 보고, 못 만든 테마를 돌려준다.
 *
 * 전체 후보 수만으로는 모자란다. 코스는 테마별 대분류 필터를 거친 뒤 4곳을
 * 골라야 해서, 후보가 60건이어도 "야경 데이트"에서는 0건일 수 있다.
 */
async function failingThemes(
  api: TourApiClient,
  region: Region,
  sigunguCode: string,
): Promise<CourseTheme[]> {
  const failed: CourseTheme[] = [];

  for (const theme of Object.values(CourseTheme)) {
    const queries = toPoolQueries([
      ...templateFor(theme).map((slot) => slot.filter),
      THEME_FILTER[theme],
    ]);

    try {
      buildCoursePlan(
        { region, theme, seed: 'audit' },
        await api.fetchPool(region, queries, sigunguCode),
      );
    } catch {
      failed.push(theme);
    }
  }

  return failed;
}

async function main() {
  const flag = process.argv.indexOf('--threshold');
  const threshold =
    flag === -1 ? DEFAULT_THRESHOLD : Number(process.argv[flag + 1]);

  const targets = (Object.keys(SIGUNGU_MAP_CELLS) as Region[]).flatMap(
    (region) =>
      Object.keys(SIGUNGU_MAP_CELLS[region]).map((code) => ({ region, code })),
  );

  console.log(`시군구 ${targets.length}곳 조회 (기준 ${threshold}건 미만)\n`);

  const rows: Row[] = [];
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      targets.slice(i, i + CONCURRENCY).map(async ({ region, code }) => ({
        region,
        code,
        name: SIGUNGU_NAME[region][code],
        count: await countSpots(AREA_CODE[region], code),
      })),
    );
    rows.push(...batch);
    process.stdout.write(`\r  ${rows.length}/${targets.length}`);
  }
  console.log('\n');

  const unreachable = rows.filter((row) => row.count === null);
  const counted = rows.filter(
    (row): row is Row & { count: number } => row.count !== null,
  );
  const low = counted
    .filter((row) => row.count < threshold)
    .sort((a, b) => a.count - b.count);

  console.log(`조회 실패 ${unreachable.length}곳`);
  if (unreachable.length) {
    console.log(
      unreachable
        .map((r) => `  ${REGION_LABEL[r.region]} ${r.name}`)
        .join('\n'),
    );
  }

  console.log(`\n후보 ${threshold}건 미만: ${low.length}곳`);
  for (const row of low) {
    console.log(
      `  ${String(row.count).padStart(4)}건  ${REGION_LABEL[row.region]} ${row.name}`,
    );
  }

  const sorted = [...counted].sort((a, b) => a.count - b.count);
  const median = sorted[Math.floor(sorted.length / 2)]?.count ?? 0;
  console.log(
    `\n전체 ${counted.length}곳 — 중앙값 ${median}건, 최소 ${sorted[0]?.count}건, 최대 ${sorted[sorted.length - 1]?.count}건`,
  );

  if (!process.argv.includes('--deep')) return;

  console.log(
    `\n테마별 코스 생성 검사 (후보 ${threshold}건 미만 ${low.length}곳)`,
  );
  const api = new TourApiClient();

  for (const row of low) {
    const cannotBuild = await failingThemes(api, row.region, row.code);
    const label = `${REGION_LABEL[row.region]} ${row.name}`;
    console.log(
      cannotBuild.length === 0
        ? `  OK  ${label} — 테마 8개 모두 생성`
        : `  X   ${label} — 실패 ${cannotBuild.length}개: ${cannotBuild.join(', ')}`,
    );
  }
}

void main();
