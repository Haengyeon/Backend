import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DevTokenDto {
    @ApiProperty({
        example: '1',
        description: '토큰을 발급받을 더미 계정 ID',
    })
    @IsString()
    userId: string;
}