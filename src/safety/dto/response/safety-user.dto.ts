// 신고·차단 내역에서 대상을 보여주는 최소 정보.
//
// 내역 화면은 "누구를" 신고·차단했는지만 알면 되고, 차단한 상대의 프로필로
// 다시 들어갈 일은 없다. 그래서 프로필 전체가 아니라 이름과 사진만 준다.
import { ApiProperty } from '@nestjs/swagger';

export class SafetyUserDto {
  @ApiProperty()
  userId: string;

  @ApiProperty({
    example: '김행연',
    description: '프로필이 없는 계정이면 "알 수 없음"',
  })
  name: string;

  @ApiProperty({ description: '프로필이 없는 계정이면 빈 문자열' })
  profileImageUrl: string;
}
