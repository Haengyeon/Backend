import { Module } from '@nestjs/common';

import { MatchingController } from './controller/matching.controller';
import { MatchAttemptController } from './controller/match-attempt.controller';
import { MatchingService } from './service/matching.service';
import { MatchingEngineService } from './service/matching-engine.service';
import { MatchAttemptService } from './service/match-attempt.service';
import { MatchingPenaltyService } from './service/matching-penalty.service';
import { MatchingDeadlineScheduler } from './service/matching-deadline.scheduler';

@Module({
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