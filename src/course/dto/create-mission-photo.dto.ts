import {
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
} from 'class-validator';

export class CreateMissionPhotoDto {
    @IsUrl()
    @IsNotEmpty()
    imageUrl: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    comment?: string;
}