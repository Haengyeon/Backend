import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '../../generated/prisma/enums';
import {
    NotificationService,
    NotificationType,
} from '../../notification/service/notification.service';
import { kstToday } from '../course-date.util';

@Injectable()
export class CourseReminderScheduler {
    private readonly logger = new Logger(CourseReminderScheduler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notification: NotificationService,
    ) {}

    /**
     * 여행 D-2 / D-1 안내 알림.
     *
     * 매일 오전 10시(KST)에 한 번 돈다. 서버가 UTC로 떠 있어도 KST 기준이 되도록
     * 크론에 타임존을 지정한다.
     *
     * 코스 공개 범위가 D-2(지역·테마) -> D-1(예고) -> 당일(전체) 순으로 열리므로,
     * 새로 볼 수 있는 게 생기는 시점에 맞춰 알린다.
     */
    @Cron('0 10 * * *', { timeZone: 'Asia/Seoul' })
    async sendTravelReminders() {
        await this.sendFor(2, NotificationType.COURSE_D2);
        await this.sendFor(1, NotificationType.COURSE_D1);
    }

    private async sendFor(
        daysAhead: number,
        type: NotificationType,
    ): Promise<void> {
        const targetDate = this.kstDatePlus(daysAhead);

        const courses = await this.prisma.course.findMany({
            where: {
                travelDate: targetDate,
                status: CourseStatus.UPCOMING,
            },
            select: {
                id: true,
                matchAttempt: {
                    select: {
                        matchingA: { select: { userId: true } },
                        matchingB: { select: { userId: true } },
                    },
                },
            },
        });

        if (courses.length === 0) return;

        for (const course of courses) {
            const userIds = [
                course.matchAttempt.matchingA.userId,
                course.matchAttempt.matchingB.userId,
            ];

            // 발송 실패는 NotificationService 안에서 삼켜지므로 여기서 따로 처리하지 않는다
            await this.notification.sendToMany(userIds, type);
        }

        this.logger.log(`D-${daysAhead} 알림 발송: ${courses.length}건`);
    }

    /**
     * KST 기준 오늘로부터 n일 뒤 날짜.
     *
     * travelDate가 @db.Date라 UTC 자정으로 저장돼 있어, 비교할 값도 UTC 자정으로 만든다.
     */
    private kstDatePlus(days: number): Date {
        const [year, month, day] = kstToday().split('-').map(Number);

        return new Date(Date.UTC(year, month - 1, day + days));
    }
}