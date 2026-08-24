import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class MatchAttemptResponseDto {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty({ description: 'WAITING_RESPONSE(상대 응답 대기) | REJECTED | PAYMENT_PENDING' })
    @Expose()
    status: string;

    @ApiProperty({ nullable: true, description: '둘 다 수락 시에만 값이 채워짐' })
    @Expose()
    paymentDeadlineAt: Date | null;
}