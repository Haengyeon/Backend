import {
    BadRequestException,
    Controller,
    Get,
    Headers,
} from '@nestjs/common';
import {
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { ChatRoomService } from '../service/chat-room.service';
import { ChatRoomResponseDto } from '../dto/response/chat-room-response.dto';

@ApiTags('Chat')
@Controller('chat-rooms')
export class ChatRoomController {
    constructor(private readonly chatRoomService: ChatRoomService) {}

    @Get('me')
    @ApiOperation({
        summary: '내 채팅방 조회 (상태 + 상대 프로필)',
    })
    @ApiOkResponse({ type: ChatRoomResponseDto })
    @ApiHeader({
        name: 'x-test-user-id',
        description: '개발용 테스트 사용자 ID',
        required: true,
    })
    async findMyActive(
        @Headers('x-test-user-id') userId: string,
    ): Promise<ChatRoomResponseDto> {
        if (!userId) {
            throw new BadRequestException('x-test-user-id 헤더가 필요합니다.');
        }

        const chatRoom = await this.chatRoomService.findMyActive(userId);

        return plainToInstance(ChatRoomResponseDto, chatRoom, {
            excludeExtraneousValues: true,
        });
    }
}