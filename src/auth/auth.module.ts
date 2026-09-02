import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './controller/auth.controller';
import { AuthService } from './service/auth.service';
import { KakaoClient } from './service/kakao.client';

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, KakaoClient],
  exports: [JwtModule],
})
export class AuthModule {}