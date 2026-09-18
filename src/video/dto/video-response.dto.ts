import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {VideoStatus} from "../../generated/prisma/enums";


export class VideoResponseDto {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty({
        enum: VideoStatus,
        description:
            'PENDING(대기) | PROCESSING(제작 중) | COMPLETED(완료) | FAILED(실패)',
    })
    @Expose()
    status: VideoStatus;

    @ApiProperty({ nullable: true, description: '완료 전에는 null' })
    @Expose()
    videoUrl: string | null;

    @ApiProperty({ nullable: true })
    @Expose()
    thumbnailUrl: string | null;

    @ApiProperty({ nullable: true, description: '실패 시 사유' })
    @Expose()
    errorMessage: string | null;

    @ApiProperty({ nullable: true })
    @Expose()
    completedAt: Date | null;
}