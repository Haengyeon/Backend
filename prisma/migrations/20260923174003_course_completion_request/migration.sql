-- CreateTable
CREATE TABLE "CourseCompletionRequest" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseCompletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseCompletionRequest_courseId_userId_key" ON "CourseCompletionRequest"("courseId", "userId");

-- AddForeignKey
ALTER TABLE "CourseCompletionRequest" ADD CONSTRAINT "CourseCompletionRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCompletionRequest" ADD CONSTRAINT "CourseCompletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

