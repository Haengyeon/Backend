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

// 코스 도메인
//   controller/  API 진입점
//   service/     조회 · 인증샷 · 완료 · 후기 · 추천
//   algorithm/   코스 생성 알고리즘 + 생성 결과 저장
//
// 서비스가 기대는 순서 (순환 없음)
//   access, reward  ← 밑바닥. prisma만 본다
//   completion      ← access, reward
//   photo           ← access, completion
//   review          ← access, reward
//   schedule        ← completion. 여행이 끝난 코스를 시계로 닫는다
//
// CourseGeneratorService를 내보내는 이유:
//   양쪽 결제가 끝나 매칭이 확정되면 PaymentService가 이걸 불러 코스를 만든다.
//   생성 시점이 결제라 클라이언트는 GET만으로 코스를 볼 수 있다.
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
