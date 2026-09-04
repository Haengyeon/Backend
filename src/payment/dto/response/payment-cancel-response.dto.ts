import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class PaymentCancelResponseDto {
    @ApiProperty()
    @Expose()
    paymentId: string;

    @ApiProperty({ example: 'CANCELLED' })
    @Expose()
    status: string;
}