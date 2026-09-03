// 신고·차단 API.
//
// 두 기능을 한 컨트롤러에 둔 이유는 진입점과 선행조건이 같기 때문이다. 둘 다
// 채팅방이나 마이페이지에서 매칭 상대를 골라 시작하고,
// 둘 다 "실제 매칭되었던 상대인가"를 똑같이 검증한다
//
// 갈리는 지점은 그 다음이다.
//   신고 - 접수만 하고 운영자가 판단한다. 상대에게 즉시 일어나는 일은 없다.
//   차단 - 사용자가 판단하고 즉시 반영된다. 운영자를 거치지 않는다.
import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../auth/current-user.decorator';
import { ReportService } from '../service/report.service';
import { BlockService } from '../service/block.service';
import { CreateReportDto } from '../dto/request/create-report.dto';
import {
  ReportListResponseDto,
  ReportResponseDto,
} from '../dto/response/report-response.dto';
import { BlockListResponseDto } from '../dto/response/block-response.dto';

// 사용자 식별은 전역 JwtAuthGuard가 한다. @Public()을 안 붙였으므로 네 엔드포인트
// 모두 토큰이 필요하다. @CurrentUser()가 주는 값은 토큰 sub에 담긴 User.id다.
@ApiTags('Safety')
@ApiBearerAuth()
@Controller('safety')
export class SafetyController {
  constructor(
    private readonly report: ReportService,
    private readonly block: BlockService,
  ) {}

  @Post('reports')
  @ApiOperation({
    summary: '신고 접수',
    description:
      '매칭 상대를 신고한다. 대상 userId는 보내지 않는다 — matchAttemptId로 서버가 찾는다. ' +
      '접수되면 PENDING 상태로 쌓이고 운영자 검토를 기다린다. ' +
      '신고만으로 상대 계정이 정지되거나 매칭이 끊기지는 않는다(그건 차단이 한다). ' +
      '같은 매칭 건은 한 번만 신고할 수 있다 — 두 번째부터 409.',
  })
  @ApiCreatedResponse({ type: ReportResponseDto })
  @ApiForbiddenResponse({ description: '해당 매칭의 참여자가 아님' })
  @ApiNotFoundResponse({ description: '매칭 이력을 찾을 수 없음' })
  @ApiConflictResponse({ description: '이미 신고한 매칭' })
  createReport(
    @CurrentUser() userId: string,
    @Body() dto: CreateReportDto,
  ): Promise<ReportResponseDto> {
    return this.report.create(userId, dto);
  }

  @Get('reports')
  @ApiOperation({
    summary: '내 신고 내역 조회',
    description:
      '마이페이지의 신고 내역. 내가 접수한 것만 나오고, 내가 신고당한 건은 보이지 않는다. ' +
      'status로 운영자 검토가 어디까지 갔는지 알 수 있다.',
  })
  @ApiOkResponse({ type: ReportListResponseDto })
  getMyReports(@CurrentUser() userId: string): Promise<ReportListResponseDto> {
    return this.report.findMine(userId);
  }

  @Get('blocks')
  @ApiOperation({
    summary: '내 차단 목록 조회',
    description:
      '마이페이지의 차단 목록. 내가 차단한 사람만 나온다. ' +
      '나를 차단한 사람은 내려주지 않는다 — 차단당했다는 사실이 드러나면 안 된다.',
  })
  @ApiOkResponse({ type: BlockListResponseDto })
  getMyBlocks(@CurrentUser() userId: string): Promise<BlockListResponseDto> {
    return this.block.findMine(userId);
  }
}
