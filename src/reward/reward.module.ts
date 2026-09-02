import { Module } from '@nestjs/common';
import { RewardController } from './controller/reward.controller';
import { PointService } from './service/point.service';
import { StampService } from './service/stamp.service';

// 리워드 도메인 — 포인트와 스탬프 조회
//   controller/  API 진입점
//   service/     포인트 · 스탬프
//
// 읽기만 하는 모듈이다. 지급은 코스 완료 시점에 CourseRewardService가
// 트랜잭션 안에서 하고, 여기서는 그렇게 쌓인 것을 읽는다.
//
// CourseModule을 import하지 않는다. 코스 쪽에서 쓰는 것은 지역 이름표와
// 시군구 대응표뿐인데 둘 다 순수 상수·함수라 주입이 필요 없다.
//
// 지급 로직을 이리로 옮기지 않은 이유:
//   부르는 곳이 CourseCompletionService 하나뿐이라 옮기면 CourseModule이
//   RewardModule에 기대는 의존이 새로 생긴다. 출석·친구초대처럼 코스 밖에서
//   포인트를 주는 두 번째 호출자가 생기면 그때 옮기는 게 맞다.
@Module({
  controllers: [RewardController],
  providers: [PointService, StampService],
})
export class RewardModule {}
