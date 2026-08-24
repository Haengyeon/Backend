import { Module } from '@nestjs/common';
import { MatchingService } from './service/matching.service';
import { MatchingController } from './controller/matching.controller';
import {MatchingEngineService} from "./service/matching-engine.service";
import {MatchAttemptController} from "./controller/match-attempt.controller";
import {MatchAttemptService} from "./service/match-attempt.service";

@Module({
  controllers: [MatchingController, MatchAttemptController],
  providers: [MatchingService,MatchingEngineService, MatchAttemptService],
})
export class MatchingModule {}
