import { Module } from '@nestjs/common';
import { RewardController } from './controller/reward.controller';
import { PointService } from './service/point.service';
import { StampService } from './service/stamp.service';

@Module({
  controllers: [RewardController],
  providers: [PointService, StampService],
})
export class RewardModule {}
