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
import { ChatRoomListResponseDto } from '../dto/response/chat-room-list-response.dto';
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

    @Get()
    @ApiOperation({
        summary: '내 채팅방 목록 조회',
        description:
            '종료·차단된 방까지 최신순으로 모두 돌려줌 ' +
            '목록에는 상대 이름과 사진만 담김',
    })
    @ApiOkResponse({ type: ChatRoomListResponseDto })
    async findMine(
        @CurrentUser() userId: string,
    ): Promise<ChatRoomListResponseDto> {
        const result = await this.chatRoomService.findMine(userId);

        return plainToInstance(ChatRoomListResponseDto, result, {
            excludeExtraneousValues: true,
        });
    }
}