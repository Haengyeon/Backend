import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateUserProfileDto } from './create-user-profile.dto';

/**
 * 프로필 수정용 DTO.
 *
 * 이름·생년월일·성별은 수정할 수 없다.
 * 나이와 성별은 매칭 조건(나이 범위, 선호 성별)에 직접 쓰이고,
 * 이름은 실명제 정책상 임의 변경을 막아야 하기 때문이다.
 *
 * 사진은 파일로 따로 받는다. 보내지 않으면 기존 사진이 유지된다.
 */
export class UpdateUserProfileDto extends PartialType(
    OmitType(CreateUserProfileDto, ['name', 'birthDate', 'gender'] as const),
) {}