// 완료된 코스에서 스탬프를 다시 찍는다.
//
// 스탬프 단위를 시·도에서 시군구로 바꾸면서 기존 스탬프를 지웠다
// (20260902104500_stamp_by_sigungu). 시·도 스탬프에는 어느 구를 다녀왔는지가
// 없어서 컬럼을 채울 수 없었기 때문이다.
//
// 다행히 코스 스팟에 시군구 코드가 남아 있어 되짚을 수 있다. 다만 법정동 코드를
// 지도 코드로 바꾸는 표가 TypeScript에 있어서 마이그레이션 SQL로는 못 하고,
// 이 스크립트가 한다.
//
// 코스 완료 시계는 이미 COMPLETED인 코스를 다시 처리하지 않으므로,
// 이걸 돌리지 않으면 마이그레이션 전에 다녀온 여행의 스탬프가 영영 비어 있다.
//
// 여러 번 돌려도 결과가 같다. 이미 있는 칸은 건너뛴다.
//
//   npx ts-node -r tsconfig-paths/register scripts/backfill-stamps.ts
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { CourseStatus } from '../src/generated/prisma/enums';
import { mapSigunguCodeOf } from '../src/course/algorithm/sigungu-map-code';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const courses = await prisma.course.findMany({
    where: { status: CourseStatus.COMPLETED },
    select: {
      id: true,
      title: true,
      region: true,
      completedAt: true,
      spots: {
        orderBy: { order: 'asc' },
        select: { sigunguCode: true, legalSigunguCode: true },
      },
      matchAttempt: {
        select: {
          matchingA: { select: { userId: true } },
          matchingB: { select: { userId: true } },
        },
      },
    },
    // 먼저 다녀온 코스가 먼저 찍혀야 earnedAt 순서가 실제 순서와 맞는다
    orderBy: { completedAt: 'asc' },
  });

  console.log(`완료된 코스 ${courses.length}건`);

  let created = 0;

  for (const course of courses) {
    // 같은 지도 칸으로 접히는 구는 하나로 (부천 원미구·소사구 -> 부천시)
    const byMapCode = new Map<
      string,
      { sigunguCode: string; legalSigunguCode: string; mapSigunguCode: string }
    >();

    for (const spot of course.spots) {
      const mapSigunguCode = mapSigunguCodeOf(spot.legalSigunguCode);
      if (!mapSigunguCode || !spot.sigunguCode || !spot.legalSigunguCode) {
        continue;
      }
      if (!byMapCode.has(mapSigunguCode)) {
        byMapCode.set(mapSigunguCode, {
          sigunguCode: spot.sigunguCode,
          legalSigunguCode: spot.legalSigunguCode,
          mapSigunguCode,
        });
      }
    }

    const places = [...byMapCode.values()];
    if (places.length === 0) {
      console.log(`  건너뜀 ${course.title} — 시군구 코드가 있는 스팟이 없음`);
      continue;
    }

    // 같이 걸은 코스라 두 사람 모두 받는다
    const userIds = [
      course.matchAttempt.matchingA.userId,
      course.matchAttempt.matchingB.userId,
    ];

    for (const userId of userIds) {
      const result = await prisma.stamp.createMany({
        data: places.map((place) => ({
          userId,
          courseId: course.id,
          region: course.region,
          // 완료 시각으로 찍어야 "언제 모았나"가 실제와 맞는다
          ...(course.completedAt ? { earnedAt: course.completedAt } : {}),
          ...place,
        })),
        // 이미 가진 칸은 그대로 둔다. 다시 돌려도 안전한 이유가 이것이다
        skipDuplicates: true,
      });

      created += result.count;
    }

    console.log(
      `  ${course.title} — 시군구 ${places.length}곳 x 2명 (새로 ${places.length * 2}개 시도)`,
    );
  }

  console.log(`새로 찍은 스탬프 ${created}개`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
