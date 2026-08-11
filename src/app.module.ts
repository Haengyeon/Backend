import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ChatModule } from './chat/chat.module';
import { CourseModule } from './course/course.module';
import { MatchingModule } from './matching/matching.module';
import { PaymentModule } from './payment/payment.module';
import { NotificationModule } from './notification/notification.module';
import { RewardModule } from './reward/reward.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UserModule,
    ChatModule,
    CourseModule,
    MatchingModule,
    PaymentModule,
    NotificationModule,
    RewardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
