import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ChatReadResponseDto {
    @ApiProperty({ example: 0, description: '읽음 처리 후 남은 안읽은 메시지 수' })
    @Expose()
    unreadCount: number;
}