import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { MatchingStatus, PreferredGender } from '../../generated/prisma/enums';
import type { CourseTheme } from '../../generated/prisma/enums';

const RESPOND_WINDOW_MS = 12 * 60 * 60 * 1000; // 12시간 이내 미응답 시 취소 (정책 확정값)

//조건 완화 단계: 위에서부터 순서대로 시도하고, 후보가 1명이라도 나오면 그 단계에서 멈춘다.
//
// 항상 필수(완화 대상 아님):
//   - region 완전 일치 (도 단위 선택이라 이동거리 계산은 아직 미적용 — 추후 시/군 단위로 세분화되면 도입)
//   - availableDates 겹침 최소 1일
//   - preferredGender 상호조건
//
// 아래 수치는 초기 추정치 — 실제 매칭 성사율 보면서 튜닝 필요.
const RELAX_STAGES = [
    // 0단계: 테마가 겹치는 후보만
    { label: 'strict', minThemeOverlap: 1, requireHobbyOverlap: false, ageBufferYears: 0 },
    // 1단계: 테마는 안 겹쳐도 되지만, 프로필 취향(hobbies)이 겹치면 대체 신호로 인정
    { label: 'relax-theme-use-hobby', minThemeOverlap: 0, requireHobbyOverlap: true, ageBufferYears: 0 },
    // 2단계: 테마/취향 조건 없이 나이 범위만 살짝 완화
    { label: 'relax-age', minThemeOverlap: 0, requireHobbyOverlap: false, ageBufferYears: 3 },
    // 3단계: 최후 수단 — 나이 범위 크게 완화
    { label: 'last-resort', minThemeOverlap: 0, requireHobbyOverlap: false, ageBufferYears: 5 },
] as const;

const matchingInclude = {
    availableDates: true,
    user: { include: { profile: true } },
} as const;

// Prisma 커스텀 제너레이터의 정확한 타입 export 경로가 불확실해서,
// Prisma.XGetPayload에 의존하지 않고 실제 쿼리 반환값에서 타입을 추론하는 방식 사용.
function findMatchingWithRelations(prisma: PrismaService, id: string) {
    return prisma.matching.findUnique({ where: { id }, include: matchingInclude });
}

type MatchingWithRelations = NonNullable<
    Awaited<ReturnType<typeof findMatchingWithRelations>>
>;

@Injectable()
export class MatchingEngineService {
    private readonly logger = new Logger(MatchingEngineService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * 조건에 맞는 후보를 찾아 MatchAttempt를 생성한다.
     * 후보가 없으면 null을 반환하고, Matching은 SEARCHING 상태로 유지된다.
     */
    async tryMatch(matchingId: string) {
        const matching = await findMatchingWithRelations(this.prisma, matchingId);
        if (!matching || matching.status !== MatchingStatus.SEARCHING) return null;
        if (!matching.user.profile) return null; // 생성 시점에 이미 검증되므로 이론상 도달 불가(방어코드)

        const myAge = this.calcAge(matching.user.profile.birthDate);
        const myDates = new Set(
            matching.availableDates.map((d) => d.date.toISOString().slice(0, 10)),
        );

        for (const stage of RELAX_STAGES) {
            const pool = await this.prisma.matching.findMany({
                where: {
                    id: { not: matching.id },
                    userId: { not: matching.userId },
                    status: MatchingStatus.SEARCHING,
                    endedAt: null,
                    region: matching.region, // 도 단위 완전 일치 (항상 필수)
                },
                include: matchingInclude,
            });

            const eligible = pool.filter((candidate) =>
                this.isEligible(matching, myAge, myDates, candidate, stage),
            );

            if (eligible.length === 0) continue;

            for (const candidate of this.rankCandidates(matching, eligible)) {
                const attempt = await this.createAttempt(matching, candidate);
                if (attempt) {
                    this.logger.log(
                        `MatchAttempt 생성 (stage=${stage.label}): ${matching.id} <-> ${candidate.id}`,
                    );
                    return attempt;
                }
                // 이 후보는 동시에 다른 시도에 선점됨 -> 같은 단계의 다음 후보 시도
            }
            // 이 단계의 모든 후보가 선점됨 -> 다음 완화 단계로
        }

        return null;
    }

    private isEligible(
        matching: MatchingWithRelations,
        myAge: number,
        myDates: Set<string>,
        candidate: MatchingWithRelations,
        stage: (typeof RELAX_STAGES)[number],
    ): boolean {
        if (!candidate.user.profile) return false;

        // 성별 선호 상호 체크 (항상 필수)
        if (
            matching.preferredGender !== PreferredGender.ANY &&
            matching.preferredGender !== candidate.user.profile.gender
        ) {
            return false;
        }
        if (
            candidate.preferredGender !== PreferredGender.ANY &&
            candidate.preferredGender !== matching.user.profile!.gender
        ) {
            return false;
        }

        // 가능 날짜 겹침 (항상 필수)
        const hasOverlapDate = candidate.availableDates.some((d) =>
            myDates.has(d.date.toISOString().slice(0, 10)),
        );
        if (!hasOverlapDate) return false;

        // 나이 (상호, 단계별 버퍼). 완화 단계라도 20세 미만까지 내려가지 않도록 하한선 고정
        // (DTO에서 ageMin >= 20을 강제하지만, 버퍼를 그대로 빼면 last-resort 단계에서
        //  20 - 5 = 15세까지 후보로 잡힐 수 있어서 별도로 막아둔 것)
        const MIN_ALLOWED_AGE = 20;
        const candidateAge = this.calcAge(candidate.user.profile.birthDate);
        const iFitTheirRange =
            myAge >= Math.max(MIN_ALLOWED_AGE, candidate.ageMin - stage.ageBufferYears) &&
            myAge <= candidate.ageMax + stage.ageBufferYears;
        const theyFitMyRange =
            candidateAge >= Math.max(MIN_ALLOWED_AGE, matching.ageMin - stage.ageBufferYears) &&
            candidateAge <= matching.ageMax + stage.ageBufferYears;
        if (!iFitTheirRange || !theyFitMyRange) return false;

        // 테마 겹침 (단계별 최소 개수)
        const themeOverlap = matching.themes.filter((t) =>
            candidate.themes.includes(t),
        ).length;
        if (themeOverlap < stage.minThemeOverlap) return false;

        // 테마가 안 겹쳐도 되는 단계에서는, 대신 취향(hobbies) 겹침을 요구
        if (stage.requireHobbyOverlap) {
            const hobbyOverlap = matching.user.profile!.hobbies.filter((h) =>
                candidate.user.profile.hobbies.includes(h),
            ).length;
            if (hobbyOverlap === 0) return false;
        }

        return true;
    }

    // 테마 겹침을 우선, 취향(hobbies) 겹침을 보조 기준으로 정렬하고,
    // 완전 동점 그룹은 랜덤 셔플(로테이션 다양성 확보)
    private rankCandidates(
        matching: MatchingWithRelations,
        eligible: MatchingWithRelations[],
    ): MatchingWithRelations[] {
        const groups = new Map<number, MatchingWithRelations[]>();
        for (const candidate of eligible) {
            const themeOverlap = matching.themes.filter((t) =>
                candidate.themes.includes(t),
            ).length;
            const hobbyOverlap = matching.user.profile!.hobbies.filter((h) =>
                candidate.user.profile!.hobbies.includes(h),
            ).length;
            const score = themeOverlap * 10 + hobbyOverlap; // 테마를 취향보다 높게 가중

            const group = groups.get(score) ?? [];
            group.push(candidate);
            groups.set(score, group);
        }

        const ranked: MatchingWithRelations[] = [];
        for (const score of [...groups.keys()].sort((a, b) => b - a)) {
            const group = groups.get(score)!;
            this.shuffle(group);
            ranked.push(...group);
        }
        return ranked;
    }

    private shuffle<T>(arr: T[]): void {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    private async createAttempt(
        matching: MatchingWithRelations,
        candidate: MatchingWithRelations,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                // 낙관적 락: 두 Matching이 여전히 SEARCHING일 때만 진행 (동시 매칭 방지)
                const lockA = await tx.matching.updateMany({
                    where: { id: matching.id, status: MatchingStatus.SEARCHING },
                    data: { status: MatchingStatus.WAITING_RESPONSE },
                });
                const lockB = await tx.matching.updateMany({
                    where: { id: candidate.id, status: MatchingStatus.SEARCHING },
                    data: { status: MatchingStatus.WAITING_RESPONSE },
                });

                if (lockA.count === 0 || lockB.count === 0) {
                    throw new Error('CANDIDATE_ALREADY_LOCKED');
                }

                return tx.matchAttempt.create({
                    data: {
                        matchingAId: matching.id,
                        matchingBId: candidate.id,
                        region: matching.region,
                        theme: this.pickSharedTheme(matching, candidate),
                        travelDate: this.pickSharedDate(matching, candidate),
                        respondDeadlineAt: new Date(Date.now() + RESPOND_WINDOW_MS),
                    },
                });
            });
        } catch (error) {
            if (error instanceof Error && error.message === 'CANDIDATE_ALREADY_LOCKED') {
                return null;
            }
            throw error;
        }
    }

    // 겹치는 날짜 중 가장 빠른 날짜로 확정
    private pickSharedDate(
        matching: MatchingWithRelations,
        candidate: MatchingWithRelations,
    ): Date {
        const myDates = new Set(
            matching.availableDates.map((d) => d.date.toISOString().slice(0, 10)),
        );
        const shared = candidate.availableDates
            .filter((d) => myDates.has(d.date.toISOString().slice(0, 10)))
            .map((d) => d.date)
            .sort((a, b) => a.getTime() - b.getTime());

        return shared[0];
    }

    // 겹치는 테마 중 하나 선택, 겹침이 없으면(취향 기반으로 매칭된 경우) 내 첫 테마로 대체
    private pickSharedTheme(
        matching: MatchingWithRelations,
        candidate: MatchingWithRelations,
    ): CourseTheme {
        const shared = matching.themes.find((t) => candidate.themes.includes(t));
        return shared ?? matching.themes[0];
    }

    private calcAge(birthDate: Date, at: Date = new Date()): number {
        let age = at.getFullYear() - birthDate.getFullYear();
        const beforeBirthday =
            at.getMonth() < birthDate.getMonth() ||
            (at.getMonth() === birthDate.getMonth() && at.getDate() < birthDate.getDate());
        if (beforeBirthday) age -= 1;
        return age;
    }
}