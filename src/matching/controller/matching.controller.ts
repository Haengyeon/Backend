import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ApiCreatedResponse,
  ApiHeader,
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

@ApiTags('Matching')
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
  @ApiHeader({
    name: 'x-test-user-id',
    description: '개발용 테스트 사용자 ID',
    required: true,
  })
  async findMyActive(
      @Headers('x-test-user-id') userId: string,
  ): Promise<MatchingResponseDto> {
    if (!userId) {
      throw new BadRequestException(
          'x-test-user-id 헤더가 필요합니다.',
      );
    }

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
  @ApiHeader({
    name: 'x-test-user-id',
    description: '개발용 테스트 사용자 ID',
    required: true,
  })
  async create(
      @Headers('x-test-user-id') userId: string,
      @Body() createMatchingDto: CreateMatchingDto,
  ): Promise<MatchingResponseDto> {
    if (!userId) {
      throw new BadRequestException(
          'x-test-user-id 헤더가 필요합니다.',
      );
    }

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
  @ApiHeader({
    name: 'x-test-user-id',
    description: '개발용 테스트 사용자 ID',
    required: true,
  })
  async update(
      @Headers('x-test-user-id') userId: string,
      @Param('matchingId') matchingId: string,
      @Body() updateMatchingDto: UpdateMatchingDto,
  ): Promise<MatchingResponseDto> {
    if (!userId) {
      throw new BadRequestException(
          'x-test-user-id 헤더가 필요합니다.',
      );
    }

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
  @ApiHeader({
    name: 'x-test-user-id',
    description: '개발용 테스트 사용자 ID',
    required: true,
  })
  async retry(
      @Headers('x-test-user-id') userId: string,
      @Param('matchingId') matchingId: string,
  ): Promise<MatchingResponseDto> {
    if (!userId) {
      throw new BadRequestException(
          'x-test-user-id 헤더가 필요합니다.',
      );
    }

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