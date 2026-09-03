import { Module } from '@nestjs/common';

import { SafetyController } from './controller/safety.controller';
import { ReportService } from './service/report.service';
import { BlockService } from './service/block.service';

// BlockService를 내보내고 MatchingModule이 주입받는다. 반대 방향으로 걸면
// (SafetyModule이 매칭 쪽을 가져다 쓰면) 순환 참조가 된다.
@Module({
  controllers: [SafetyController],
  providers: [ReportService, BlockService],
  exports: [BlockService],
})
export class SafetyModule {}
