import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';

import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { plainToInstance } from 'class-transformer';

import { CreateMatchingDto } from './dto/create-matching.dto';
import { MatchingResponseDto } from './dto/matching-response.dto';
import { MatchingService } from './service/matching.service';

@ApiTags('Matching')
@Controller('matchings')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

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
}