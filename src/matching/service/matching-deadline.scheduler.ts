import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import {
    MatchAttemptStatus,
    PaymentStatus,
} from '../../generated/prisma/enums';
import { MatchingEngineService } from './matching-engine.service';
import { MatchingPenaltyService } from './matching-penalty.service';

@Injectable()
export class MatchingDeadlineScheduler {
    private readonly logger = new Logger(MatchingDeadlineScheduler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly penalty: MatchingPenaltyService,
        private readonly matchingEngine: MatchingEngineService,
    ) {}

    /**
     * 응답 마감(respondDeadlineAt)이 지난 매칭 시도를 시간초과 처리함
     * 미응답자는 거절과 동일하게 카운트 +1, 응답을 마친 쪽은 페널티 없이 재탐색.
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async expireResponses() {
        const now = new Date();

        const expired = await this.prisma.matchAttempt.findMany({
            where: {
                status: MatchAttemptStatus.WAITING_RESPONSE,
                respondDeadlineAt: { lt: now },
            },
            include: {
                matchingA: { select: { id: true, userId: true } },
                matchingB: { select: { id: true, userId: true } },
                responses: { select: { userId: true } },
            },
        });

        if (expired.length === 0) return;

        for (const attempt of expired) {
            try {
                const respondedUserIds = new Set(
                    attempt.responses.map((r) => r.userId),
                );

                const requeueIds = await this.prisma.$transaction(async (tx) => {
                    await tx.matchAttempt.update({
                        where: { id: attempt.id },
                        data: { status: MatchAttemptStatus.RESPONSE_EXPIRED },
                    });

                    return this.settleSides(
                        tx,
                        [attempt.matchingA, attempt.matchingB],
                        (side) => respondedUserIds.has(side.userId),
                        now,
                    );
                });

                this.requeue(requeueIds);
                this.logger.log(`응답 시간초과 처리: attempt=${attempt.id}`);
            } catch (error) {
                this.logger.error(
                    `응답 시간초과 처리 실패: attempt=${attempt.id}`,
                    error as Error,
                );
            }
        }
    }

    /**
     * 결제 마감(paymentDeadlineAt)이 지난 매칭 시도를 만료 처리한다.
     * 미결제자는 카운트 +1, 결제를 마친 쪽은 페널티 없이 재탐색.
     * NOTE: 이미 결제한 쪽에 대한 실제 환불 처리는 결제 연동 이슈에서 구현
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async expirePayments() {
        const now = new Date();

        const expired = await this.prisma.matchAttempt.findMany({
            where: {
                status: MatchAttemptStatus.PAYMENT_PENDING,
                paymentDeadlineAt: { lt: now },
            },
            include: {
                matchingA: { select: { id: true, userId: true } },
                matchingB: { select: { id: true, userId: true } },
                payments: {
                    where: { status: PaymentStatus.APPROVED },
                    select: { userId: true },
                },
            },
        });

        if (expired.length === 0) return;

        for (const attempt of expired) {
            try {
                const paidUserIds = new Set(attempt.payments.map((p) => p.userId));

                const requeueIds = await this.prisma.$transaction(async (tx) => {
                    await tx.matchAttempt.update({
                        where: { id: attempt.id },
                        data: { status: MatchAttemptStatus.PAYMENT_EXPIRED },
                    });

                    return this.settleSides(
                        tx,
                        [attempt.matchingA, attempt.matchingB],
                        (side) => paidUserIds.has(side.userId),
                        now,
                    );
                });

                this.requeue(requeueIds);
                this.logger.log(`결제 시간초과 처리: attempt=${attempt.id}`);
            } catch (error) {
                this.logger.error(
                    `결제 시간초과 처리 실패: attempt=${attempt.id}`,
                    error as Error,
                );
            }
        }
    }

    /**
     * 양쪽을 각각 "책임 없음(제때 행동함)" / "책임 있음(무응답·미결제)"으로 처리
     * @returns 페널티 없이 풀려나 즉시 재탐색해야 하는 Matching id 목록
     */
    private async settleSides(
        tx: any,
        sides: { id: string; userId: string }[],
        didAct: (side: { id: string; userId: string }) => boolean,
        at: Date,
    ): Promise<string[]> {
        const requeueIds: string[] = [];

        for (const side of sides) {
            if (didAct(side)) {
                await this.penalty.releaseWithoutPenalty(tx, side.id);
                requeueIds.push(side.id);
            } else {
                await this.penalty.applyPenalty(tx, side.id, at);
            }
        }

        return requeueIds;
    }

    // 트랜잭션 커밋 이후 재탐색을 트리거한다. 실패해도 마감 처리 자체는 유효
    private requeue(matchingIds: string[]) {
        for (const matchingId of matchingIds) {
            this.matchingEngine
                .tryMatch(matchingId)
                .catch((error) =>
                    this.logger.error(
                        `마감 처리 후 재탐색 실패: matching=${matchingId}`,
                        error as Error,
                    ),
                );
        }
    }
}