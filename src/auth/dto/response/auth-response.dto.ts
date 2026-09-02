import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
    @ApiProperty({ description: 'Authorization: Bearer 헤더에 사용' })
    accessToken: string;

    @ApiProperty({
        description:
            '프로필 작성 완료 여부. false면 프로필 작성 화면으로 보낸다. '
    })
    hasProfile: boolean;
}