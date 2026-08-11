import {
    IsNotEmpty,
    IsString,
    MaxLength,
} from 'class-validator';

export class CreateCourseReviewDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    content: string;
}
