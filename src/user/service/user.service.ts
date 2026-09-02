import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { UserStatus } from '../../generated/prisma/enums';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 회원 탈퇴.
   * 레코드를 지우지 않고 상태만 바꾼다. 매칭·결제·후기 등이 참조하고 있어
   * 물리 삭제하면 지난 기록이 함께 깨지기 때문
   * 리프레시 토큰도 함께 무효화해 재로그인을 막음
   */
  async withdraw(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          status: UserStatus.WITHDRAWN,
          deletedAt: new Date(),
        },
      });

      await tx.auth.update({
        where: { userId },
        data: { refreshTokenHash: null },
      });
    });
  }
}