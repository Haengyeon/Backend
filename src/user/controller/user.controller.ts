import { Controller, Delete, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../../auth/current-user.decorator';
import { REFRESH_COOKIE_NAME } from '../../auth/service/auth.service';
import { UserService } from '../service/user.service';

@ApiTags('User')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Delete('me')
  @ApiOperation({
    summary: '회원 탈퇴',
    description:
        '계정을 탈퇴 상태로 바꾸고 리프레시 토큰을 무효화한다. ' +
        '지난 매칭·결제 기록이 참조하고 있어 레코드를 물리 삭제하지는 않는다.',
  })
  async withdraw(
      @CurrentUser() userId: string,
      @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    await this.userService.withdraw(userId);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });

    return { success: true };
  }
}