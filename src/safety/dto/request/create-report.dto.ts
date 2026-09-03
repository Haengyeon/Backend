// POST /safety/reports
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ReportReasonCode } from '../../../generated/prisma/enums';

export class CreateReportDto {
  @ApiProperty({
    description:
      '신고할 상대와 매칭된 건의 id. 신고 대상 userId는 이 값으로 서버가 찾는다',
  })
  @IsUUID()
  matchAttemptId: string;

  @ApiProperty({
    enum: ReportReasonCode,
    description:
      'INAPPROPRIATE_PROFILE(부적절한 프로필) / NO_SHOW(노쇼) / ' +
      'ABUSE_HARASSMENT(폭언·희롱) / SEXUAL_HARASSMENT(성희롱·성적 불쾌감) / ' +
      'SUSPECTED_FRAUD(사기 의심) / OTHER(기타)',
  })
  @IsEnum(ReportReasonCode)
  reasonCode: ReportReasonCode;

  @ApiPropertyOptional({
    maxLength: 500,
    description: '상세 사유. 선택 입력이라 비워도 접수된다',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '상세 사유는 500자를 넘을 수 없습니다.' })
  description?: string;
}
