import {
    Body,
    Controller,
    DefaultValuePipe,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { ChatMessageService } from '../service/chat-message.service';
import { CreateChatMessageDto } from '../dto/request/chat-message.dto';
import {
    ChatMessageListResponseDto,
    ChatMessageResponseDto,
} from '../dto/response/chat-message-response.dto';
import { CurrentUser } from '../../auth/current-user.decorator';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat-rooms/:chatRoomId/messages')
export class ChatMessageController {
    constructor(private readonly chatMessageService: ChatMessageService) {}

    @Post()
    @ApiOperation({ summary: '메시지 전송 (1인 30회, 300자 제한)' })
    @ApiCreatedResponse({ type: ChatMessageResponseDto })
    @ApiParam({ name: 'chatRoomId' })
    async send(
        @CurrentUser() userId: string,
        @Param('chatRoomId') chatRoomId: string,
        @Body() dto: CreateChatMessageDto,
    ): Promise<ChatMessageResponseDto> {
        const message = await this.chatMessageService.send(
            userId,
            chatRoomId,
            dto,
        );

        return plainToInstance(ChatMessageResponseDto, message, {
            excludeExtraneousValues: true,
        });
    }

    @Get()
    @ApiOperation({ summary: '메시지 목록 조회 (최신순)' })
    @ApiOkResponse({ type: ChatMessageListResponseDto })
    @ApiParam({ name: 'chatRoomId' })
    @ApiQuery({
        name: 'cursor',
        required: false,
        description: '이전 응답의 nextCursor 값',
    })
    @ApiQuery({ name: 'limit', required: false, example: 30 })
    async findMessages(
        @CurrentUser() userId: string,
        @Param('chatRoomId') chatRoomId: string,
        @Query('cursor') cursor?: string,
        @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit?: number,
    ): Promise<ChatMessageListResponseDto> {
        const result = await this.chatMessageService.findMessages(
            userId,
            chatRoomId,
            cursor,
            limit,
        );

        return plainToInstance(ChatMessageListResponseDto, result, {
            excludeExtraneousValues: true,
        });
    }
}