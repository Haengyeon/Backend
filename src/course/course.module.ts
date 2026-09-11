import { Module } from '@nestjs/common';
import { CourseController } from './controller/course.controller';
import { CourseQueryService } from './service/course-query.service';
import { CourseAccessService } from './service/course-access.service';
import { CourseRewardService } from './service/course-reward.service';
import { CoursePhotoService } from './service/course-photo.service';
import { CourseCompletionService } from './service/course-completion.service';
import { CourseReviewService } from './service/course-review.service';
import { CourseScheduleService } from './service/course-schedule.service';
import { CourseRecommendService } from './service/course-recommend.service';
import { CourseGeneratorService } from './algorithm/course-generator.service';
import { TourApiClient } from './algorithm/tour-api.client';

@Module({
  controllers: [CourseController],
  providers: [
    CourseQueryService,
    CourseAccessService,
    CourseRewardService,
    CoursePhotoService,
    CourseCompletionService,
    CourseReviewService,
    CourseScheduleService,
    CourseRecommendService,
    CourseGeneratorService,
    TourApiClient,
  ],
  exports: [CourseGeneratorService],
})
export class CourseModule {}
