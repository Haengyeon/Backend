import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum, IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
} from 'class-validator';

import {
    Gender,
    Hobby,
    JobCategory,
    Mbti,
} from '../../generated/prisma/enums';

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    @MaxLength(20)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    nickname?: string;

    @IsOptional()
    @IsDateString()
    birthDate?: string;

    @IsOptional()
    @IsEnum(Gender)
    gender?: Gender;

    @IsOptional()
    @IsEnum(Mbti)
    mbti?: Mbti;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    introduction: string;

    @IsOptional()
    @IsEnum(JobCategory)
    jobCategory?: JobCategory;

    @IsOptional()
    @IsBoolean()
    jobPrivate?: boolean;

    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(5)
    @IsEnum(Hobby, { each: true })
    hobbies?: Hobby[];

    @IsOptional()
    @IsUrl()
    profileImageUrl?: string;

    @IsOptional()
    @IsUrl()
    fullBodyImageUrl?: string;
}