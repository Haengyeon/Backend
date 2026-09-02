import { Module } from '@nestjs/common';

import { UserController } from './controller/user.controller';
import { UserProfileController } from './controller/user-profile.controller';
import { UserService } from './service/user.service';
import { UserProfileService } from './service/user-profile.service';

@Module({
  controllers: [UserController, UserProfileController],
  providers: [UserService, UserProfileService],
})
export class UserModule {}