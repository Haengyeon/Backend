/*
  스탬프 단위를 시·도에서 시군구로 바꾼다.
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
