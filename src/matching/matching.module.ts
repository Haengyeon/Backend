import { Module } from '@nestjs/common';
import { MatchingService } from './service/matching.service';
import { MatchingController } from './matching.controller';
import {MatchingEngineService} from "./service/matching-engine.service";

@Module({
  controllers: [MatchingController],
  providers: [MatchingService,MatchingEngineService],
})
export class MatchingModule {}
