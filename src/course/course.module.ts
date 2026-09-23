import { Module } from '@nestjs/common';
import { CourseController } from './controller/course.controller';
import { CourseQueryService } from './service/course-query.service';
import { CourseAccessService } from './service/course-access.service';
import { CourseRewardService } from './service/course-reward.service';
import { CoursePhotoService } from './service/course-photo.service';
import { CourseCompletionService } from './service/course-completion.service';
import { CourseExperienceService } from './service/course-experience.service';
import { CourseReviewService } from './service/course-review.service';
import { CourseScheduleService } from './service/course-schedule.service';
import { CourseRecommendService } from './service/course-recommend.service';
import { SpotDescriptionService } from './service/spot-description.service';
import { CourseRecommendScheduler } from './service/course-recommend.scheduler';
import { CourseGeneratorService } from './algorithm/course-generator.service';
import { TourApiClient } from './algorithm/tour-api.client';
import { CourseReminderScheduler } from './service/course-reminder.scheduler';
import {VideoController} from "../video/controller/video.controller";
import {VideoService} from "../video/service/video.service";

@Module({
  controllers: [CourseController,VideoController],
  providers: [
    CourseQueryService,
    CourseAccessService,
    CourseRewardService,
    CoursePhotoService,
    CourseCompletionService,
    CourseExperienceService,
    CourseReviewService,
    CourseScheduleService,
    CourseRecommendService,
    SpotDescriptionService,
    CourseRecommendScheduler,
    CourseGeneratorService,
    TourApiClient,
    CourseReminderScheduler,
    VideoService
  ],
  // 홈 행사 목록(FestivalModule)도 같은 TourAPI 클라이언트를 쓴다
  exports: [CourseGeneratorService, TourApiClient, SpotDescriptionService],
})
export class CourseModule {}
