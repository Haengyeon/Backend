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
import { MatchingPenaltyService } from './matching-penalty.service';
import {calcAge} from "../../common/age.util";
import { MATCHING_PAYMENT_AMOUNT } from "../../common/payment.constant";

const PAYMENT_WINDOW_MS = 6 * 60 * 60 * 1000; // 결제 유예 6시간

@Injectable()
export class MatchAttemptService {
    private readonly logger = new Logger(MatchAttemptService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly penalty: MatchingPenaltyService,
        private readonly matchingEngine: MatchingEngineService,
    ) {}

    async findOne(userId: string, matchAttemptId: string) {
        const attempt = await this.prisma.matchAttempt.findUnique({
            where: {id: matchAttemptId},
            include: {
                matchingA: {
                    select: {userId: true, user: {select: {profile: true}}},
                },
                matchingB: {
                    select: {userId: true, user: {select: {profile: true}}},
                },
                responses: {select: {userId: true, decision: true}},
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

        const partnerSide = isSideA ? attempt.matchingB : attempt.matchingA;
        const partnerProfile = partnerSide.user.profile;

        if (!partnerProfile) {
            throw new NotFoundException('상대방 프로필을 찾을 수 없습니다.');
        }

        const myResponse = attempt.responses.find((r) => r.userId === userId);

        return {
            id: attempt.id,
            status: attempt.status,
            travelDate: attempt.travelDate,
            theme: attempt.theme,
            paymentAmount: MATCHING_PAYMENT_AMOUNT,
            paymentDeadlineAt: attempt.paymentDeadlineAt,

            myResponded: Boolean(myResponse),
            myDecision: myResponse?.decision ?? null,

            partner: {
                name: partnerProfile.name,
                age: calcAge(partnerProfile.birthDate),
                gender: partnerProfile.gender,
                // 비공개로 설정한 경우 직업을 내려주지 않는다
                jobCategory: partnerProfile.jobPrivate
                    ? null
                    : partnerProfile.jobCategory,
                mbti: partnerProfile.mbti,
                introduce: partnerProfile.introduce,
                hobbies: partnerProfile.hobbies,
                fullBodyImageUrl: partnerProfile.fullBodyImageUrl,
            },
        };
    }


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
            // 마감 지난 건은 스케줄러가 RESPONSE_EXPIRED로 처리한다. 그 사이 들어온 응답만 차단.
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

                // 거절한 쪽(나): 하루 카운트 +1, 한도 도달 시 EXHAUSTED, 아니면 RETRY_READY
                await this.penalty.applyPenalty(tx, myMatching.id);

                // 거절당한 쪽(상대): 카운트 변화 없이 즉시 재탐색 가능 상태로 복귀
                await this.penalty.releaseWithoutPenalty(tx, otherMatching.id);

                return { attempt: updatedAttempt, requeueMatchingId: otherMatching.id };
            }

            /* ACCEPTED: 상대방이 이미 수락했는지 확인 (거절이었다면 위에서 이미 걸러졌으므로,
            * 상대방 응답이 존재한다면 그건 반드시 ACCEPTED)
             */
            const otherAlreadyAccepted = attempt.responses.some(
                (r) => r.userId === otherMatching.userId,
            );

            if (!otherAlreadyAccepted) {
                // 상대방 응답 대기 — 상태 변화 없음
                return { attempt, requeueMatchingId: null };
            }

            // 양쪽 다 수락 -> 결제 대기로 전이
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

        // 거절당한 쪽은 사용자 액션 없이 즉시 재탐색. 트랜잭션 커밋 이후 응답 자체는 지연시키지 않음.
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