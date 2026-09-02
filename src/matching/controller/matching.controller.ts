import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { plainToInstance } from 'class-transformer';

import { CreateMatchingDto } from '../dto/request/create-matching.dto';
import { UpdateMatchingDto } from '../dto/request/update-matching.dto';
import { MatchingResponseDto } from '../dto/response/matching-response.dto';
import { MatchingService } from '../service/matching.service';
import { CurrentUser } from '../../auth/current-user.decorator';

@ApiTags('Matching')
@ApiBearerAuth()
@Controller('matchings')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  // ** 'me'는 고정 경로라 나중에 GET ':matchingId' 같은 라우트가 생기면
  // 반드시 그것보다 위에 선언되어 있어야 함! (안 그러면 'me'가 :matchingId로 매칭돼버림)
  @Get('me')
  @ApiOperation({
    summary: '내 현재 매칭 상태 조회 (폴링용, attemptId 확인용)',
  })
  @ApiOkResponse({
    type: MatchingResponseDto,
  })
  async findMyActive(
      @CurrentUser() userId: string,
  ): Promise<MatchingResponseDto> {
    const matching = await this.matchingService.findMyActive(userId);

    return plainToInstance(
        MatchingResponseDto,
        matching,
        {
          excludeExtraneousValues: true,
        },
    );
  }

  @Post()
  @ApiOperation({
    summary: '매칭 조건 생성',
  })
  @ApiCreatedResponse({
    type: MatchingResponseDto,
  })
  async create(
      @CurrentUser() userId: string,
      @Body() createMatchingDto: CreateMatchingDto,
  ): Promise<MatchingResponseDto> {
    const matching = await this.matchingService.create(
        userId,
        createMatchingDto,
    );

    return plainToInstance(
        MatchingResponseDto,
        matching,
        {
          excludeExtraneousValues: true,
        },
    );
  }

  @Patch(':matchingId')
  @ApiOperation({
    summary: '거절 후 매칭 조건 수정 ([조건 수정] 버튼)',
  })
  @ApiOkResponse({
    type: MatchingResponseDto,
  })
  @ApiParam({
    name: 'matchingId',
    description: 'Matching ID — MatchAttempt.id나 userId가 아님',
  })
  async update(
      @CurrentUser() userId: string,
      @Param('matchingId') matchingId: string,
      @Body() updateMatchingDto: UpdateMatchingDto,
  ): Promise<MatchingResponseDto> {
    const matching = await this.matchingService.update(
        userId,
        matchingId,
        updateMatchingDto,
    );

    return plainToInstance(
        MatchingResponseDto,
        matching,
        {
          excludeExtraneousValues: true,
        },
    );
  }

  @Post(':matchingId/retry')
  @ApiOperation({
    summary: '거절 후 조건 그대로 재탐색 ([이대로 재탐색] 버튼)',
  })
  @ApiOkResponse({
    type: MatchingResponseDto,
  })
  @ApiParam({
    name: 'matchingId',
    description: 'Matching ID — MatchAttempt.id나 userId가 아님',
  })
  async retry(
      @CurrentUser() userId: string,
      @Param('matchingId') matchingId: string,
  ): Promise<MatchingResponseDto> {
    const matching = await this.matchingService.retry(userId, matchingId);

    return plainToInstance(
        MatchingResponseDto,
        matching,
        {
          excludeExtraneousValues: true,
        },
    );
  }
}