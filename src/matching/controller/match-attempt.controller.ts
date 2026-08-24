import {
    BadRequestException,
    Body,
    Controller,
    Headers,
    Param,
    Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { MatchAttemptService } from '../service/match-attempt.service';
import { MatchAttemptDto } from '../dto/request/match-attempt.dto';
import { MatchAttemptResponseDto } from '../dto/response/match-attempt-response.dto';

@ApiTags('Matching')
@Controller('match-attempts')
export class MatchAttemptController {
    constructor(private readonly matchAttemptService: MatchAttemptService) {}

    @Post(':matchAttemptId/respond')
    @ApiOperation({
        summary: '매칭 시도 수락/거절 응답',
    })
    @ApiParam({
        name: 'matchAttemptId',
    })
    @ApiHeader({
        name: 'x-test-user-id',
        description: '개발용 테스트 사용자 ID',
        required: true,
    })
    async respond(
        @Headers('x-test-user-id') userId: string,
        @Param('matchAttemptId') matchAttemptId: string,
        @Body() dto: MatchAttemptDto,
    ): Promise<MatchAttemptResponseDto> {
        if (!userId) {
            throw new BadRequestException('x-test-user-id 헤더가 필요합니다.');
        }

        const attempt = await this.matchAttemptService.respond(
            userId,
            matchAttemptId,
            dto,
        );

        return plainToInstance(MatchAttemptResponseDto, attempt, {
            excludeExtraneousValues: true,
        });
    }
}