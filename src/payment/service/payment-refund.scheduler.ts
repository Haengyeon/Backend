import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import {
    MatchAttemptStatus,
    PaymentStatus,
} from '../../generated/prisma/enums';
import { PaymentService } from './payment.service';

// 이 횟수를 넘기면 자동 재시도를 멈춤.
// 카카오가 영구적으로 거부하는 건(원거래없음 등)을 매번 두드려봤자 의미가 없고,로그가 실패로 가득 차면 정작 봐야 할 것이 묻힌다.
const MAX_REFUND_ATTEMPTS = 5;

// 매칭 시도가 이 상태면 결제는 이미 무효다. 그런데도 APPROVED로 남아 있다면
// 환불이 되지 않은 것이므로 다시 시도해야 한다.
const DEAD_ATTEMPT_STATUSES = [
    MatchAttemptStatus.PAYMENT_EXPIRED,
    MatchAttemptStatus.RESPONSE_EXPIRED,
    MatchAttemptStatus.REJECTED,
    MatchAttemptStatus.CANCELLED,
];

@Injectable()
export class PaymentRefundScheduler {
    private readonly logger = new Logger(PaymentRefundScheduler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly payment: PaymentService,
    ) {}

    /**
     * 환불에 실패해 돈이 묶인 결제를 다시 처리함.
     * 마감 스케줄러가 환불을 시도하지만 카카오 호출이 실패하면 그대로 넘어감
     *
     * 별도 플래그를 두지 않고 상태 조합으로 대상을 찾음
     * (시도는 끝났는데 결제는 APPROVED = 환불되지 않은 건)
     */
    @Cron(CronExpression.EVERY_10_MINUTES)
    async retryFailedRefunds() {
        const targets = await this.prisma.payment.findMany({
            where: {
                status: PaymentStatus.APPROVED,
                refundAttemptCount: { lt: MAX_REFUND_ATTEMPTS },
                matchAttempt: {
                    status: { in: DEAD_ATTEMPT_STATUSES },
                },
            },
            select: { id: true, userId: true, refundAttemptCount: true },
        });

        if (targets.length === 0) return;

        this.logger.log(`환불 재시도 대상: ${targets.length}건`);

        for (const target of targets) {
            try {
                await this.payment.refund(target.id);
            } catch (error) {
                // refund()가 이미 시도 횟수를 올려 두었다.
                // 한도에 도달한 건은 사람이 봐야 하므로 눈에 띄게 남긴다.
                const attempts = target.refundAttemptCount + 1;

                if (attempts >= MAX_REFUND_ATTEMPTS) {
                    this.logger.error(
                        `[수동 처리 필요] 환불 ${attempts}회 실패: ` +
                        `payment=${target.id}, user=${target.userId}`,
                        error as Error,
                    );
                } else {
                    this.logger.warn(
                        `환불 재시도 실패(${attempts}/${MAX_REFUND_ATTEMPTS}): payment=${target.id}`,
                    );
                }
            }
        }
    }
}