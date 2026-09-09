import { Body, Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { CurrentUser } from '../../auth/current-user.decorator';
import { NotificationService } from '../service/notification.service';
import {
    PushTokenDto,
    UpdateNotificationSettingDto,
} from '../dto/request/notification.dto';
import { NotificationSettingResponseDto } from '../dto/response/notification-response.dto';

@ApiTags('Notification')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
    constructor(
        private readonly notificationService: NotificationService,
    ) {}

    @Get('settings')
    @ApiOperation({ summary: '알림 설정 조회' })
    @ApiOkResponse({ type: NotificationSettingResponseDto })
    async getSetting(
        @CurrentUser() userId: string,
    ): Promise<NotificationSettingResponseDto> {
        const setting = await this.notificationService.getSetting(userId);

        return plainToInstance(
            NotificationSettingResponseDto,
            setting,
            {
                excludeExtraneousValues: true,
            },
        );
    }

    @Patch('settings')
    @ApiOperation({ summary: '알림 설정 변경' })
    @ApiOkResponse({ type: NotificationSettingResponseDto })
    async updateSetting(
        @CurrentUser() userId: string,
        @Body() dto: UpdateNotificationSettingDto,
    ): Promise<NotificationSettingResponseDto> {
        const setting = await this.notificationService.updateSetting(
            userId,
            dto.pushEnabled,
        );

        return plainToInstance(
            NotificationSettingResponseDto,
            setting,
            {
                excludeExtraneousValues: true,
            },
        );
    }

    @Post('tokens')
    @ApiOperation({
        summary: '푸시 토큰 등록',
        description:
            '브라우저에서 알림 권한을 허용하고 받은 FCM 토큰을 등록한다. ' +
            '기기마다 토큰이 다르므로 접속할 때마다 호출해도 된다. 같은 토큰이면 갱신만 한다.',
    })
    registerToken(
        @CurrentUser() userId: string,
        @Body() dto: PushTokenDto,
    ): Promise<{ success: boolean }> {
        return this.notificationService.registerToken(
            userId,
            dto.token,
        );
    }

    @Delete('tokens')
    @ApiOperation({
        summary: '푸시 토큰 삭제',
        description:
            '로그아웃할 때 해당 기기로 더 이상 알림이 가지 않도록 토큰을 삭제한다.',
    })
    removeToken(
        @CurrentUser() userId: string,
        @Body() dto: PushTokenDto,
    ): Promise<{ success: boolean }> {
        return this.notificationService.removeToken(
            userId,
            dto.token,
        );
    }
}