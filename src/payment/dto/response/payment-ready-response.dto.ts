import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class PaymentReadyResponseDto {
    @ApiProperty({ description: '승인 요청 시 다시 넘겨야 하는 값' })
    @Expose()
    paymentId: string;

    @ApiProperty()
    @Expose()
    tid: string;

    @ApiProperty({ description: 'PC 웹에서 띄울 결제창 URL' })
    @Expose()
    nextRedirectPcUrl: string;

    @ApiProperty({ description: '모바일 웹에서 띄울 결제창 URL' })
    @Expose()
    nextRedirectMobileUrl: string;

    @ApiProperty({ description: '모바일 앱에서 띄울 결제창 URL' })
    @Expose()
    nextRedirectAppUrl: string;
}