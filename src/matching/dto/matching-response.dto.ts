import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

import {
    CourseTheme,
    MatchingStatus,
    PreferredGender,
    Region,
} from '../../generated/prisma/enums';

export class MatchingResponseDto {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty({ enum: Region })
    @Expose()
    region: Region;

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
}