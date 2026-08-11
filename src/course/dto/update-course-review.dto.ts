import {
    IsNotEmpty,
    IsString,
    MaxLength,
} from 'class-validator';

export class UpdateCourseReviewDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    content: string;
}