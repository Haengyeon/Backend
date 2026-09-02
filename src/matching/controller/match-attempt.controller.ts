import {
    Body,
    Controller, Get,
    Param,
    Post,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { MatchAttemptService } from '../service/match-attempt.service';
import { MatchAttemptDto } from '../dto/request/match-attempt.dto';
import { MatchAttemptResponseDto } from '../dto/response/match-attempt-response.dto';
import {MatchAttemptDetailResponseDto} from "../dto/response/match-attempt-detail-response.dto";
import { CurrentUser } from '../../auth/current-user.decorator';

@ApiTags('Matching')
@ApiBearerAuth()
@Controller('match-attempts')
export class MatchAttemptController {
    constructor(private readonly matchAttemptService: MatchAttemptService) {}

    @Get(':matchAttemptId')
    @ApiOperation({
        summary: '매칭 상대 프로필 조회',
    })
    @ApiOkResponse({ type: MatchAttemptDetailResponseDto })
    @ApiParam({
        name: 'matchAttemptId',
    })
    async findOne(
        @CurrentUser() userId: string,
        @Param('matchAttemptId') matchAttemptId: string,
    ): Promise<MatchAttemptDetailResponseDto> {
        const detail = await this.matchAttemptService.findOne(
            userId,
            matchAttemptId,
        );

        return plainToInstance(MatchAttemptDetailResponseDto, detail, {
            excludeExtraneousValues: true,
        });
    }

    @Post(':matchAttemptId/respond')
    @ApiOperation({
        summary: '매칭 시도 수락/거절 응답',
    })
    @ApiParam({
        name: 'matchAttemptId',
    })
    async respond(
        @CurrentUser() userId: string,
        @Param('matchAttemptId') matchAttemptId: string,
        @Body() dto: MatchAttemptDto,
    ): Promise<MatchAttemptResponseDto> {
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