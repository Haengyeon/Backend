import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { MatchingEngineService } from '../service/matching-engine.service';
import { MatchAttemptService } from '../service/match-attempt.service';

import {
    Gender,
    MatchDecision,
    MatchingStatus,
    PreferredGender,
    UserStatus,
} from '../../generated/prisma/enums';

import { calcAge } from '../../common/age.util';

const REGION_WEIGHTS: Record<number, number[]> = {
    1: [100],
    2: [60, 40],
    3: [45, 35, 20],
    4: [40, 28, 20, 12],
    5: [35, 25, 18, 13, 9],
};

@Injectable()
export class DummyMatchingService {
    private readonly logger = new Logger(DummyMatchingService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly matchingEngine: MatchingEngineService,
        private readonly matchAttemptService: MatchAttemptService,
    ) {}

    async tryFallback(matchingId: string) {
        if (process.env.DEMO_MATCHING_ENABLED !== 'true') {
            return null;
        }

        const matching = await this.prisma.matching.findUnique({
            where: { id: matchingId },
            include: {
                regionPreferences: {
                    orderBy: { priority: 'asc' },
                },
                availableDates: {
                    orderBy: { date: 'asc' },
                },
                user: {
                    include: {
                        profile: true,
                    },
                },
            },
        });

        if (!matching) return null;

        if (matching.status !== MatchingStatus.SEARCHING) {
            return null;
        }

        if (!matching.user.profile) {
            return null;
        }

        const candidates = await this.prisma.user.findMany({
            where: {
                isDummy: true,
                status: UserStatus.ACTIVE,
                deletedAt: null,
                id: {
                    not: matching.userId,
                },

                // 1차 필터.
                // 동시 요청은 아래 transaction + advisory lock에서 다시 검사한다.
                matchings: {
                    none: {
                        endedAt: null,
                    },
                },
            },
            include: {
                profile: true,
            },
        });

        const eligible = candidates.filter((dummy) => {
            if (!dummy.profile) return false;

            const dummyAge = calcAge(dummy.profile.birthDate);

            if (
                dummyAge < matching.ageMin ||
                dummyAge > matching.ageMax
            ) {
                return false;
            }

            return this.matchesPreferredGender(
                matching.preferredGender,
                dummy.profile.gender,
            );
        });

        this.shuffle(eligible);

        for (const dummy of eligible) {
            if (!dummy.profile) continue;

            const dummyMatchingId = await this.createDummyMatchingSafely(
                dummy.id,
                matching,
            );

            // 다른 요청이 같은 더미를 먼저 가져갔다.
            if (!dummyMatchingId) {
                continue;
            }

            try {
                const attempt = await this.matchingEngine.tryMatch(
                    matching.id,
                );

                if (!attempt) {
                    // 더미 Matching은 만들었는데 예상과 달리 매칭이 실패했다.
                    // 놀고 있는 SEARCHING 더미를 남기지 않는다.
                    await this.closeUnusedDummyMatching(dummyMatchingId);

                    continue;
                }

                /*
                 * 더미는 사용자 입력을 기다릴 수 없으므로 자동 수락.
                 *
                 * 실제 사용자는 화면에서 상대 프로필을 확인한 뒤
                 * 직접 수락/거절한다.
                 */
                await this.matchAttemptService.respond(
                    dummy.id,
                    attempt.id,
                    {
                        decision: MatchDecision.ACCEPTED,
                    },
                );

                this.logger.log(
                    `더미 fallback 매칭 성공: user=${matching.userId}, dummy=${dummy.id}, attempt=${attempt.id}`,
                );

                return attempt;
            } catch (error) {
                await this.closeUnusedDummyMatching(dummyMatchingId);

                this.logger.warn(
                    `더미 fallback 후보 실패 dummy=${dummy.id}: ${
                        error instanceof Error
                            ? error.message
                            : String(error)
                    }`,
                );
            }
        }

        this.logger.warn(
            `사용 가능한 더미 매칭 후보 없음: matching=${matchingId}`,
        );

        return null;
    }

    /**
     * 같은 더미가 동시에 두 사용자에게 할당되지 않도록 한다.
     *
     * 후보 조회 시 matchings.none만으로는 동시 요청을 막을 수 없다.
     *
     * PostgreSQL advisory transaction lock을 더미 userId 기준으로 잡은 뒤
     * 활성 Matching 존재 여부를 다시 검사한다.
     */
    private async createDummyMatchingSafely(
        dummyUserId: string,
        sourceMatching: {
            userId: string;
            regionPreferences: Array<{
                region: any;
                sigunguCode: string;
                priority: number;
            }>;
            availableDates: Array<{
                date: Date;
            }>;
            themes: any[];
            user: {
                profile: {
                    birthDate: Date;
                    gender: Gender;
                } | null;
            };
        },
    ): Promise<string | null> {
        if (!sourceMatching.user.profile) {
            return null;
        }

        const selectedRegion = this.pickWeightedRegion(
            sourceMatching.regionPreferences,
        );

        if (!selectedRegion) {
            return null;
        }

        const selectedDate =
            sourceMatching.availableDates[
                Math.floor(
                    Math.random() *
                    sourceMatching.availableDates.length,
                )
                ];

        if (!selectedDate) {
            return null;
        }

        const selectedTheme =
            sourceMatching.themes[
                Math.floor(
                    Math.random() *
                    sourceMatching.themes.length,
                )
                ];

        if (!selectedTheme) {
            return null;
        }

        const realUserAge = calcAge(
            sourceMatching.user.profile.birthDate,
        );

        return this.prisma.$transaction(async (tx) => {
            /*
             * 같은 dummyUserId를 고른 다른 transaction이 있다면
             * 해당 transaction이 끝날 때까지 여기서 대기한다.
             *
             * VM 한 대뿐 아니라 서버가 여러 인스턴스로 늘어나도
             * DB가 lock을 관리하기 때문에 유효하다.
             */
            await tx.$executeRaw`
                SELECT pg_advisory_xact_lock(
                    hashtext(${dummyUserId})::bigint
                )
            `;

            // lock 획득 후 반드시 다시 확인.
            const activeMatching =
                await tx.matching.findFirst({
                    where: {
                        userId: dummyUserId,
                        endedAt: null,
                    },
                    select: {
                        id: true,
                    },
                });

            if (activeMatching) {
                return null;
            }

            const created = await tx.matching.create({
                data: {
                    userId: dummyUserId,

                    /*
                     * 실제 사용자의 나이를 정확히 포함시키면 된다.
                     * 더미의 나이는 이미 실제 사용자의 희망 나이 범위로
                     * 필터링했다.
                     */
                    ageMin: Math.max(20, realUserAge),
                    ageMax: Math.max(20, realUserAge),

                    preferredGender: this.preferredGenderFor(
                        sourceMatching.user.profile.gender,
                    ),

                    // 공통 테마가 반드시 하나 존재하게 만든다.
                    themes: [selectedTheme],

                    // 가중 랜덤으로 뽑은 지역 딱 하나만 넣는다.
                    regionPreferences: {
                        create: [
                            {
                                region: selectedRegion.region,
                                sigunguCode:
                                selectedRegion.sigunguCode,
                                priority: 1,
                            },
                        ],
                    },

                    // 실제 사용자와 반드시 날짜가 겹친다.
                    availableDates: {
                        create: [
                            {
                                date: selectedDate.date,
                            },
                        ],
                    },
                },
            });

            return created.id;
        });
    }

    private pickWeightedRegion<T>(
        preferences: T[],
    ): T | null {
        if (preferences.length === 0) {
            return null;
        }

        const weights = REGION_WEIGHTS[preferences.length];

        if (!weights) {
            return preferences[0];
        }

        const random = Math.random() * 100;

        let accumulated = 0;

        for (let i = 0; i < weights.length; i++) {
            accumulated += weights[i];

            if (random < accumulated) {
                return preferences[i];
            }
        }

        return preferences[preferences.length - 1];
    }

    private matchesPreferredGender(
        preferredGender: PreferredGender,
        candidateGender: Gender,
    ) {
        if (preferredGender === PreferredGender.ANY) {
            return true;
        }

        if (
            preferredGender === PreferredGender.MALE &&
            candidateGender === Gender.MALE
        ) {
            return true;
        }

        return (
            preferredGender === PreferredGender.FEMALE &&
            candidateGender === Gender.FEMALE
        );
    }

    private preferredGenderFor(
        gender: Gender,
    ): PreferredGender {
        switch (gender) {
            case Gender.MALE:
                return PreferredGender.MALE;

            case Gender.FEMALE:
                return PreferredGender.FEMALE;

            default:
                return PreferredGender.ANY;
        }
    }

    private async closeUnusedDummyMatching(
        matchingId: string,
    ) {
        await this.prisma.matching.updateMany({
            where: {
                id: matchingId,
                endedAt: null,
                status: {
                    in: [
                        MatchingStatus.SEARCHING,
                        MatchingStatus.RETRY_READY,
                    ],
                },
            },
            data: {
                status: MatchingStatus.CANCELLED,
                endedAt: new Date(),
            },
        });
    }

    private shuffle<T>(items: T[]) {
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(
                Math.random() * (i + 1),
            );

            [items[i], items[j]] = [
                items[j],
                items[i],
            ];
        }
    }
}