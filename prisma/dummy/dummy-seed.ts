import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/generated/prisma/client';
import {
    AuthProvider,
    UserStatus,
} from '../../src/generated/prisma/enums';

import { DUMMY_USERS } from './dummy-users';

/**
 * production에서 실수로 더미를 넣는 것을 방지.
 *
 * 로컬: 그냥 실행 가능
 * production: DEMO_MATCHING_ENABLED=true일 때만 실행 가능
 */
if (
    process.env.NODE_ENV === 'production' &&
    process.env.DEMO_MATCHING_ENABLED !== 'true'
) {
    console.error(
        'production에서는 DEMO_MATCHING_ENABLED=true일 때만 더미 시드를 실행할 수 있습니다.',
    );

    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL이 설정되어 있지 않습니다.');
    process.exit(1);
}

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
    adapter,
});

async function main() {
    console.log(
        `더미 사용자 ${DUMMY_USERS.length}명 시드 시작`,
    );

    let created = 0;

    for (const dummy of DUMMY_USERS) {
        await prisma.$transaction(async (tx) => {
            /*
             * User
             *
             * 이미 존재하면 더미 여부 / 상태만 정상화한다.
             */
            await tx.user.upsert({
                where: {
                    id: dummy.id,
                },

                update: {
                    isDummy: true,
                    status: UserStatus.ACTIVE,
                    deletedAt: null,
                },

                create: {
                    id: dummy.id,
                    isDummy: true,
                    status: UserStatus.ACTIVE,
                },
            });

            /*
             * Auth
             *
             * 실제 카카오 계정이 아니므로 kakaoId는
             * 내부 더미용 고유 문자열을 사용한다.
             */
            await tx.auth.upsert({
                where: {
                    userId: dummy.id,
                },

                update: {
                    provider: AuthProvider.KAKAO,
                    kakaoId: `dummy-${dummy.id}`,
                    refreshTokenHash: null,
                },

                create: {
                    userId: dummy.id,
                    provider: AuthProvider.KAKAO,
                    kakaoId: `dummy-${dummy.id}`,
                },
            });

            /*
             * Profile
             *
             * dummy-users.ts 내용을 그대로 덮어쓴다.
             *
             * 나중에 캐릭터 이미지 URL을 수정하고
             * seed:dummy를 다시 실행하면 DB에도 반영된다.
             */
            await tx.profile.upsert({
                where: {
                    userId: dummy.id,
                },

                update: {
                    name: dummy.profile.name,
                    birthDate: dummy.profile.birthDate,
                    gender: dummy.profile.gender,
                    mbti: dummy.profile.mbti,
                    introduce: dummy.profile.introduce,
                    jobCategory:
                    dummy.profile.jobCategory,
                    jobPrivate:
                    dummy.profile.jobPrivate,
                    hobbies: dummy.profile.hobbies,
                    profileImageUrl:
                    dummy.profile.profileImageUrl,
                    fullBodyImageUrl:
                    dummy.profile.fullBodyImageUrl,
                },

                create: {
                    userId: dummy.id,

                    name: dummy.profile.name,
                    birthDate: dummy.profile.birthDate,
                    gender: dummy.profile.gender,
                    mbti: dummy.profile.mbti,
                    introduce: dummy.profile.introduce,
                    jobCategory:
                    dummy.profile.jobCategory,
                    jobPrivate:
                    dummy.profile.jobPrivate,
                    hobbies: dummy.profile.hobbies,
                    profileImageUrl:
                    dummy.profile.profileImageUrl,
                    fullBodyImageUrl:
                    dummy.profile.fullBodyImageUrl,
                },
            });
        });

        created++;

        if (
            created % 10 === 0 ||
            created === DUMMY_USERS.length
        ) {
            console.log(
                `더미 사용자 처리 ${created}/${DUMMY_USERS.length}`,
            );
        }
    }

    const count = await prisma.user.count({
        where: {
            isDummy: true,
            deletedAt: null,
        },
    });

    console.log('────────────────────────────');
    console.log('더미 시드 완료');
    console.log(`이번 처리: ${created}명`);
    console.log(`현재 활성 더미: ${count}명`);
    console.log('────────────────────────────');
}

main()
    .catch((error) => {
        console.error('더미 시드 실패');
        console.error(error);

        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });