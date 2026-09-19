import {ApiProperty} from "@nestjs/swagger";
import {Expose, Type} from "class-transformer";

/** 홈 화면 배지에 쓰는 상대 정보. 상세 화면은 GET /match-attempts/:id를 따로 부른다. */
export class CurrentAttemptPartnerDto {
    @ApiProperty({ example: '짱정운' })
    @Expose()
    name: string;

    @ApiProperty({ description: '서명 URL. 만료되므로 저장하지 않는다' })
    @Expose()
    profileImageUrl: string;
}

export class CurrentMatchAttemptDto {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty({ description: 'WAITING_RESPONSE | PAYMENT_PENDING' })
    @Expose()
    status: string;

    @ApiProperty()
    @Expose()
    respondDeadlineAt: Date;

    @ApiProperty({nullable: true})
    @Expose()
    paymentDeadlineAt: Date | null;

    @ApiProperty({ type: CurrentAttemptPartnerDto })
    @Expose()
    @Type(() => CurrentAttemptPartnerDto)
    partner: CurrentAttemptPartnerDto;
}