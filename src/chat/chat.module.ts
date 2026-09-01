import { Module } from '@nestjs/common';

import { ChatRoomController } from './controller/chat-room.controller';
import { ChatMessageController } from './controller/chat-message.controller';
import { ChatRoomService } from './service/chat-room.service';
import { ChatMessageService } from './service/chat-message.service';
import { ChatRoomScheduler } from './service/chat-room.scheduler';

@Module({
  controllers: [ChatRoomController, ChatMessageController],
  providers: [ChatRoomService, ChatMessageService, ChatRoomScheduler],
  exports: [ChatRoomService],
})
export class ChatModule {}