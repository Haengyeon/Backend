// 행사 목록을 자정 직후에 미리 받아 둔다.
//
// 목록은 "오늘 진행 중"이라 날짜가 바뀌면 통째로 새로 받아야 한다. 그때까지
// 기다렸다가 첫 사용자가 오면 그 사람이 TourAPI 응답을 대신 기다리게 된다.
//
// 더 중요한 건 호출 수다. 미리 받아 두면 searchFestival2가 트래픽과 무관하게
// 하루 한 번으로 고정된다. 개발계정 한도가 엔드포인트별 1,000건이라 이게 크다.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FestivalService } from './festival.service';

@Injectable()
export class FestivalScheduler {
  private readonly logger = new Logger(FestivalScheduler.name);

  constructor(private readonly festivals: FestivalService) {}

  /**
   * 자정 직후. 0시 정각이 아니라 5분을 두는 이유는 TourAPI 쪽 날짜가 넘어가는 데
   * 시차가 있을 수 있어서다. 실패해도 조회 경로가 알아서 받으므로 재시도하지 않는다.
   */
  @Cron('5 0 * * *', { timeZone: 'Asia/Seoul' })
  async warmUp() {
    try {
      const count = await this.festivals.refresh();
      this.logger.log(`행사 목록 ${count}건을 미리 받아 두었습니다`);
    } catch (error) {
      this.logger.warn(
        `행사 목록 예열에 실패했습니다 — 첫 조회 때 받게 됩니다: ${error}`,
      );
    }
  }
}
