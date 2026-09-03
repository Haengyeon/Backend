// 신고·차단 내역에 붙는 대상 유저 정보.
// 두 서비스가 같은 모양으로 내보내야 해서 조회 select와 변환을 함께 둔다.
import { SafetyUserDto } from './dto/response/safety-user.dto';

export const SAFETY_USER_SELECT = {
  id: true,
  profile: { select: { name: true, profileImageUrl: true } },
} as const;

export function toSafetyUser(user: {
  id: string;
  profile: { name: string; profileImageUrl: string } | null;
}): SafetyUserDto {
  // 프로필은 매칭 조건을 만들 때 이미 검증되지만, 탈퇴 등으로 관계가 끊긴 경우를 대비한 기본값
  return {
    userId: user.id,
    name: user.profile?.name ?? '알 수 없음',
    profileImageUrl: user.profile?.profileImageUrl ?? '',
  };
}
