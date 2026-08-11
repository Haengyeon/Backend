import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNotEmpty,
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

export class CreateProfileDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    name: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    nickname: string;

    @IsDateString()
    birthDate: string;

    @IsEnum(Gender)
    gender: Gender;

    @IsOptional()
    @IsEnum(Mbti)
    mbti?: Mbti;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    introduction: string;

    @IsEnum(JobCategory)
    jobCategory: JobCategory;

    @IsBoolean()
    jobPrivate: boolean;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(5)
    @IsEnum(Hobby, { each: true })
    hobbies: Hobby[];

    @IsUrl()
    profileImageUrl: string;

    @IsUrl()
    fullBodyImageUrl: string;
}