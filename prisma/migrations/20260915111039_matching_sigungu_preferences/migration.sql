/*
  Warnings:

  - You are about to drop the column `regions` on the `Matching` table. All the data in the column will be lost.
  - Added the required column `sigunguCode` to the `MatchAttempt` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "sigunguCode" TEXT;

-- AlterTable
ALTER TABLE "MatchAttempt" ADD COLUMN     "sigunguCode" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Matching" DROP COLUMN "regions";

-- CreateTable
CREATE TABLE "MatchingRegionPreference" (
    "id" TEXT NOT NULL,
    "matchingId" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "sigunguCode" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,

    CONSTRAINT "MatchingRegionPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchingRegionPreference_region_sigunguCode_idx" ON "MatchingRegionPreference"("region", "sigunguCode");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingRegionPreference_matchingId_region_sigunguCode_key" ON "MatchingRegionPreference"("matchingId", "region", "sigunguCode");

-- AddForeignKey
ALTER TABLE "MatchingRegionPreference" ADD CONSTRAINT "MatchingRegionPreference_matchingId_fkey" FOREIGN KEY ("matchingId") REFERENCES "Matching"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
