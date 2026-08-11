import {
    IsNotEmpty,
    IsString,
    MaxLength,
} from 'class-validator';

export class SendChatMessageDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    content: string;
}