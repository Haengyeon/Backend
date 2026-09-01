import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChatMessageDto {
    @ApiProperty({
        example: '내일 몇 시에 만날까요?',
        maxLength: 300,
    })
    @IsString()
    @MinLength(1)
    @MaxLength(300, { message: '메시지는 300자를 넘을 수 없습니다.' })
    content: string;
}