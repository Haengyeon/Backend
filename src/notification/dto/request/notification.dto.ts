import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, MinLength } from 'class-validator';

export class UpdateNotificationSettingDto {
    @ApiProperty({
        example: true,
        description:
            '푸시 알림 활성화 여부. false이면 모든 푸시 알림을 발송하지 않는다.',
    })
    @IsBoolean()
    pushEnabled: boolean;
}

export class PushTokenDto {
    @ApiProperty({
        description: '브라우저에서 발급받은 FCM 등록 토큰',
    })
    @IsString()
    @MinLength(1)
    token: string;
}