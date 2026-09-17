import { Module } from '@nestjs/common';

import { MatchingController } from './controller/matching.controller';
import { MatchAttemptController } from './controller/match-attempt.controller';
import { MatchingService } from './service/matching.service';
import { MatchingEngineService } from './service/matching-engine.service';
import { MatchAttemptService } from './service/match-attempt.service';
import { MatchingPenaltyService } from './service/matching-penalty.service';
import { MatchingDeadlineScheduler } from './service/matching-deadline.scheduler';
import { SafetyModule } from '../safety/safety.module';
import {PaymentModule} from "../payment/payment.module";
import { CourseModule } from '../course/course.module';

@Module({
    // 차단한 상대를 후보에서 빼기 위해 BlockService가 필요하다.
    // SafetyModule은 매칭 쪽을 참조하지 않으므로 순환 참조가 아니다.
    // 결제로 넘기기 전에 코스를 만들 수 있는지 보려면 CourseGeneratorService가 필요하다.
    // CourseModule은 매칭 쪽을 참조하지 않으므로 순환 참조가 아니다.
    imports: [SafetyModule, PaymentModule, CourseModule],
    controllers: [MatchingController, MatchAttemptController],
    providers: [
        MatchingService,
        MatchingEngineService,
        MatchAttemptService,
        MatchingPenaltyService,
        MatchingDeadlineScheduler,
    ],
})
export class MatchingModule {}