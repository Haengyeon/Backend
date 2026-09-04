import { Module } from '@nestjs/common';

import { PaymentController } from './controller/payment.controller';
import { PaymentService } from './service/payment.service';
import { KakaoPayClient } from './service/kakao-pay.client';
import { CourseModule } from '../course/course.module';
import {ChatModule} from "../chat/chat.module";

// 결제가 확정되면 코스를 만들어야 해서 CourseModule을 가져온다.
// CourseModule은 결제를 참조하지 않아서 순환은 없다.
@Module({
  imports: [ChatModule,CourseModule],
  controllers: [PaymentController],
  providers: [PaymentService, KakaoPayClient],
  // 결제 마감 스케줄러(매칭 도메인)에서 환불을 호출한다
  exports: [PaymentService],
})
export class PaymentModule {}