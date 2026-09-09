import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class NotificationSettingResponseDto {
    @ApiProperty({
        example: true,
        description: '푸시 알림 활성화 여부',
    })
    @Expose()
    pushEnabled: boolean;
}