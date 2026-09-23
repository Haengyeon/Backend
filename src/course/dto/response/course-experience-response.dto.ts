import { ApiProperty } from '@nestjs/swagger';

export class ExperienceSampleVideoDto {
    @ApiProperty({ description: '샘플 추억영상. 24시간짜리 서명 URL' })
    videoUrl: string;

    @ApiProperty()
    thumbnailUrl: string;
}

export class CourseExperienceFinishResponseDto {
    @ApiProperty()
    courseId: string;

    @ApiProperty({ example: 'COMPLETED' })
    status: string;

    @ApiProperty({
        type: ExperienceSampleVideoDto,
        description: '체험에서 올린 사진이 아니라 미리 만든 샘플 영상이다',
    })
    sampleVideo: ExperienceSampleVideoDto;
}
