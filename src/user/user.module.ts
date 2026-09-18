import { Module } from '@nestjs/common';

import { UserController } from './controller/user.controller';
import { UserProfileController } from './controller/user-profile.controller';
import { UserService } from './service/user.service';
import { UserProfileService } from './service/user-profile.service';
import { UserProfileImageService } from './service/user-profile-image.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  // 프로필 사진을 Cloud Storage에 올리고 서명 URL로 내보내는 데 필요하다
  imports: [StorageModule],
  controllers: [UserController, UserProfileController],
  providers: [UserService, UserProfileService, UserProfileImageService],
})
export class UserModule {}