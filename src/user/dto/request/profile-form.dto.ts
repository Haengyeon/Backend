import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';

import { CreateUserProfileDto } from './create-user-profile.dto';
import { UpdateUserProfileDto } from './update-user-profile.dto';

/**
 * 파일 입력칸만 따로 선언한다.
 *
 * multipart는 @ApiProperty만으로 파일 칸이 그려지지 않아 format: 'binary'가 필요하다.
 * 타입을 any로 두는 건 NestJS 문서가 쓰는 방식이다 — 실제 값은 Multer가 따로 받으므로
 * 여기서는 문서에 칸을 만드는 역할만 한다.
 */
class ProfileImageFieldsDto {
    @ApiProperty({ type: 'string', format: 'binary', description: '프로필 사진' })
    profileImage: any;

    @ApiProperty({ type: 'string', format: 'binary', description: '전신 사진' })
    fullBodyImage: any;
}

class OptionalProfileImageFieldsDto {
    @ApiPropertyOptional({
        type: 'string',
        format: 'binary',
        description: '올리지 않으면 기존 사진이 유지된다',
    })
    profileImage?: any;

    @ApiPropertyOptional({
        type: 'string',
        format: 'binary',
        description: '올리지 않으면 기존 사진이 유지된다',
    })
    fullBodyImage?: any;
}

/*
 * Swagger 문서 전용 DTO.
 *
 * 검증에는 쓰지 않는다. 파일은 @UploadedFiles()로 들어오고,
 * 본문 검증은 원래 DTO가 그대로 담당한다.
 *
 * 상속 대신 IntersectionType을 쓰는 이유는, PartialType·OmitType으로 만든 클래스를
 * 다시 상속하면 메타데이터가 꼬여 문서가 렌더링되지 않기 때문이다.
 */
export class CreateUserProfileFormDto extends IntersectionType(
    CreateUserProfileDto,
    ProfileImageFieldsDto,
) {}

export class UpdateUserProfileFormDto extends IntersectionType(
    UpdateUserProfileDto,
    OptionalProfileImageFieldsDto,
) {}