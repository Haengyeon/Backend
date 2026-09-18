// 추천 관광지 소개글을 새벽에 미리 받아 둔다.
//
// 소개글(detailCommon2)은 장소마다 한 번씩 불러야 해서, 낮에 사용자가 홈을 열 때마다
// 처음 보는 장소만큼 호출이 나간다. 개발계정 한도가 엔드포인트별 하루 1,000건이라
// 사용자가 조금만 늘어도 닿는다.
//
// 미리 받아 두면 두 가지가 좋아진다. 낮의 호출이 대부분 0이 되고, 호출 시점과 양이
// 트래픽이 아니라 우리가 정한 값이 된다 — 한도를 예측할 수 있게 된다.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CourseRecommendService } from './course-recommend.service';

/**
 * 하루에 미리 받아 둘 장소 수.
 *
 * 한도(1,000)를 다 쓰면 낮에 쓸 몫이 없다. 5분의 1만 쓴다. 한 번에 다 못 채워도
 * 날마다 다음 장소로 넘어가므로 며칠이면 자주 나오는 곳은 다 덮인다.
 *
 * 운영계정으로 올라가면 이 값을 키워 더 빨리 채울 수 있다.
 */
const DAILY_WARM_BUDGET = Number(process.env.TOUR_API_WARM_BUDGET ?? 200);

@Injectable()
export class CourseRecommendScheduler {
  private readonly logger = new Logger(CourseRecommendScheduler.name);

  constructor(private readonly recommend: CourseRecommendService) {}

  /**
   * 새벽 4시. 사용자가 가장 적은 시간대라, 여기서 한도를 써도 낮에 영향이 없다.
   *
   * 실패해도 재시도하지 않는다. 조회 경로가 알아서 받으므로 화면이 비지 않고,
   * 실패한 김에 더 부르면 한도만 더 쓴다.
   */
  @Cron('0 4 * * *', { timeZone: 'Asia/Seoul' })
  async warmDescriptions() {
    try {
      const filled = await this.recommend.warmDescriptions(DAILY_WARM_BUDGET);

      if (filled > 0) {
        this.logger.log(`소개글 ${filled}곳을 미리 받아 두었습니다`);
      } else {
        this.logger.log(
          '미리 받을 소개글이 없습니다 — 이미 다 채워져 있습니다',
        );
      }
    } catch (error) {
      this.logger.warn(
        `소개글 예열에 실패했습니다 — 조회 때 받게 됩니다: ${error}`,
      );
    }
  }
}
