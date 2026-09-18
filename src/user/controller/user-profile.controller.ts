import {
    Body,
    Controller,
    Get,
    Patch,
    Post,
    UploadedFiles,
    UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { CurrentUser } from '../../auth/current-user.decorator';
import { parseJsonBody } from '../../common/json-body.util';
import { UserProfileService } from '../service/user-profile.service';
import { ProfileImageFiles } from '../service/user-profile-image.service';
import {
    PROFILE_IMAGE_FIELDS,
    profileImageUploadOptions,
} from '../profile-image.config';
import { CreateUserProfileDto } from '../dto/request/create-user-profile.dto';
import { UpdateUserProfileDto } from '../dto/request/update-user-profile.dto';
import { UserProfileResponseDto } from '../dto/response/user-profile-response.dto';

/**
 * multipart 요청의 폼 구조.
 *
 * DTO 상속으로 스키마를 만들면(PartialType 등) 메타데이터가 꼬여 문서가 깨진다.
 * 파일이 섞인 요청은 몇 개 안 되므로 여기서 직접 적는다.
 */
const profileFormSchema = (required: string[]) => ({
    type: 'object',
    required,
    properties: {
        profile: {
            type: 'object',
            description: '프로필 정보를 JSON으로 담는다',
            example: {
                name: '김민준',
                birthDate: '1998-05-12',
                gender: 'MALE',
                mbti: 'ENFP',
                introduce: '맛집이랑 사진 찍는 걸 좋아해요.',
                jobCategory: 'IT_DEVELOPMENT',
                jobPrivate: false,
                hobbies: ['CAFE', 'FOOD', 'PHOTO'],
            },
        },
        profileImage: { type: 'string', format: 'binary' },
        fullBodyImage: { type: 'string', format: 'binary' },
    },
});

@ApiTags('User')
@ApiBearerAuth()
@Controller('profiles')
export class UserProfileController {
    constructor(private readonly userProfileService: UserProfileService) {}

    @Get('me')
    @ApiOperation({ summary: '내 프로필 조회' })
    @ApiOkResponse({ type: UserProfileResponseDto })
    async findMine(
        @CurrentUser() userId: string,
    ): Promise<UserProfileResponseDto> {
        const profile = await this.userProfileService.findMine(userId);

        return plainToInstance(UserProfileResponseDto, profile, {
            excludeExtraneousValues: true,
        });
    }

    @Post()
    @UseInterceptors(
        FileFieldsInterceptor(PROFILE_IMAGE_FIELDS, profileImageUploadOptions),
    )
    @ApiOperation({
        summary: '프로필 작성',
        description:
            '카카오 로그인 직후 1회만 호출한다. 이미 작성한 경우 409를 반환한다.\n\n' +
            'profile 필드에 프로필 정보를 JSON으로 넣고, 사진 두 장을 파일로 함께 올린다.\n' +
            '응답의 이미지 URL은 24시간짜리 서명 URL이라 저장하지 않는다.',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: profileFormSchema([
            'profile',
            'profileImage',
            'fullBodyImage',
        ]),
    })
    @ApiCreatedResponse({ type: UserProfileResponseDto })
    async create(
        @CurrentUser() userId: string,
        // 타입을 string으로 두어야 전역 ValidationPipe가 건드리지 않는다
        @Body('profile') profileJson: string,
        @UploadedFiles() files: ProfileImageFiles,
    ): Promise<UserProfileResponseDto> {
        const dto = await parseJsonBody(CreateUserProfileDto, profileJson);

        const profile = await this.userProfileService.create(
            userId,
            dto,
            files ?? {},
        );

        return plainToInstance(UserProfileResponseDto, profile, {
            excludeExtraneousValues: true,
        });
    }

    @Patch('me')
    @UseInterceptors(
        FileFieldsInterceptor(PROFILE_IMAGE_FIELDS, profileImageUploadOptions),
    )
    @ApiOperation({
        summary: '내 프로필 수정',
        description:
            '이름·생년월일·성별은 수정할 수 없다. 요청에 포함해도 무시된다.\n\n' +
            '사진만 바꾸려면 profile 없이 파일만 올려도 되고, ' +
            '정보만 바꾸려면 파일 없이 profile만 보내도 된다.',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: profileFormSchema([]) })
    @ApiOkResponse({ type: UserProfileResponseDto })
    async update(
        @CurrentUser() userId: string,
        @Body('profile') profileJson: string,
        @UploadedFiles() files: ProfileImageFiles,
    ): Promise<UserProfileResponseDto> {
        const dto = await parseJsonBody(UpdateUserProfileDto, profileJson, {
            optional: true,
        });

        const profile = await this.userProfileService.update(
            userId,
            dto,
            files ?? {},
        );

        return plainToInstance(UserProfileResponseDto, profile, {
            excludeExtraneousValues: true,
        });
    }
}