import { Module } from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseController } from './course.controller';
import { CoursePreviewService } from './algorithm/course-preview.service';
import { TourApiClient } from './algorithm/tour-api.client';

// 코스 알고리즘만 다룸
// User / Chat / MatchAttempt 어디에도 의존하지 않음
@Module({
  controllers: [CourseController],
  providers: [CourseService, CoursePreviewService, TourApiClient],
  exports: [CourseService],
})
export class CourseModule {}
