import {Module} from '@nestjs/common';
import {AppController} from './app.controller';
import {AppService} from './app.service';
import {PrismaModule} from './prisma/prisma.module';
import {StorageModule} from './storage/storage.module';
import {AuthModule} from './auth/auth.module';
import {UserModule} from './user/user.module';
import {ChatModule} from './chat/chat.module';
import {CourseModule} from './course/course.module';
import {MatchingModule} from './matching/matching.module';
import {PaymentModule} from './payment/payment.module';
import {NotificationModule} from './notification/notification.module';
import {RewardModule} from './reward/reward.module';
import {SafetyModule} from './safety/safety.module';
import {FestivalModule} from './festival/festival.module';
import {ScheduleModule} from "@nestjs/schedule";
import {VideoModule} from "./video/video.module";

@Module({
    imports: [
        ScheduleModule.forRoot(),
        PrismaModule,
        StorageModule,
        AuthModule,
        UserModule,
        ChatModule,
        CourseModule,
        MatchingModule,
        PaymentModule,
        NotificationModule,
        RewardModule,
        SafetyModule,
        FestivalModule,
        VideoModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {
}
