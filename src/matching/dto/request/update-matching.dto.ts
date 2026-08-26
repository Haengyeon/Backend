import { PartialType } from '@nestjs/swagger';

import { CreateMatchingDto } from './create-matching.dto';

/**
 * 조건 수정용 DTO.
 * PartialType이 CreateMatchingDto의 모든 필드를 optional로 만들면서
 * 검증 데코레이터(@Min(20), @ArrayMaxSize(3) 등)는 그대로 상속함.
 * 즉, 보낸 필드만 검증되고 안 보낸 필드는 기존 값이 유지됨.
 */
export class UpdateMatchingDto extends PartialType(CreateMatchingDto) {}