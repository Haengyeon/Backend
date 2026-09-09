import { Global, Module } from '@nestjs/common';

import { NotificationController } from './controller/notification.controller';
import { NotificationService } from './service/notification.service';
import { FcmClient } from './service/fcm.client';

// 매칭·결제·채팅 등 여러 도메인에서 알림을 보내야 해서 전역으로 둠.
@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationService, FcmClient],
  exports: [NotificationService],
})
export class NotificationModule {}