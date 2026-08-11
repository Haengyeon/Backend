/*
  Warnings:

  - You are about to drop the `Test` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('KAKAO');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "Mbti" AS ENUM ('ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ');

-- CreateEnum
CREATE TYPE "JobCategory" AS ENUM ('IT_DEVELOPMENT', 'DESIGN', 'MARKETING', 'EDUCATION', 'MEDICAL_HEALTH', 'LAW', 'FINANCE', 'ARCHITECTURE_ENGINEERING', 'ART_CREATIVE', 'FREELANCER', 'STUDENT', 'RESEARCH', 'PUBLIC_ADMINISTRATION', 'MEDIA_PUBLISHING', 'SERVICE');

-- CreateEnum
CREATE TYPE "Hobby" AS ENUM ('ART', 'CAFE', 'FOOD', 'READING', 'EXERCISE', 'IT', 'COOKING', 'SEA', 'MOVIE', 'EXHIBITION', 'PHOTO', 'ANIMAL', 'MUSIC', 'ACTIVITY', 'HISTORY');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('SEOUL', 'BUSAN', 'DAEGU', 'INCHEON', 'GWANGJU', 'DAEJEON', 'ULSAN', 'SEJONG', 'GYEONGGI', 'GANGWON', 'CHUNGBUK', 'CHUNGNAM', 'JEONBUK', 'JEONNAM', 'GYEONGBUK', 'GYEONGNAM', 'JEJU');

-- CreateEnum
CREATE TYPE "CourseTheme" AS ENUM ('NATURE_HEALING', 'HISTORY_CULTURE', 'NIGHT_DATE', 'PHOTO_SPOT', 'LOCAL_FOOD_MARKET', 'ACTIVITY', 'WALKING_TRIP', 'ART_SENSIBILITY');

-- CreateEnum
CREATE TYPE "PreferredGender" AS ENUM ('MALE', 'FEMALE', 'ANY');

-- CreateEnum
CREATE TYPE "MatchingStatus" AS ENUM ('SEARCHING', 'WAITING_RESPONSE', 'RETRY_READY', 'PAYMENT_PENDING', 'CONFIRMED', 'EXHAUSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchAttemptStatus" AS ENUM ('WAITING_RESPONSE', 'REJECTED', 'PAYMENT_PENDING', 'CONFIRMED', 'RESPONSE_EXPIRED', 'PAYMENT_EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchDecision" AS ENUM ('ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('READY', 'APPROVED', 'CANCELLED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ChatRoomStatus" AS ENUM ('LOCKED', 'OPEN', 'CLOSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CourseSessionStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportReasonCode" AS ENUM ('INAPPROPRIATE_PROFILE', 'NO_SHOW', 'ABUSE_HARASSMENT', 'SUSPECTED_FRAUD', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('KAKAO');

-- CreateEnum
CREATE TYPE "PointTransactionType" AS ENUM ('EARN', 'USE', 'EXPIRE');

-- DropTable
DROP TABLE "Test";

-- CreateTable
CREATE TABLE "Auth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL DEFAULT 'KAKAO',
    "kakaoId" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "nickname" VARCHAR(20) NOT NULL,
    "birthDate" DATE NOT NULL,
    "gender" "Gender" NOT NULL,
    "mbti" "Mbti",
    "bio" VARCHAR(100) NOT NULL,
    "jobCategory" "JobCategory" NOT NULL,
    "jobPrivate" BOOLEAN NOT NULL DEFAULT false,
    "hobbies" "Hobby"[],
    "profileImageUrl" VARCHAR(500) NOT NULL,
    "fullBodyImageUrl" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matching" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "maxDistanceKm" INTEGER NOT NULL,
    "ageMin" INTEGER NOT NULL,
    "ageMax" INTEGER NOT NULL,
    "preferredGender" "PreferredGender" NOT NULL DEFAULT 'ANY',
    "themes" "CourseTheme"[],
    "status" "MatchingStatus" NOT NULL DEFAULT 'SEARCHING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Matching_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingAvailableDate" (
    "id" TEXT NOT NULL,
    "matchingId" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "MatchingAvailableDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchAttempt" (
    "id" TEXT NOT NULL,
    "matchingAId" TEXT NOT NULL,
    "matchingBId" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "theme" "CourseTheme" NOT NULL,
    "travelDate" DATE NOT NULL,
    "status" "MatchAttemptStatus" NOT NULL DEFAULT 'WAITING_RESPONSE',
    "respondDeadlineAt" TIMESTAMP(3) NOT NULL,
    "paymentDeadlineAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "MatchAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResponse" (
    "id" TEXT NOT NULL,
    "matchAttemptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" "MatchDecision" NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "matchAttemptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "regionContributionAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'READY',
    "kakaoPayTid" TEXT,
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" TEXT NOT NULL,
    "matchAttemptId" TEXT NOT NULL,
    "status" "ChatRoomStatus" NOT NULL DEFAULT 'LOCKED',
    "openAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageQuota" (
    "id" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "freeCountUsed" INTEGER NOT NULL DEFAULT 0,
    "extendedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChatMessageQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageExtensionPayment" (
    "id" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "extendedCount" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'READY',
    "kakaoPayTid" TEXT,
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageExtensionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "theme" "CourseTheme" NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER,
    "thumbnailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSpot" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "imageUrl" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "CourseSpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseMission" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "spotId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CourseMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSession" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "matchAttemptId" TEXT NOT NULL,
    "travelDate" DATE NOT NULL,
    "status" "CourseSessionStatus" NOT NULL DEFAULT 'UPCOMING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseMissionPhoto" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageUrl" VARCHAR(500) NOT NULL,
    "comment" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseMissionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseReview" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseVideo" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'PENDING',
    "videoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CourseVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "matchAttemptId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "reasonCode" "ReportReasonCode" NOT NULL,
    "description" VARCHAR(500),
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "matchAttemptId" TEXT NOT NULL,
    "blockingUserId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kakaoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointTransaction" (
    "id" TEXT NOT NULL,
    "pointAccountId" TEXT NOT NULL,
    "courseSessionId" TEXT,
    "type" "PointTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stamp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseSessionId" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stamp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auth_userId_key" ON "Auth"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Auth_provider_kakaoId_key" ON "Auth"("provider", "kakaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "Matching_userId_idx" ON "Matching"("userId");

-- CreateIndex
CREATE INDEX "Matching_userId_status_idx" ON "Matching"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingAvailableDate_matchingId_date_key" ON "MatchingAvailableDate"("matchingId", "date");

-- CreateIndex
CREATE INDEX "MatchAttempt_matchingAId_idx" ON "MatchAttempt"("matchingAId");

-- CreateIndex
CREATE INDEX "MatchAttempt_matchingBId_idx" ON "MatchAttempt"("matchingBId");

-- CreateIndex
CREATE INDEX "MatchAttempt_status_idx" ON "MatchAttempt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResponse_matchAttemptId_userId_key" ON "MatchResponse"("matchAttemptId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_kakaoPayTid_key" ON "Payment"("kakaoPayTid");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_matchAttemptId_userId_key" ON "Payment"("matchAttemptId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoom_matchAttemptId_key" ON "ChatRoom"("matchAttemptId");

-- CreateIndex
CREATE INDEX "ChatMessage_chatRoomId_createdAt_idx" ON "ChatMessage"("chatRoomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageQuota_chatRoomId_userId_key" ON "ChatMessageQuota"("chatRoomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageExtensionPayment_kakaoPayTid_key" ON "MessageExtensionPayment"("kakaoPayTid");

-- CreateIndex
CREATE INDEX "MessageExtensionPayment_chatRoomId_idx" ON "MessageExtensionPayment"("chatRoomId");

-- CreateIndex
CREATE INDEX "MessageExtensionPayment_userId_idx" ON "MessageExtensionPayment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSpot_courseId_order_key" ON "CourseSpot"("courseId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CourseMission_courseId_order_key" ON "CourseMission"("courseId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSession_matchAttemptId_key" ON "CourseSession"("matchAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseMissionPhoto_sessionId_missionId_userId_key" ON "CourseMissionPhoto"("sessionId", "missionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseReview_sessionId_userId_key" ON "CourseReview"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseVideo_sessionId_key" ON "CourseVideo"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_matchAttemptId_key" ON "Report"("reporterId", "matchAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockingUserId_blockedUserId_key" ON "UserBlock"("blockingUserId", "blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_userId_key" ON "NotificationSetting"("userId");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_idx" ON "NotificationLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PointAccount_userId_key" ON "PointAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Stamp_userId_region_key" ON "Stamp"("userId", "region");

-- AddForeignKey
ALTER TABLE "Auth" ADD CONSTRAINT "Auth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matching" ADD CONSTRAINT "Matching_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingAvailableDate" ADD CONSTRAINT "MatchingAvailableDate_matchingId_fkey" FOREIGN KEY ("matchingId") REFERENCES "Matching"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAttempt" ADD CONSTRAINT "MatchAttempt_matchingAId_fkey" FOREIGN KEY ("matchingAId") REFERENCES "Matching"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAttempt" ADD CONSTRAINT "MatchAttempt_matchingBId_fkey" FOREIGN KEY ("matchingBId") REFERENCES "Matching"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResponse" ADD CONSTRAINT "MatchResponse_matchAttemptId_fkey" FOREIGN KEY ("matchAttemptId") REFERENCES "MatchAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResponse" ADD CONSTRAINT "MatchResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_matchAttemptId_fkey" FOREIGN KEY ("matchAttemptId") REFERENCES "MatchAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_matchAttemptId_fkey" FOREIGN KEY ("matchAttemptId") REFERENCES "MatchAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageQuota" ADD CONSTRAINT "ChatMessageQuota_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageQuota" ADD CONSTRAINT "ChatMessageQuota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageExtensionPayment" ADD CONSTRAINT "MessageExtensionPayment_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageExtensionPayment" ADD CONSTRAINT "MessageExtensionPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSpot" ADD CONSTRAINT "CourseSpot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMission" ADD CONSTRAINT "CourseMission_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMission" ADD CONSTRAINT "CourseMission_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "CourseSpot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_matchAttemptId_fkey" FOREIGN KEY ("matchAttemptId") REFERENCES "MatchAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMissionPhoto" ADD CONSTRAINT "CourseMissionPhoto_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMissionPhoto" ADD CONSTRAINT "CourseMissionPhoto_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "CourseMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMissionPhoto" ADD CONSTRAINT "CourseMissionPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseVideo" ADD CONSTRAINT "CourseVideo_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_matchAttemptId_fkey" FOREIGN KEY ("matchAttemptId") REFERENCES "MatchAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_matchAttemptId_fkey" FOREIGN KEY ("matchAttemptId") REFERENCES "MatchAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockingUserId_fkey" FOREIGN KEY ("blockingUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointAccount" ADD CONSTRAINT "PointAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_pointAccountId_fkey" FOREIGN KEY ("pointAccountId") REFERENCES "PointAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_courseSessionId_fkey" FOREIGN KEY ("courseSessionId") REFERENCES "CourseSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stamp" ADD CONSTRAINT "Stamp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stamp" ADD CONSTRAINT "Stamp_courseSessionId_fkey" FOREIGN KEY ("courseSessionId") REFERENCES "CourseSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
