// POST /safety/blocks, GET /safety/blocks 응답 형태
import { ApiProperty } from '@nestjs/swagger';
import { SafetyUserDto } from './safety-user.dto';

export class BlockResponseDto {
  @ApiProperty({ description: '차단 기록의 id. 코스나 신고와는 무관하다' })
  blockId: string;

  @ApiProperty({ type: SafetyUserDto })
  blockedUser: SafetyUserDto;

  @ApiProperty({ description: '차단일시' })
  createdAt: Date;
}

export class BlockListResponseDto {
  @ApiProperty({ type: [BlockResponseDto] })
  items: BlockResponseDto[];
}
