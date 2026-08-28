import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ApprovePaymentDto {
    @ApiProperty({
        description: '결제 준비 시 발급된 Payment ID',
    })
    @IsString()
    paymentId: string;

    @ApiProperty({
        description: '카카오가 approval_url로 redirect하며 전달한 pg_token',
    })
    @IsString()
    pgToken: string;
}