// POST /safety/reports, GET /safety/reports 응답 형태
import { ApiProperty } from '@nestjs/swagger';
import {
  ReportReasonCode,
  ReportStatus,
} from '../../../generated/prisma/enums';
import { SafetyUserDto } from './safety-user.dto';

export class ReportResponseDto {
  @ApiProperty({ description: '신고 기록의 id. 코스나 차단과는 무관하다' })
  reportId: string;

  @ApiProperty({ description: '어떤 매칭 건에 대한 신고인지' })
  matchAttemptId: string;

  @ApiProperty({ type: SafetyUserDto })
  reportedUser: SafetyUserDto;

  @ApiProperty({
    enum: ReportReasonCode,
    description: '사유를 가르는 코드. 화면에 쓸 문구는 reason에 있다',
  })
  reasonCode: ReportReasonCode;

  @ApiProperty({ example: '노쇼', description: '화면에 그대로 쓰는 사유' })
  reason: string;

  @ApiProperty({ nullable: true, description: '접수 시 적은 상세 사유' })
  description: string | null;

  @ApiProperty({
    enum: ReportStatus,
    description:
      '접수 직후는 항상 PENDING. 운영자가 검토를 시작하면 REVIEWED, ' +
      '처리가 끝나면 RESOLVED로 바뀐다',
  })
  status: ReportStatus;

  @ApiProperty({ description: '접수일시' })
  createdAt: Date;
}

export class ReportListResponseDto {
  @ApiProperty({ type: [ReportResponseDto] })
  items: ReportResponseDto[];
}
