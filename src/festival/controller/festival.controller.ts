// 축제·공연·행사 API
//
// 저장하는 데이터가 없어 조회만 있다. TourAPI 행사 정보를 그대로 보여준다.
import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator';
import { FestivalService } from '../service/festival.service';
import { FestivalQueryDto } from '../dto/request/festival-query.dto';
import { FestivalListResponseDto } from '../dto/response/festival-response.dto';

@ApiTags('Festival')
@ApiBearerAuth()
@Controller('festivals')
export class FestivalController {
  constructor(private readonly festival: FestivalService) {}

  @Get()
  @ApiOperation({
    summary: '진행중인 축제·공연·행사 조회',
    description:
      '홈 하단에 뿌릴 전국 행사 목록. 오늘(KST) 진행 중인 것을 전부 준다. ' +
      '프로필 취미에 맞는 분류(전시회·공연 등)가 앞에 오고, 나머지는 최근에 시작한 순이다. ' +
      '포스터가 없는 행사는 뺀다. 포스터는 공공누리 제3유형이라 ' +
      '출처(한국관광공사)를 표시하고 이미지를 변형하지 않는다.',
  })
  @ApiOkResponse({ type: FestivalListResponseDto })
  listOngoing(
    @CurrentUser() userId: string,
    @Query() query: FestivalQueryDto,
  ): Promise<FestivalListResponseDto> {
    return this.festival.listOngoing(userId, query);
  }
}
