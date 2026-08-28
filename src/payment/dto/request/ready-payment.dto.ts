import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ReadyPaymentDto {
    @ApiProperty({
        description: '결제할 MatchAttempt(매칭 시도) ID',
    })
    @IsString()
    matchAttemptId: string;
}