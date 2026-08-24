import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
    MatchAttemptStatus,
    MatchDecision,
    MatchingStatus,
} from '../../generated/prisma/enums';
import { MatchAttemptDto } from '../dto/request/match-attempt.dto';
import { MatchingEngineService } from './matching-engine.service';

const DAILY_REJECTION_LIMIT = 3; // 거절한 쪽 기준 하루 3회
const PAYMENT_WINDOW_MS = 6 * 60 * 60 * 1000; // 결제 유예 6시간

// KST 기준 'YYYY-MM-DD' — 하루가 바뀌었는지 비교하는 용도
function toKstDateString(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((p) => p.type === 'year')!.value;
    const month = parts.find((p) => p.type === 'month')!.value;
    const day = parts.find((p) => p.type === 'day')!.value;

    return `${year}-${month}-${day}`;
}

@Injectable()
export class MatchAttemptService {
    private readonly logger = new Logger(MatchAttemptService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly matchingEngine: MatchingEngineService,
    ) {}

    async respond(
        userId: string,
        matchAttemptId: string,
        dto: MatchAttemptDto,
    ) {
        const attempt = await this.prisma.matchAttempt.findUnique({
            where: { id: matchAttemptId },
            include: {
                matchingA: true,
                matchingB: true,
                responses: true,
            },
        });

        if (!attempt) {
            throw new NotFoundException('매칭 시도를 찾을 수 없습니다.');
        }

        const isSideA = attempt.matchingA.userId === userId;
        const isSideB = attempt.matchingB.userId === userId;

        if (!isSideA && !isSideB) {
            throw new ForbiddenException('해당 매칭에 대한 권한이 없습니다.');
        }

        if (attempt.status !== MatchAttemptStatus.WAITING_RESPONSE) {
            throw new ConflictException('이미 처리된 매칭 시도입니다.');
        }

        if (new Date() > attempt.respondDeadlineAt) {
            // 시간초과 자동감지(스케줄러)는 별도 이슈. 여기서는 마감 이후 수동 응답만 방어적으로 차단.
            throw new BadRequestException('응답 마감 시한이 지났습니다.');
        }

        const alreadyResponded = attempt.responses.some(
            (r) => r.userId === userId,
        );
        if (alreadyResponded) {
            throw new ConflictException('이미 응답을 완료했습니다.');
        }

        // myMatching = 지금 응답을 보내는 사람 / otherMatching = 상대방
        const myMatching = isSideA ? attempt.matchingA : attempt.matchingB;
        const otherMatching = isSideA ? attempt.matchingB : attempt.matchingA;

        const result = await this.prisma.$transaction(async (tx) => {
            await tx.matchResponse.create({
                data: {
                    matchAttemptId: attempt.id,
                    userId,
                    decision: dto.decision,
                },
            });

            if (dto.decision === MatchDecision.REJECTED) {
                const updatedAttempt = await tx.matchAttempt.update({
                    where: { id: attempt.id },
                    data: { status: MatchAttemptStatus.REJECTED },
                });

                // 거절한 쪽(나): 하루 단위 카운트 +1, 3회 도달 시 매칭 자체 종료(EXHAUSTED)
                // 3회 미만이면 RETRY_READY — 클라이언트가 [조건수정 / 이대로 재탐색] 노출
                const now = new Date();
                const today = toKstDateString(now);
                const lastRejectedDay = myMatching.lastRejectedAt
                    ? toKstDateString(myMatching.lastRejectedAt)
                    : null;
                const isNewDay = lastRejectedDay !== today;
                const newCount = isNewDay ? 1 : myMatching.rejectionCount + 1;
                const isExhausted = newCount >= DAILY_REJECTION_LIMIT;

                await tx.matching.update({
                    where: { id: myMatching.id },
                    data: {
                        rejectionCount: newCount,
                        lastRejectedAt: now,
                        ...(isExhausted
                            ? { status: MatchingStatus.EXHAUSTED, endedAt: now }
                            : { status: MatchingStatus.RETRY_READY }),
                    },
                });

                // 거절당한 쪽(상대): 카운트 변화 없음, 즉시 재탐색 가능 상태로 복귀
                await tx.matching.update({
                    where: { id: otherMatching.id },
                    data: { status: MatchingStatus.SEARCHING },
                });

                return { attempt: updatedAttempt, requeueMatchingId: otherMatching.id };
            }

            // ACCEPTED: 상대방이 이미 수락했는지 확인 (거절이었다면 위에서 이미 걸러졌으므로,
            // 상대방 응답이 존재한다면 그건 반드시 ACCEPTED)
            const otherAlreadyAccepted = attempt.responses.some(
                (r) => r.userId === otherMatching.userId,
            );

            if (!otherAlreadyAccepted) {
                // 상대방 응답 대기 — 상태 변화 없음
                return { attempt, requeueMatchingId: null };
            }

            // 양쪽 다 수락 -> 결제 대기
            const paymentDeadlineAt = new Date(Date.now() + PAYMENT_WINDOW_MS);

            const updatedAttempt = await tx.matchAttempt.update({
                where: { id: attempt.id },
                data: {
                    status: MatchAttemptStatus.PAYMENT_PENDING,
                    paymentDeadlineAt,
                },
            });

            await tx.matching.update({
                where: { id: myMatching.id },
                data: { status: MatchingStatus.PAYMENT_PENDING },
            });
            await tx.matching.update({
                where: { id: otherMatching.id },
                data: { status: MatchingStatus.PAYMENT_PENDING },
            });

            return { attempt: updatedAttempt, requeueMatchingId: null };
        });

        // 거절당한 쪽은 사용자 액션 없이 즉시 재탐색. 트랜잭션 커밋 이후, 응답 자체는 지연시키지 않는다.
        if (result.requeueMatchingId) {
            this.matchingEngine
                .tryMatch(result.requeueMatchingId)
                .catch((error) =>
                    this.logger.error('거절당한 쪽 즉시 재탐색 중 오류', error as Error),
                );
        }

        return result.attempt;
    }
}