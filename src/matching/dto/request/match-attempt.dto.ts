import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { MatchDecision } from '../../../generated/prisma/enums';

export class MatchAttemptDto {
    @ApiProperty({
        enum: MatchDecision,
        example: MatchDecision.ACCEPTED,
    })
    @IsEnum(MatchDecision)
    decision: MatchDecision;
}