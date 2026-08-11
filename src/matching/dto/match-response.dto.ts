import { IsEnum } from 'class-validator';
import { MatchDecision } from '../../generated/prisma/enums';

export class MatchResponseDto {
    @IsEnum(MatchDecision)
    decision: MatchDecision;
}