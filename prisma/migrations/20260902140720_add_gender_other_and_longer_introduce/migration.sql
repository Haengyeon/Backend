-- AlterEnum
ALTER TYPE "Gender" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "Profile" ALTER COLUMN "introduce" SET DATA TYPE VARCHAR(200);
