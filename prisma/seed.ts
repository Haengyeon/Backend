import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
    AuthProvider,
    Gender,
    Hobby,
    JobCategory,
    Mbti,
} from '../src/generated/prisma/enums';

// 프로덕션 DB에 실수로 시드가 실행되는 것을 방지
if (process.env.NODE_ENV === 'production') {
    console.error('프로덕션 환경에서는 시드 스크립트를 실행할 수 없습니다.');
    process.exit(1);
}

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const avatarUrl = (seed: string) => `https://i.pravatar.cc/400?u=${seed}`;
const fullBodyUrl = (label: string) =>
    `https://placehold.co/400x800?text=${encodeURIComponent(label)}`;

const TEST_USERS = [
    // ── 남성 4명 ─────────────────────────────────────────
    {
        id: '1',
        profile: {
            name: '김민준',
            birthDate: new Date('1998-05-12'),
            gender: Gender.MALE,
            mbti: Mbti.ENFP,
            introduce: '맛집이랑 사진 찍는 걸 좋아해요.',
            jobCategory: JobCategory.IT_DEVELOPMENT,
            jobPrivate: false,
            hobbies: [Hobby.CAFE, Hobby.FOOD, Hobby.PHOTO],
            profileImageUrl: avatarUrl('male-1'),
            fullBodyImageUrl: fullBodyUrl('민준'),
        },
    },
    {
        id: '2',
        profile: {
            name: '이도윤',
            birthDate: new Date('2000-09-21'),
            gender: Gender.MALE,
            mbti: Mbti.ISTJ,
            introduce: '조용히 걷고 여행하는 걸 좋아합니다.',
            jobCategory: JobCategory.EDUCATION,
            jobPrivate: false,
            hobbies: [Hobby.READING, Hobby.HISTORY, Hobby.EXERCISE],
            profileImageUrl: avatarUrl('male-2'),
            fullBodyImageUrl: fullBodyUrl('도윤'),
        },
    },
    {
        // 거절 시나리오(최대 3회) 테스트용 추가 남성 후보
        id: '3',
        profile: {
            name: '박현우',
            birthDate: new Date('1997-02-03'),
            gender: Gender.MALE,
            mbti: Mbti.ESTP,
            introduce: '액티비티랑 바다 여행 좋아합니다.',
            jobCategory: JobCategory.FINANCE,
            jobPrivate: false,
            hobbies: [Hobby.ACTIVITY, Hobby.SEA, Hobby.EXERCISE],
            profileImageUrl: avatarUrl('male-3'),
            fullBodyImageUrl: fullBodyUrl('현우'),
        },
    },
    {
        // 나이 범위(ageMin/ageMax) 경계값 테스트용 — 연령대가 크게 다른 후보
        id: '4',
        profile: {
            name: '최우진',
            birthDate: new Date('1985-11-30'),
            gender: Gender.MALE,
            mbti: Mbti.INTJ,
            introduce: '역사 유적지 탐방을 좋아합니다.',
            jobCategory: JobCategory.IT_DEVELOPMENT,
            jobPrivate: false,
            hobbies: [Hobby.HISTORY, Hobby.READING, Hobby.IT],
            profileImageUrl: avatarUrl('male-4'),
            fullBodyImageUrl: fullBodyUrl('우진'),
        },
    },

    // ── 여성 4명 ─────────────────────────────────────────
    {
        id: '5',
        profile: {
            name: '장정운',
            birthDate: new Date('1999-03-17'),
            gender: Gender.FEMALE,
            mbti: Mbti.INFJ,
            introduce: '카페와 전시 보러 다니는 걸 좋아해요.',
            jobCategory: JobCategory.DESIGN,
            jobPrivate: false,
            hobbies: [Hobby.CAFE, Hobby.ART, Hobby.EXHIBITION],
            profileImageUrl: avatarUrl('female-1'),
            fullBodyImageUrl: fullBodyUrl('정운'),
        },
    },
    {
        id: '6',
        profile: {
            name: '곽소정',
            birthDate: new Date('2001-11-08'),
            gender: Gender.FEMALE,
            mbti: Mbti.ENFP,
            introduce: '활동적인 여행과 바다를 좋아합니다.',
            jobCategory: JobCategory.MARKETING,
            jobPrivate: false,
            hobbies: [Hobby.ACTIVITY, Hobby.SEA, Hobby.PHOTO],
            profileImageUrl: avatarUrl('female-2'),
            fullBodyImageUrl: fullBodyUrl('소정'),
        },
    },
    {
        // 거절 시나리오(최대 3회) 테스트용 추가 여성 후보
        id: '7',
        profile: {
            name: '한서연',
            birthDate: new Date('1996-07-22'),
            gender: Gender.FEMALE,
            mbti: Mbti.ISFJ,
            introduce: '조용한 힐링 여행을 좋아해요.',
            jobCategory: JobCategory.MEDICAL_HEALTH,
            jobPrivate: false,
            hobbies: [Hobby.READING, Hobby.COOKING, Hobby.MUSIC],
            profileImageUrl: avatarUrl('female-3'),
            fullBodyImageUrl: fullBodyUrl('서연'),
        },
    },
    {
        // 나이 범위 경계값 테스트용 — 연령대가 크게 다른 후보
        id: '8',
        profile: {
            name: '윤아름',
            birthDate: new Date('2003-01-15'),
            gender: Gender.FEMALE,
            mbti: Mbti.ESFP,
            introduce: '사진 명소랑 야경 데이트 좋아해요.',
            jobCategory: JobCategory.STUDENT,
            jobPrivate: false,
            hobbies: [Hobby.PHOTO, Hobby.MOVIE, Hobby.MUSIC],
            profileImageUrl: avatarUrl('female-4'),
            fullBodyImageUrl: fullBodyUrl('아름'),
        },
    },
];

async function main() {
    for (const testUser of TEST_USERS) {
        // isDummy를 켜야 POST /auth/dev-token으로 토큰을 발급받을 수 있다
        await prisma.user.upsert({
            where: {
                id: testUser.id,
            },
            update: {
                isDummy: true,
            },
            create: {
                id: testUser.id,
                isDummy: true,
            },
        });

        // 카카오 계정은 없지만, 토큰 발급 시 refreshTokenHash를 저장할 곳이 필요해서 함께 만든다
        await prisma.auth.upsert({
            where: {
                userId: testUser.id,
            },
            update: {},
            create: {
                userId: testUser.id,
                provider: AuthProvider.KAKAO,
                kakaoId: `dummy-${testUser.id}`,
            },
        });

        await prisma.profile.upsert({
            where: {
                userId: testUser.id,
            },
            update: testUser.profile,
            create: {
                userId: testUser.id,
                ...testUser.profile,
            },
        });
    }

    console.log(`테스트 사용자 ${TEST_USERS.length}명 생성 완료`);

    const males = TEST_USERS.filter((u) => u.profile.gender === Gender.MALE);
    const females = TEST_USERS.filter(
        (u) => u.profile.gender === Gender.FEMALE,
    );

    console.log(`
남성 (${males.length}명)
${males.map((u) => `- ${u.profile.name}: ${u.id}`).join('\n')}

여성 (${females.length}명)
${females.map((u) => `- ${u.profile.name}: ${u.id}`).join('\n')}
  `);
}

main()
    .catch((error) => {
        console.error('생성 실패');
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });