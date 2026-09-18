-- CreateTable
CREATE TABLE "SpotDescription" (
    "contentId" TEXT NOT NULL,
    "overview" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpotDescription_pkey" PRIMARY KEY ("contentId")
);

-- CreateIndex
CREATE INDEX "SpotDescription_fetchedAt_idx" ON "SpotDescription"("fetchedAt");
