import {
    Controller,
    Get,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { ChatRoomService } from '../service/chat-room.service';
import { ChatRoomResponseDto } from '../dto/response/chat-room-response.dto';
import { CurrentUser } from '../../auth/current-user.decorator';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat-rooms')
export class ChatRoomController {
    constructor(private readonly chatRoomService: ChatRoomService) {}

    @Get('me')
    @ApiOperation({
        summary: '내 채팅방 조회 (상태 + 상대 프로필)',
    })
    @ApiOkResponse({ type: ChatRoomResponseDto })
    async findMyActive(
        @CurrentUser() userId: string,
    ): Promise<ChatRoomResponseDto> {
        const chatRoom = await this.chatRoomService.findMyActive(userId);

        return plainToInstance(ChatRoomResponseDto, chatRoom, {
            excludeExtraneousValues: true,
        });
    }
}