/*
  스탬프 단위를 시·도에서 시군구로 바꾼다.

  기존 스탬프는 지우고 간다. 시·도 스탬프에는 어느 구를 다녀왔는지가 없어서
  새 컬럼을 채울 방법이 없다. 대신 완료된 코스의 스팟에 시군구 코드가 남아 있어
  거기서 다시 찍을 수 있다 — 법정동 코드를 지도 코드로 바꾸는 표가
  TypeScript(sigungu-map-code.ts)에 있어서 SQL로는 못 하고,
  scripts/backfill-stamps.ts가 한다.
*/

-- 시·도 스탬프는 시군구로 되짚을 수 없다
DELETE FROM "Stamp";

-- DropIndex
DROP INDEX "Stamp_userId_region_key";

-- AlterTable
ALTER TABLE "Stamp" ADD COLUMN     "sigunguCode" TEXT NOT NULL,
ADD COLUMN     "legalSigunguCode" TEXT NOT NULL,
ADD COLUMN     "mapSigunguCode" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Stamp_userId_mapSigunguCode_key" ON "Stamp"("userId", "mapSigunguCode");

-- CreateIndex
CREATE INDEX "PointTransaction_pointAccountId_createdAt_idx" ON "PointTransaction"("pointAccountId", "createdAt");
