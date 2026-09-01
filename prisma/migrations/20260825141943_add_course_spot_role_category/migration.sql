-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "totalDistanceKm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "CourseSpot" ADD COLUMN     "category" TEXT,
ADD COLUMN     "role" TEXT;
