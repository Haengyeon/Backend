-- CreateTable
CREATE TABLE "SpotReview" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpotReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpotReview_contentId_idx" ON "SpotReview"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "SpotReview_spotId_userId_key" ON "SpotReview"("spotId", "userId");

-- AddForeignKey
ALTER TABLE "SpotReview" ADD CONSTRAINT "SpotReview_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotReview" ADD CONSTRAINT "SpotReview_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "CourseSpot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotReview" ADD CONSTRAINT "SpotReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
