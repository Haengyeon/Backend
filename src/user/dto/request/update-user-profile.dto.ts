import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateUserProfileDto } from './create-user-profile.dto';

/**
 * 프로필 수정용 DTO.
 * 이름·생년월일·성별은 수정할 수 없음.
 * ValidationPipe의 whitelist 옵션이 켜져 있어 해당 필드가 들어와도 무시됨.
 */
export class UpdateUserProfileDto extends PartialType(
    OmitType(CreateUserProfileDto, ['name', 'birthDate', 'gender'] as const),
) {}