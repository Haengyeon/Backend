-- prisma/migrations/20260917175000_add_course_video/migration.sql
-- AlterTable
ALTER TABLE "CourseVideo" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "errorMessage" VARCHAR(200);