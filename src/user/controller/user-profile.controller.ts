import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { CurrentUser } from '../../auth/current-user.decorator';
import { UserProfileService } from '../service/user-profile.service';
import { CreateUserProfileDto } from '../dto/request/create-user-profile.dto';
import { UpdateUserProfileDto } from '../dto/request/update-user-profile.dto';
import { UserProfileResponseDto } from '../dto/response/user-profile-response.dto';

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
    @ApiOperation({
        summary: '프로필 작성',
        description:
            '카카오 로그인 직후 1회만 호출한다. 이미 작성한 경우 409를 반환한다.',
    })
    @ApiCreatedResponse({ type: UserProfileResponseDto })
    async create(
        @CurrentUser() userId: string,
        @Body() dto: CreateUserProfileDto,
    ): Promise<UserProfileResponseDto> {
        const profile = await this.userProfileService.create(userId, dto);

        return plainToInstance(UserProfileResponseDto, profile, {
            excludeExtraneousValues: true,
        });
    }

    @Patch('me')
    @ApiOperation({
        summary: '내 프로필 수정',
        description:
            '이름·생년월일·성별은 수정할 수 없다. 요청에 포함해도 무시된다.',
    })
    @ApiOkResponse({ type: UserProfileResponseDto })
    async update(
        @CurrentUser() userId: string,
        @Body() dto: UpdateUserProfileDto,
    ): Promise<UserProfileResponseDto> {
        const profile = await this.userProfileService.update(userId, dto);

        return plainToInstance(UserProfileResponseDto, profile, {
            excludeExtraneousValues: true,
        });
    }
}