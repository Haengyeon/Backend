import { Module } from '@nestjs/common';

import { PaymentController } from './controller/payment.controller';
import { PaymentService } from './service/payment.service';
import { KakaoPayClient } from './service/kakao-pay.client';
import {ChatModule} from "../chat/chat.module";

@Module({
  imports: [ChatModule],
  controllers: [PaymentController],
  providers: [PaymentService, KakaoPayClient],
})
export class PaymentModule {}