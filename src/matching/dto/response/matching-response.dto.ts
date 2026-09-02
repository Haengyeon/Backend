import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';

import {
    CourseTheme,
    MatchingStatus,
    PreferredGender,
    Region,
} from '../../../generated/prisma/enums';
import { CurrentMatchAttemptDto } from './current-match-attempt.dto';

export class MatchingResponseDto {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty({ enum: Region, isArray: true })
    @Expose()
    regions: Region[];

    @ApiProperty({ example: 20 })
    @Expose()
    ageMin: number;

    @ApiProperty({ example: 30 })
    @Expose()
    ageMax: number;

    @ApiProperty({ enum: PreferredGender })
    @Expose()
    preferredGender: PreferredGender;

    @ApiProperty({
        enum: CourseTheme,
        isArray: true,
    })
    @Expose()
    themes: CourseTheme[];

    @ApiProperty({
        type: [String],
        example: ['2026-08-20', '2026-08-23'],
    })
    @Expose()
    @Transform(({ value }) =>
        value.map(({ date }: { date: Date }) =>
            date.toISOString().slice(0, 10),
        ),
    )
    availableDates: string[];

    @ApiProperty({ enum: MatchingStatus })
    @Expose()
    status: MatchingStatus;

    @ApiProperty()
    @Expose()
    createdAt: Date;

    // 상대와 매칭되어 응답 대기중이거나 결제 대기중일 때만 채워짐. 없으면 아직 탐색 중.
    @ApiProperty({ type: CurrentMatchAttemptDto, nullable: true })
    @Expose()
    @Type(() => CurrentMatchAttemptDto)
    currentAttempt: CurrentMatchAttemptDto | null;
}