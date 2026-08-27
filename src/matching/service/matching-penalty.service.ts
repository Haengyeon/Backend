import { Injectable } from '@nestjs/common';

import { MatchingStatus } from '../../generated/prisma/enums';

export const DAILY_REJECTION_LIMIT = 3; // 거절/시간초과 합산 하루 3회

/** KST 기준 'YYYY-MM-DD' — 하루가 바뀌었는지 비교하는 용도 */
export function toKstDateString(date: Date): string {
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

// PrismaClient 전체 타입을 요구하면 $transaction 콜백 인자를 넘길 수 없어서 좁게 정의
type MatchingWriter = {
    matching: {
        findUniqueOrThrow: (args: any) => Promise<any>;
        update: (args: any) => Promise<any>;
    };
};

/**
 * 거절/시간초과에 대한 책임 처리를 한 곳에 모아둔 서비스.
 * 수락/거절 API(match-attempt.service)와 마감 스케줄러가 동일한 규칙을 쓰도록 공유한다.
 */
@Injectable()
export class MatchingPenaltyService {
    /**
     * 책임 있는 쪽(거절한 사람 / 응답·결제를 안 한 사람)에게 페널티 부여.
     * 하루 단위로 카운트하며, 날짜가 바뀌었으면 1부터 다시 센다.
     * 한도에 도달하면 매칭 자체를 종료(EXHAUSTED)한다.
     * @returns 페널티 반영 후 소진 여부
     */
    async applyPenalty(
        tx: MatchingWriter,
        matchingId: string,
        at: Date = new Date(),
    ): Promise<{ rejectionCount: number; isExhausted: boolean }> {
        const matching = await tx.matching.findUniqueOrThrow({
            where: { id: matchingId },
            select: { rejectionCount: true, lastRejectedAt: true },
        });

        const today = toKstDateString(at);
        const lastRejectedDay = matching.lastRejectedAt
            ? toKstDateString(matching.lastRejectedAt)
            : null;

        const isNewDay = lastRejectedDay !== today;
        const rejectionCount = isNewDay ? 1 : matching.rejectionCount + 1;
        const isExhausted = rejectionCount >= DAILY_REJECTION_LIMIT;

        await tx.matching.update({
            where: { id: matchingId },
            data: {
                rejectionCount,
                lastRejectedAt: at,
                ...(isExhausted
                    ? { status: MatchingStatus.EXHAUSTED, endedAt: at }
                    : { status: MatchingStatus.RETRY_READY }),
            },
        });

        return { rejectionCount, isExhausted };
    }

    /**
     * 책임 없는 쪽(거절당한 사람 / 제때 응답·결제한 사람)을 페널티 없이 풀어줌
     * 카운트는 건드리지 않고 바로 재탐색 가능 상태로 되돌림.
     */
    async releaseWithoutPenalty(tx: MatchingWriter, matchingId: string): Promise<void> {
        await tx.matching.update({
            where: { id: matchingId },
            data: { status: MatchingStatus.SEARCHING },
        });
    }
}