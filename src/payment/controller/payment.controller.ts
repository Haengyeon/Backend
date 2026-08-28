import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';

import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { plainToInstance } from 'class-transformer';

import { ReadyPaymentDto } from '../dto/request/ready-payment.dto';
import { ApprovePaymentDto } from '../dto/request/approve-payment.dto';
import { PaymentReadyResponseDto } from '../dto/response/payment-ready-response.dto';
import { PaymentApproveResponseDto } from '../dto/response/payment-approve-response.dto';
import { PaymentService } from '../service/payment.service';

@ApiTags('Payment')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('ready')
  @ApiOperation({
    summary: '결제 준비 (카카오페이 결제창 URL 발급)',
  })
  @ApiOkResponse({ type: PaymentReadyResponseDto })
  @ApiHeader({
    name: 'x-test-user-id',
    description: '개발용 테스트 사용자 ID',
    required: true,
  })
  async ready(
      @Headers('x-test-user-id') userId: string,
      @Body() dto: ReadyPaymentDto,
  ): Promise<PaymentReadyResponseDto> {
    if (!userId) {
      throw new BadRequestException('x-test-user-id 헤더가 필요합니다.');
    }

    const result = await this.paymentService.ready(
        userId,
        dto.matchAttemptId,
    );

    return plainToInstance(PaymentReadyResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('approve')
  @ApiOperation({
    summary: '결제 승인 (redirect로 받은 pg_token으로 최종 승인)',
  })
  @ApiOkResponse({ type: PaymentApproveResponseDto })
  @ApiHeader({
    name: 'x-test-user-id',
    description: '개발용 테스트 사용자 ID',
    required: true,
  })
  async approve(
      @Headers('x-test-user-id') userId: string,
      @Body() dto: ApprovePaymentDto,
  ): Promise<PaymentApproveResponseDto> {
    if (!userId) {
      throw new BadRequestException('x-test-user-id 헤더가 필요합니다.');
    }

    const result = await this.paymentService.approve(
        userId,
        dto.paymentId,
        dto.pgToken,
    );

    return plainToInstance(PaymentApproveResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }
}