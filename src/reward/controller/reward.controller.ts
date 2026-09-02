// 리워드 API — 포인트와 스탬프 조회
//
// 적립하는 엔드포인트는 없다. 포인트도 스탬프도 코스를 완료할 때 서버가 자동으로
// 주기 때문에(여행 다음 날 시계가 코스를 닫으면서 두 사람에게 지급) 클라이언트는
// GET으로 읽기만 한다. 사용자가 누르는 "받기" 버튼을 두면 먼저 누른 쪽만 받게 된다.
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator';
import { PointService } from '../service/point.service';
import { StampService } from '../service/stamp.service';
import { PointHistoryQueryDto } from '../dto/request/point-history-query.dto';
import {
  PointHistoryResponseDto,
  PointResponseDto,
} from '../dto/response/point-response.dto';
import { StampCollectionResponseDto } from '../dto/response/stamp-response.dto';

// 사용자 식별은 전역 JwtAuthGuard가 한다. @Public()을 안 붙였으므로 세 엔드포인트
// 모두 토큰이 필요하고, 없거나 위조면 여기 닿기 전에 401로 끊긴다.
// @CurrentUser()가 주는 값은 토큰 sub에 담긴 User.id다(카카오 id가 아니다).
@ApiTags('Reward')
@ApiBearerAuth()
@Controller('rewards')
export class RewardController {
  constructor(
    private readonly point: PointService,
    private readonly stamp: StampService,
  ) {}

  @Get('points')
  @ApiOperation({
    summary: '포인트 조회',
    description:
      '마이페이지에 띄우는 포인트. 아직 코스를 끝낸 적 없으면 0이다. ' +
      '포인트 사용은 아직 열지 않아서 지금은 적립 합계와 같다.',
  })
  getPoints(@CurrentUser() userId: string): Promise<PointResponseDto> {
    return this.point.getPoints(userId);
  }

  @Get('points/history')
  @ApiOperation({
    summary: '포인트 내역 조회',
    description:
      '적립일시 · 사유 · 적립 후 잔액을 최근 순으로. 커서 페이징. ' +
      '사유(reason)에는 코스 이름이 들어가서 어떤 여행으로 받았는지 바로 보인다. ' +
      '지금은 적립(EARN)만 쌓이지만, 사용·소멸이 열리면 같은 목록에 섞여 나온다.',
  })
  getPointHistory(
    @CurrentUser() userId: string,
    @Query() query: PointHistoryQueryDto,
  ): Promise<PointHistoryResponseDto> {
    return this.point.getHistory(userId, query.limit, query.cursor);
  }

  @Get('stamps')
  @ApiOperation({
    summary: '수집 스탬프 조회',
    description:
      '모은 스탬프 전부. 기록 탭 수집 지도는 stamps[].mapSigunguCode를 모아 칠하고, ' +
      '마이페이지는 collectedCount를 쓴다. ' +
      '스탬프는 시군구 단위라 한 코스로 여러 개가 나올 수 있고, 같은 구는 한 번만 찍힌다. ' +
      '페이징하지 않는다 — 상한이 지도 칸 수(250)고 지도는 전부를 한 번에 칠해야 한다.',
  })
  getStamps(
    @CurrentUser() userId: string,
  ): Promise<StampCollectionResponseDto> {
    return this.stamp.getCollection(userId);
  }

  // 코스별 적립액 조회(GET /rewards/points/:courseId)는 두지 않는다.
  //   받은 직후 — POST /courses/:courseId/completions 응답에 earnedPoints로 들어 있다
  //   나중에   — GET /rewards/points/history의 courseId로 찾을 수 있다
  // 같은 데이터를 세 곳에서 내보내면 필드 하나 늘 때마다 세 군데를 고쳐야 한다.
}
