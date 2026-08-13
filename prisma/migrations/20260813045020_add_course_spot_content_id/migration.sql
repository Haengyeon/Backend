-- AlterTable
ALTER TABLE "CourseSpot" ADD COLUMN     "contentId" TEXT;

-- CreateIndex
CREATE INDEX "CourseSpot_contentId_idx" ON "CourseSpot"("contentId");
