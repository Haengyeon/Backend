-- AlterTable
ALTER TABLE "MatchAttempt" ADD COLUMN     "isExperience" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Matching" ADD COLUMN     "isExperience" BOOLEAN NOT NULL DEFAULT false;
