import { Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { CurrentUser } from '../../auth/current-user.decorator';
import {VideoService} from "../service/video.service";
import {VideoResponseDto} from "../dto/video-response.dto";

@ApiTags('Course')
@ApiBearerAuth()
@Controller('courses/:courseId/video')
export class VideoController {
    constructor(private readonly videoService: VideoService) {}

    @Get()
    @ApiOperation({ summary: '추억영상 제작 상태 조회' })
    @ApiOkResponse({ type: VideoResponseDto })
    @ApiParam({ name: 'courseId' })
    async findOne(
        @CurrentUser() userId: string,
        @Param('courseId') courseId: string,
    ): Promise<VideoResponseDto> {
        const video = await this.videoService.findOne(userId, courseId);

        return plainToInstance(VideoResponseDto, video, {
            excludeExtraneousValues: true,
        });
    }
}