import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class PaymentApproveResponseDto {
    @ApiProperty()
    @Expose()
    paymentId: string;

    @ApiProperty({ example: 'APPROVED' })
    @Expose()
    status: string;

    @ApiProperty()
    @Expose()
    matchAttemptId: string;

    @ApiProperty({
        description: '양쪽 모두 결제를 마쳐 매칭이 확정됐는지 여부',
    })
    @Expose()
    matchConfirmed: boolean;
}