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
    CourseTheme,
    MatchAttemptStatus,
    MatchDecision,
    MatchingStatus,
} from '../../generated/prisma/enums';
import { MatchAttemptDto } from '../dto/request/match-attempt.dto';
import { MatchingEngineService } from './matching-engine.service';
import {
    NotificationService,
    NotificationType,
} from '../../notification/service/notification.service';
import { MatchingPenaltyService } from './matching-penalty.service';
import {calcAge} from "../../common/age.util";
import { MATCHING_PAYMENT_AMOUNT } from "../../common/payment.constant";
import { CourseGeneratorService } from '../../course/algorithm/course-generator.service';
import { DummyPaymentService } from '../dummy/dummy-payment.service';

const PAYMENT_WINDOW_MS = 6 * 60 * 60 * 1000; // 결제 유예 6시간

/** 응답 처리에 필요한 한쪽 정보. 더미 여부까지 알아야 뒷정리를 다르게 할 수 있다. */
interface AttemptSide {
    id: string;
    userId: string;
    themes: CourseTheme[];
    user: { isDummy: boolean };
}

@Injectable()
export class MatchAttemptService {
    private readonly logger = new Logger(MatchAttemptService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly penalty: MatchingPenaltyService,
        private readonly matchingEngine: MatchingEngineService,
        private readonly notification: NotificationService,
        private readonly courseGenerator: CourseGeneratorService,
        private readonly dummyPayment: DummyPaymentService,
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


    /**
     * 사전 판정에서 시도할 테마 순서.
     *
     * 매칭이 정한 테마가 먼저다. 그게 되면 거기서 멈추므로 보통 TourAPI를 한 번만 부른다.
     * 안 되면 두 사람이 함께 고른 테마, 그다음 각자 고른 테마 순으로 내려간다.
     * 아무도 안 고른 테마까지 가지는 않는다 — 코스는 나와도 원하지 않은 하루가 된다.
     */
    private themeCandidates(attempt: {
        theme: CourseTheme;
        matchingA: { themes: CourseTheme[] };
        matchingB: { themes: CourseTheme[] };
    }): CourseTheme[] {
        const shared = attempt.matchingA.themes.filter((t) =>
            attempt.matchingB.themes.includes(t),
        );
        const either = [...attempt.matchingA.themes, ...attempt.matchingB.themes];

        return [...new Set([attempt.theme, ...shared, ...either])];
    }

    /**
     * 어떤 테마로도 코스가 안 나올 때. 결제로 넘기지 않고 매칭을 되돌린다.
     *
     * 양쪽 다 잘못한 게 없으므로 거절 횟수를 올리지 않는다. 둘 다 바로 재탐색으로
     * 돌려보내고, 다음 후보는 다른 지역·테마로 잡힐 수 있다.
     */
    private async cancelUnbuildable(
        attemptId: string,
        myMatching: AttemptSide,
        otherMatching: AttemptSide,
    ) {
        const { cancelled, requeueIds } = await this.prisma.$transaction(
            async (tx) => {
                const updated = await tx.matchAttempt.update({
                    where: { id: attemptId },
                    data: { status: MatchAttemptStatus.CANCELLED },
                });

                const ids: string[] = [];

                for (const side of [myMatching, otherMatching]) {
                    const requeueId = await this.releaseSide(tx, side);

                    if (requeueId) ids.push(requeueId);
                }

                return { cancelled: updated, requeueIds: ids };
            },
        );

        // 실제 사용자만 조건 그대로 다시 후보를 찾는다
        for (const matchingId of requeueIds) {
            this.matchingEngine
                .tryMatch(matchingId)
                .catch((error) =>
                    this.logger.error('코스 불가로 취소 후 재탐색 중 오류', error as Error),
                );
        }

        return cancelled;
    }

    /**
     * 매칭이 깨졌을 때 한쪽을 정리한다.
     *
     * 실제 사용자는 잘못이 없으므로 페널티 없이 재탐색으로 돌려보낸다.
     * 더미는 돌려보내면 혼자 매칭 풀을 떠돌다 엉뚱한 사용자에게 붙으므로 종료시킨다.
     * 더미의 Matching은 fallback이 그때그때 만드는 임시 데이터라 남겨 둘 이유도 없다.
     *
     * @returns 재탐색이 필요한 matchingId. 더미면 null.
     */
    private async releaseSide(
        tx: any,
        side: AttemptSide,
    ): Promise<string | null> {
        if (side.user.isDummy) {
            await tx.matching.update({
                where: { id: side.id },
                data: {
                    status: MatchingStatus.CANCELLED,
                    endedAt: new Date(),
                },
            });

            return null;
        }

        await this.penalty.releaseWithoutPenalty(tx, side.id);

        return side.id;
    }

    async respond(
        userId: string,
        matchAttemptId: string,
        dto: MatchAttemptDto,
    ) {
        const attempt = await this.prisma.matchAttempt.findUnique({
            where: { id: matchAttemptId },
            include: {
                // 더미는 응답 이후 뒷정리가 달라서 isDummy까지 가져온다
                matchingA: { include: { user: { select: { isDummy: true } } } },
                matchingB: { include: { user: { select: { isDummy: true } } } },
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
        const myMatching: AttemptSide = isSideA
            ? attempt.matchingA
            : attempt.matchingB;
        const otherMatching: AttemptSide = isSideA
            ? attempt.matchingB
            : attempt.matchingA;

        // 이 응답으로 결제 단계에 들어가는지. 상대가 이미 수락해 뒀으면 그렇다.
        // (거절이면 위에서 이미 걸러졌으므로, 상대 응답이 있다면 반드시 ACCEPTED)
        const entersPayment =
            dto.decision === MatchDecision.ACCEPTED &&
            attempt.responses.some((r) => r.userId === otherMatching.userId);

        // 결제로 넘기기 전에 코스를 만들 수 있는지 본다.
        // TourAPI를 부르므로 트랜잭션 밖에서 해야 한다 — 안에서 하면 그동안 락을 쥔다.
        const preflight = entersPayment
            ? await this.courseGenerator.preflight(
                attempt.region,
                attempt.sigunguCode,
                this.themeCandidates(attempt),
            )
            : null;

        if (preflight && !preflight.ok) {
            this.logger.warn(
                `코스를 만들 수 없어 결제로 넘기지 않음: attempt=${attempt.id} ` +
                `region=${attempt.region}/${attempt.sigunguCode}`,
            );
            return this.cancelUnbuildable(attempt.id, myMatching, otherMatching);
        }

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
                const requeueMatchingId = await this.releaseSide(
                    tx,
                    otherMatching,
                );

                return {
                    attempt: updatedAttempt,
                    requeueMatchingId,
                    notifyPaymentPending: null,
                };
            }

            /* ACCEPTED: 상대방이 이미 수락했는지 확인 (거절이었다면 위에서 이미 걸러졌으므로,
            * 상대방 응답이 존재한다면 그건 반드시 ACCEPTED)
             */
            const otherAlreadyAccepted = attempt.responses.some(
                (r) => r.userId === otherMatching.userId,
            );

            if (!otherAlreadyAccepted) {
                // 상대방 응답 대기 — 상태 변화 없음
                return { attempt, requeueMatchingId: null, notifyPaymentPending: null };
            }

            // 양쪽 다 수락 -> 결제 대기로 전이
            const paymentDeadlineAt = new Date(Date.now() + PAYMENT_WINDOW_MS);

            const updatedAttempt = await tx.matchAttempt.update({
                where: { id: attempt.id },
                data: {
                    status: MatchAttemptStatus.PAYMENT_PENDING,
                    paymentDeadlineAt,
                    // 원래 테마로 코스가 안 나오면 판정이 대체 테마를 골라 준다
                    ...(preflight && preflight.theme !== attempt.theme && {
                        theme: preflight.theme,
                    }),
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

            return {
                attempt: updatedAttempt,
                requeueMatchingId: null,
                notifyPaymentPending: [myMatching.userId, otherMatching.userId],
            };
        });

        // 거절당한 쪽은 사용자 액션 없이 즉시 재탐색. 트랜잭션 커밋 이후 응답 자체는 지연시키지 않음.
        if (result.requeueMatchingId) {
            this.matchingEngine
                .tryMatch(result.requeueMatchingId)
                .catch((error) =>
                    this.logger.error('거절당한 쪽 즉시 재탐색 중 오류', error as Error),
                );
        }

        // 양쪽 다 수락해 결제 단계로 넘어간 경우에만 채워진다.
        // 결제 마감 시한이 걸린 이벤트라 실시간으로 알려야 한다.
        if (result.notifyPaymentPending) {
            /*
             * 상대가 더미라면 결제를 대신 완료해 둔다.
             *
             * 더미는 카카오 계정이 없어 결제창을 띄울 수 없다.
             * 여기서 미리 APPROVED로 만들어 두면, 실제 사용자가 결제를 마치는 순간
             * confirmIfBothPaid가 양쪽 완료를 확인해 매칭이 확정된다.
             *
             * 결제 대기로 넘어온 지금 처리하는 이유는, 수락 직후에 만들면
             * 상대가 거절했을 때 종료된 매칭에 결제만 남기 때문이다.
             */
            await this.dummyPayment.payForDummies(attempt.id);

            void this.notification.sendToMany(
                result.notifyPaymentPending,
                NotificationType.PAYMENT_PENDING,
            );
        }

        return result.attempt;
    }
}