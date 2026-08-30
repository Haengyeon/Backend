-- CreateTable
CREATE TABLE "PartnerReview" (
    "id" TEXT NOT NULL,
    "matchAttemptId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "revieweeId" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerReview_revieweeId_idx" ON "PartnerReview"("revieweeId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerReview_matchAttemptId_reviewerId_key" ON "PartnerReview"("matchAttemptId", "reviewerId");

-- AddForeignKey
ALTER TABLE "PartnerReview" ADD CONSTRAINT "PartnerReview_matchAttemptId_fkey" FOREIGN KEY ("matchAttemptId") REFERENCES "MatchAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerReview" ADD CONSTRAINT "PartnerReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerReview" ADD CONSTRAINT "PartnerReview_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
