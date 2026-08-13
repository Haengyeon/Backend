import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
    Gender,
    Hobby,
    JobCategory,
    Mbti,
} from '../src/generated/prisma/enums';

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const TEST_USERS = [
    {
        id: '00000000-0000-0000-0000-000000000001',
        profile: {
            name: '김민준',
            nickname: '민준',
            birthDate: new Date('1998-05-12'),
            gender: Gender.MALE,
            mbti: Mbti.ENFP,
            introduce: '맛집이랑 사진 찍는 걸 좋아해요.',
            jobCategory: JobCategory.IT_DEVELOPMENT,
            jobPrivate: false,
            hobbies: [Hobby.CAFE, Hobby.FOOD, Hobby.PHOTO],
            profileImageUrl: 'https://example.com/test/male-1-profile.jpg',
            fullBodyImageUrl: 'https://example.com/test/male-1-full.jpg',
        },
    },

    {
        id: '00000000-0000-0000-0000-000000000002',
        profile: {
            name: '이도윤',
            nickname: '도윤',
            birthDate: new Date('2000-09-21'),
            gender: Gender.MALE,
            mbti: Mbti.ISTJ,
            introduce: '조용히 걷고 여행하는 걸 좋아합니다.',
            jobCategory: JobCategory.EDUCATION,
            jobPrivate: false,
            hobbies: [Hobby.READING, Hobby.HISTORY, Hobby.EXERCISE],
            profileImageUrl: 'https://example.com/test/male-2-profile.jpg',
            fullBodyImageUrl: 'https://example.com/test/male-2-full.jpg',
        },
    },

    {
        id: '00000000-0000-0000-0000-000000000003',
        profile: {
            name: '장정운',
            nickname: '짱정운',
            birthDate: new Date('1999-03-17'),
            gender: Gender.FEMALE,
            mbti: Mbti.INFJ,
            introduce: '카페와 전시 보러 다니는 걸 좋아해요.',
            jobCategory: JobCategory.DESIGN,
            jobPrivate: false,
            hobbies: [Hobby.CAFE, Hobby.ART, Hobby.EXHIBITION],
            profileImageUrl: 'https://i.namu.wiki/i/pkZHxKazZl0Q9udUhSpnfvvECUpQSbTAMSerVtlqDeRGqPKa9LfxSh-6qLfu1khFn1NA5jlxiIhFURhmewIpjQ.webp',
            fullBodyImageUrl: 'https://cdn.imweb.me/thumbnail/20230228/25687782da912.png',
        },
    },

    {
        id: '00000000-0000-0000-0000-000000000004',
        profile: {
            name: '곽소정',
            nickname: '소정소중해',
            birthDate: new Date('2001-11-08'),
            gender: Gender.FEMALE,
            mbti: Mbti.ENFP,
            introduce: '활동적인 여행과 바다를 좋아합니다.',
            jobCategory: JobCategory.MARKETING,
            jobPrivate: false,
            hobbies: [Hobby.ACTIVITY, Hobby.SEA, Hobby.PHOTO],
            profileImageUrl: 'https://i.pinimg.com/236x/d4/b2/b3/d4b2b3988e069b242d5a27a615edbca3.jpg',
            fullBodyImageUrl: 'https://i.namu.wiki/i/jtQmllGb5XztKurgXD3gIH-o874OJN_LrCr37LiIhB6zhWKhWOR6Fy-VeBWtTlJtRXnvfgNkoBq4x__gGM6F6w.webp',
        },
    },
];

async function main() {
    for (const testUser of TEST_USERS) {
        await prisma.user.upsert({
            where: {
                id: testUser.id,
            },
            update: {},
            create: {
                id: testUser.id,
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

    console.log('테스트 사용자 4명 생성 완료');

    console.log(`
남성
- 민준: ${TEST_USERS[0].id}
- 도윤: ${TEST_USERS[1].id}

여성
- 정운: ${TEST_USERS[2].id}
- 소정: ${TEST_USERS[3].id}
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