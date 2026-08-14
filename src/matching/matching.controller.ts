import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateMatchingDto } from './dto/create-matching.dto';
import { MatchingService } from './matching.service';

@ApiTags('Matching')
@Controller('matchings')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post()
  @ApiOperation({
    summary: '매칭 조건 생성',
  })
  @ApiHeader({
    name: 'x-test-user-id',
    description: '개발용 테스트 사용자 ID',
    required: true,
  })
  create(
      @Headers('x-test-user-id') userId: string,
      @Body() createMatchingDto: CreateMatchingDto,
  ) {
    if (!userId) {
      throw new BadRequestException('x-test-user-id 헤더가 필요합니다.');
    }

    return this.matchingService.create(userId, createMatchingDto);
  }
}