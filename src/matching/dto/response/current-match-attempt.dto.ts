import {ApiProperty} from "@nestjs/swagger";
import {Expose} from "class-transformer";

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

}