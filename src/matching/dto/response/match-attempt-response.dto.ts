import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class MatchAttemptResponseDto {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty({
        description:
            'WAITING_RESPONSE(상대 응답 대기) | REJECTED | PAYMENT_PENDING | CANCELLED. ' +
            'CANCELLED는 둘 다 수락했지만 그 지역·테마로 코스를 만들 수 없어 결제로 넘기지 못한 경우다. ' +
            '양쪽 다 거절 횟수 없이 재탐색으로 돌아가므로, 화면은 "상대를 다시 찾는 중"으로 두면 된다',
    })
    @Expose()
    status: string;

    @ApiProperty({ nullable: true, description: '둘 다 수락 시에만 값이 채워짐' })
    @Expose()
    paymentDeadlineAt: Date | null;
}