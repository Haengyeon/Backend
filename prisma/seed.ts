import 'dotenv/config';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import {
    AuthProvider,
    CourseTheme,
    Gender,
    Hobby,
    JobCategory,
    MatchAttemptStatus,
    MatchDecision,
    MatchingStatus,
    Mbti,
    PaymentStatus,
    PreferredGender,
    Region,
} from '../src/generated/prisma/enums';
import { PrismaModule } from '../src/prisma/prisma.module';
import { MatchingModule } from '../src/matching/matching.module';
import { ChatModule } from '../src/chat/chat.module';
import { MatchingService } from '../src/matching/service/matching.service';
import { MatchAttemptService } from '../src/matching/service/match-attempt.service';
import { ChatRoomService } from '../src/chat/service/chat-room.service';
import { CourseGeneratorService } from '../src/course/algorithm/course-generator.service';
import { TourApiClient } from '../src/course/algorithm/tour-api.client';
import { CourseScheduleService } from '../src/course/service/course-schedule.service';
import { CourseCompletionService } from '../src/course/service/course-completion.service';
import { CourseAccessService } from '../src/course/service/course-access.service';
import { CourseRewardService } from '../src/course/service/course-reward.service';
import { PrismaService } from '../src/prisma/prisma.service';

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

/**
 * 위 8명처럼 한 명씩 풀어 쓰면 10명을 더 넣을 때 200줄이 된다.
 * 매칭 조건에 실제로 쓰이는 값(생년월일·성별·취미)만 인자로 받고
 * 나머지는 같은 규칙으로 채운다. 배열에 ...으로 펼쳐 넣는다.
 */
function localUser(
    id: string,
    name: string,
    birth: string,
    gender: Gender,
    mbti: Mbti,
    jobCategory: JobCategory,
    hobbies: Hobby[],
    introduce: string,
) {
    return [
        {
            id,
            profile: {
                name,
                birthDate: new Date(birth),
                gender,
                mbti,
                introduce,
                jobCategory,
                jobPrivate: false,
                hobbies,
                profileImageUrl: avatarUrl(`local-${id}`),
                fullBodyImageUrl: fullBodyUrl(name),
            },
        },
    ];
}

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

    // ── 지방 코스 확인용 10명 (5팀) ──────────────────────
    // 서울·수도권은 TourAPI 데이터가 넉넉해서 코스가 잘 나오지만 지방은 다르다.
    // 실제로 "지방에서 코스가 흩어지는" 문제를 고친 이력이 있어서, 지역을 갈라
    // 팀을 붙여 두면 회귀가 바로 눈에 띈다.
    ...localUser('9', '오지호', '1995-04-18', Gender.MALE, Mbti.ENTP, JobCategory.IT_DEVELOPMENT, [Hobby.SEA, Hobby.PHOTO, Hobby.ACTIVITY], '바다 보러 다니는 게 취미예요.'),
    ...localUser('10', '신재현', '1994-08-02', Gender.MALE, Mbti.ISFP, JobCategory.SERVICE, [Hobby.FOOD, Hobby.COOKING, Hobby.CAFE], '지역 맛집 찾아다닙니다.'),
    ...localUser('11', '배준영', '1999-12-11', Gender.MALE, Mbti.INFP, JobCategory.EDUCATION, [Hobby.HISTORY, Hobby.READING, Hobby.EXHIBITION], '오래된 동네 걷는 걸 좋아해요.'),
    ...localUser('12', '임태균', '1993-06-25', Gender.MALE, Mbti.ESTJ, JobCategory.FINANCE, [Hobby.EXERCISE, Hobby.ACTIVITY, Hobby.ANIMAL], '몸 쓰는 여행이 좋습니다.'),
    ...localUser('13', '노시윤', '2002-02-14', Gender.MALE, Mbti.ENFJ, JobCategory.DESIGN, [Hobby.ART, Hobby.MUSIC, Hobby.MOVIE], '전시랑 공연 보러 다녀요.'),

    ...localUser('14', '유하린', '1997-09-30', Gender.FEMALE, Mbti.ESFJ, JobCategory.MARKETING, [Hobby.SEA, Hobby.PHOTO, Hobby.CAFE], '사진 찍기 좋은 바다를 찾아요.'),
    ...localUser('15', '서지안', '1996-03-07', Gender.FEMALE, Mbti.INTP, JobCategory.MEDICAL_HEALTH, [Hobby.FOOD, Hobby.COOKING, Hobby.MUSIC], '시장 구경하는 걸 제일 좋아해요.'),
    ...localUser('16', '강예린', '2000-11-19', Gender.FEMALE, Mbti.ISTP, JobCategory.STUDENT, [Hobby.HISTORY, Hobby.READING, Hobby.ART], '고즈넉한 곳을 좋아합니다.'),
    ...localUser('17', '조민서', '1998-07-05', Gender.FEMALE, Mbti.ESTP, JobCategory.IT_DEVELOPMENT, [Hobby.EXERCISE, Hobby.ACTIVITY, Hobby.ANIMAL], '가만히 못 있는 편이에요.'),
    ...localUser('18', '백가온', '2001-05-23', Gender.FEMALE, Mbti.INFJ, JobCategory.DESIGN, [Hobby.ART, Hobby.EXHIBITION, Hobby.MOVIE], '감성적인 곳 찾아다녀요.'),
];

// ── 매칭 플로우 시드 ──────────────────────────────────────
//
// 행을 손으로 꽂아 넣지 않고 실제 서비스를 호출해서 매칭을 진행시킨다.
// 그래야 시드가 만든 데이터가 앱이 실제로 만드는 데이터와 같은 모양이 되고,
// 매칭 알고리즘이 바뀌면 시드에서 바로 티가 난다.
//
// 실제 로직을 타는 구간
//   MatchingService.create()          조건 저장 + 즉시 후보 탐색
//   MatchingEngineService.tryMatch()  알고리즘이 상대를 고른다 (create가 안에서 호출)
//   MatchAttemptService.respond()     수락/거절, 양쪽 수락 시 PAYMENT_PENDING 전이
//   ChatRoomService.createForConfirmedAttempt()
//
// 흉내만 내는 구간
//   결제 - 카카오페이 서버를 불러야 해서 시드에서는 불가능하다.
//          Payment를 APPROVED로 직접 넣어 결제가 끝난 상태를 만든다.
//   코스 - TourAPI 호출이 필요해서 넣지 않는다.
//          코스가 있어야 하면 POST /api/v1/courses/regenerate로 만든다.
//
// 카카오 로그인도 마찬가지로 시드에서 재현할 수 없다. 카카오 서버가 실제
// 계정에 발급하는 인가 코드가 필요하기 때문이다. 대신 Auth 행을 provider=KAKAO로
// 만들어 두고, 토큰은 POST /api/v1/auth/dev-token으로 받는다.

@Module({
    // AppModule도 CourseModule도 통째로 가져오지 않는다. CourseController가
    // upload.config -> multer를 끌어오는데, 시드에는 HTTP 계층도 파일 업로드도
    // 필요 없다. 그래서 코스 쪽은 필요한 프로바이더만 직접 나열한다.
    imports: [PrismaModule, MatchingModule, ChatModule],
    providers: [
        CourseGeneratorService,
        TourApiClient,
        CourseScheduleService,
        CourseCompletionService,
        CourseAccessService,
        CourseRewardService,
    ],
})
class SeedModule {}

const TEAMS = [
    // ── 날짜별 시나리오 4팀 ──────────────────────────────
    // 지역을 전부 지방으로 잡았다. 서울만 있으면 코스가 잘 나오는 게 당연해서
    // 화면 확인용으로는 되지만 알고리즘 확인용으로는 못 쓴다.
    {
        label: '팀 1 — 오늘 만남 (D-Day)',
        // 지역을 팀마다 갈라 둬야 알고리즘이 짝을 섞지 않는다.
        // 겹치면 민준이 다른 팀 여자와 붙을 수도 있다.
        region: Region.GANGWON,
        male: '1', // 김민준 28
        female: '5', // 장정운 27
        themes: [CourseTheme.NATURE_HEALING, CourseTheme.PHOTO_SPOT],
        dayOffset: 0,
    },
    {
        label: '팀 2 — 내일 만남 (D-1)',
        region: Region.JEONBUK,
        male: '2', // 이도윤 25
        female: '6', // 곽소정 24
        themes: [CourseTheme.LOCAL_FOOD_MARKET, CourseTheme.HISTORY_CULTURE],
        dayOffset: 1,
    },
    {
        label: '팀 3 — 이미 다녀옴 (완료)',
        region: Region.GYEONGNAM,
        male: '3', // 박현우 29
        female: '7', // 한서연 30
        themes: [CourseTheme.WALKING_TRIP, CourseTheme.NATURE_HEALING],
        dayOffset: -5,
    },
    {
        label: '팀 4 — 3일 뒤 만남 (D-3)',
        region: Region.CHUNGNAM,
        male: '4', // 최우진 40
        female: '8', // 윤아름 23
        themes: [CourseTheme.HISTORY_CULTURE, CourseTheme.ART_SENSIBILITY],
        dayOffset: 3,
    },

    // ── 지방 코스 확인용 5팀 (전부 오늘 출발) ─────────────
    // 다섯 팀 다 오늘이라 로그인하면 바로 코스가 열려 있다.
    // 섬이 많거나(전남·제주) 시가지가 흩어진 지역을 일부러 골랐다 —
    // 코스가 흩어지는 문제는 이런 데서 난다.
    {
        label: '팀 5 — 제주 (오늘)',
        region: Region.JEJU,
        male: '9', // 오지호 31
        female: '14', // 유하린 28
        themes: [CourseTheme.NATURE_HEALING, CourseTheme.PHOTO_SPOT],
        dayOffset: 0,
    },
    {
        label: '팀 6 — 전남 (오늘)',
        region: Region.JEONNAM,
        male: '10', // 신재현 32
        female: '15', // 서지안 30
        themes: [CourseTheme.LOCAL_FOOD_MARKET, CourseTheme.WALKING_TRIP],
        dayOffset: 0,
    },
    {
        label: '팀 7 — 경북 (오늘)',
        region: Region.GYEONGBUK,
        male: '11', // 배준영 26
        female: '16', // 강예린 25
        themes: [CourseTheme.HISTORY_CULTURE, CourseTheme.ART_SENSIBILITY],
        dayOffset: 0,
    },
    {
        label: '팀 8 — 충북 (오늘)',
        region: Region.CHUNGBUK,
        male: '12', // 임태균 33
        female: '17', // 조민서 28
        themes: [CourseTheme.ACTIVITY, CourseTheme.WALKING_TRIP],
        dayOffset: 0,
    },
    {
        label: '팀 9 — 대전 (오늘)',
        region: Region.DAEJEON,
        male: '13', // 노시윤 24
        female: '18', // 백가온 25
        themes: [CourseTheme.ART_SENSIBILITY, CourseTheme.NIGHT_DATE],
        dayOffset: 0,
    },
] as const;

const TRIP_FEE = 9900;

// 우진(40)과 아름(23)이 서로 후보가 되려면 범위가 이만큼 넓어야 한다.
// isEligible이 양방향으로 나이를 보기 때문에 한쪽만 넓혀서는 안 붙는다.
const AGE_MIN = 20;
const AGE_MAX = 45;

/** 오늘로부터 n일 뒤를 YYYY-MM-DD로 */
function dateAfter(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

/**
 * 시드를 다시 돌려도 되도록 지난 매칭 흔적을 지운다.
 * MatchingService.create()가 진행 중인 매칭이 있으면 409를 던지기 때문에
 * 지우지 않으면 두 번째 실행부터 실패한다.
 */
async function resetMatchFlow() {
    const userIds = TEST_USERS.map((u) => u.id);

    // 지우는 범위를 반드시 테스트 계정으로 한정한다.
    // deleteMany({})로 전부 지우면 카카오로 실제 로그인해서 만든 내 계정의
    // 채팅방·매칭·신고까지 같이 날아간다. 같은 개발 DB를 쓰기 때문이다.
    const ofTestUsers = {
        OR: [
            { matchingA: { userId: { in: userIds } } },
            { matchingB: { userId: { in: userIds } } },
        ],
    };

    const attempts = await prisma.matchAttempt.findMany({
        where: ofTestUsers,
        select: { id: true },
    });
    const attemptIds = attempts.map((a) => a.id);

    if (attemptIds.length > 0) {
        const courses = await prisma.course.findMany({
            where: { matchAttemptId: { in: attemptIds } },
            select: { id: true },
        });
        const courseIds = courses.map((c) => c.id);

        if (courseIds.length > 0) {
            const missions = await prisma.courseMission.findMany({
                where: { courseId: { in: courseIds } },
                select: { id: true },
            });
            await prisma.courseMissionPhoto.deleteMany({
                where: { missionId: { in: missions.map((m) => m.id) } },
            });
            await prisma.courseMission.deleteMany({
                where: { courseId: { in: courseIds } },
            });
            await prisma.courseSpot.deleteMany({
                where: { courseId: { in: courseIds } },
            });
            await prisma.courseReview.deleteMany({
                where: { courseId: { in: courseIds } },
            });
            await prisma.spotReview.deleteMany({
                where: { courseId: { in: courseIds } },
            });
            await prisma.courseVideo.deleteMany({
                where: { courseId: { in: courseIds } },
            });
            await prisma.stamp.deleteMany({
                where: { courseId: { in: courseIds } },
            });
            // 포인트 내역은 courseId가 nullable이라 코스만 떼어내고 내역은 남긴다
            await prisma.pointTransaction.updateMany({
                where: { courseId: { in: courseIds } },
                data: { courseId: null },
            });
            await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
        }

        await prisma.report.deleteMany({
            where: { matchAttemptId: { in: attemptIds } },
        });
        await prisma.userBlock.deleteMany({
            where: { matchAttemptId: { in: attemptIds } },
        });
        await prisma.partnerReview.deleteMany({
            where: { matchAttemptId: { in: attemptIds } },
        });

        const rooms = await prisma.chatRoom.findMany({
            where: { matchAttemptId: { in: attemptIds } },
            select: { id: true },
        });
        const roomIds = rooms.map((r) => r.id);
        await prisma.chatMessage.deleteMany({
            where: { chatRoomId: { in: roomIds } },
        });
        await prisma.chatMessageCount.deleteMany({
            where: { chatRoomId: { in: roomIds } },
        });
        await prisma.chatRoom.deleteMany({ where: { id: { in: roomIds } } });

        await prisma.payment.deleteMany({
            where: { matchAttemptId: { in: attemptIds } },
        });
        await prisma.matchResponse.deleteMany({
            where: { matchAttemptId: { in: attemptIds } },
        });
        await prisma.matchAttempt.deleteMany({
            where: { id: { in: attemptIds } },
        });
    }

    // 지난 시드가 준 보상도 같이 치운다. 안 지우면 돌릴 때마다 포인트가 쌓인다.
    await prisma.pointTransaction.deleteMany({
        where: { pointAccount: { userId: { in: userIds } } },
    });
    await prisma.pointAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.stamp.deleteMany({ where: { userId: { in: userIds } } });

    await prisma.matchingAvailableDate.deleteMany({
        where: { matching: { userId: { in: userIds } } },
    });
    await prisma.matching.deleteMany({ where: { userId: { in: userIds } } });
}

/** 결제 흉내. 카카오페이를 부를 수 없으니 결제가 끝난 상태만 만들어 둔다 */
async function fakeApprovedPayments(matchAttemptId: string, userIds: string[]) {
    for (const userId of userIds) {
        await prisma.payment.create({
            data: {
                matchAttemptId,
                userId,
                amount: TRIP_FEE,
                status: PaymentStatus.APPROVED,
                kakaoPayTid: `seed-tid-${matchAttemptId.slice(0, 8)}-${userId}`,
                approvedAt: new Date(),
            },
        });
    }
}

/**
 * 여행일을 실제 원하는 날로 옮긴다.
 *
 * MatchingService.create()가 "오늘부터 한 달 이내"만 받기 때문에 지난 날짜로는
 * 애초에 매칭을 만들 수 없다. 그래서 유효한 날짜로 만들어 두고 여기서 옮긴다.
 * 코스는 MatchAttempt.travelDate를 그대로 스냅샷으로 가져가므로 반드시
 * 코스를 만들기 전에 옮겨야 한다.
 */
async function shiftTravelDate(matchAttemptId: string, dayOffset: number) {
    const travelDate = new Date(`${dateAfter(dayOffset)}T00:00:00.000Z`);

    const attempt = await prisma.matchAttempt.update({
        where: { id: matchAttemptId },
        data: { travelDate },
        select: { matchingAId: true, matchingBId: true },
    });

    await prisma.matchingAvailableDate.updateMany({
        where: {
            matchingId: { in: [attempt.matchingAId, attempt.matchingBId] },
        },
        data: { date: travelDate },
    });

    // 채팅방은 여행 전날 00시(KST)에 열린다. 여행일이 바뀌면 같이 따라가야 한다.
    await prisma.chatRoom.updateMany({
        where: { matchAttemptId },
        data: { openAt: ChatRoomService.calcOpenAt(travelDate) },
    });

    return travelDate;
}

async function runMatchFlow() {
    const app = await NestFactory.createApplicationContext(SeedModule, {
        // 매칭 엔진과 TourAPI가 남기는 로그에 시드 출력이 묻힌다
        logger: ['error', 'warn'],
    });

    const matchings = app.get(MatchingService);
    const attempts = app.get(MatchAttemptService);
    const chatRooms = app.get(ChatRoomService);
    const courses = app.get(CourseGeneratorService);
    const schedule = app.get(CourseScheduleService);
    const db = app.get(PrismaService);

    const results: {
        label: string;
        matchAttemptId: string;
        chatRoomId: string | null;
        courseId: string | null;
        travelDate: string;
        male: string;
        female: string;
    }[] = [];

    try {
        for (const team of TEAMS) {
            // 지난 날짜로는 매칭을 만들 수 없어서 일단 오늘로 만들고 나중에 옮긴다
            const seedDate = dateAfter(Math.max(team.dayOffset, 0));

            const condition = {
                regions: [team.region],
                ageMin: AGE_MIN,
                ageMax: AGE_MAX,
                themes: [...team.themes],
                availableDates: [seedDate],
            };

            // 남자 쪽 먼저. 이 시점엔 상대가 없어서 SEARCHING으로 남는다.
            await matchings.create(team.male, {
                ...condition,
                preferredGender: PreferredGender.FEMALE,
            });

            // 여자 쪽을 넣는 순간 create 안의 tryMatch가 위 사람을 찾아낸다.
            // MatchAttempt를 만드는 건 시드가 아니라 매칭 알고리즘이다.
            await matchings.create(team.female, {
                ...condition,
                preferredGender: PreferredGender.MALE,
            });

            const attempt = await db.matchAttempt.findFirst({
                where: {
                    OR: [
                        { matchingA: { userId: team.male } },
                        { matchingB: { userId: team.male } },
                    ],
                },
                orderBy: { createdAt: 'desc' },
            });

            if (!attempt) {
                throw new Error(
                    `매칭이 성사되지 않았다: ${team.label}. ` +
                        '알고리즘 조건(지역/나이/성별/날짜/테마)이 바뀌었는지 확인이 필요하다.',
                );
            }

            // 양쪽 수락 -> 두 번째 응답에서 PAYMENT_PENDING으로 넘어간다
            await attempts.respond(team.male, attempt.id, {
                decision: MatchDecision.ACCEPTED,
            });
            await attempts.respond(team.female, attempt.id, {
                decision: MatchDecision.ACCEPTED,
            });

            await fakeApprovedPayments(attempt.id, [team.male, team.female]);

            // PaymentService.confirmIfBothPaid가 private이라 부를 수 없어서
            // 같은 일을 여기서 한다. 채팅방만은 실제 서비스가 만들게 둔다.
            await db.$transaction(async (tx) => {
                await tx.matchAttempt.update({
                    where: { id: attempt.id },
                    data: {
                        status: MatchAttemptStatus.CONFIRMED,
                        confirmedAt: new Date(),
                    },
                });
                await tx.matching.updateMany({
                    where: {
                        id: { in: [attempt.matchingAId, attempt.matchingBId] },
                    },
                    data: { status: MatchingStatus.CONFIRMED },
                });
                await chatRooms.createForConfirmedAttempt(tx, {
                    matchAttemptId: attempt.id,
                    travelDate: attempt.travelDate,
                    userIds: [team.male, team.female],
                });
            });

            const travelDate = await shiftTravelDate(attempt.id, team.dayOffset);

            // 코스 생성. TourAPI를 실제로 불러서 장소를 채운다.
            let courseId: string | null = null;
            try {
                const course = await courses.generateForMatchAttempt(attempt.id);
                courseId = course.id;
            } catch (error) {
                // TourAPI가 죽어 있어도 나머지 시드는 살려 둔다.
                // 코스만 나중에 POST /api/v1/courses/regenerate로 채우면 된다.
                console.warn(
                    `  ! ${team.label} 코스 생성 실패 — ${(error as Error).message}`,
                );
            }

            const room = await db.chatRoom.findUnique({
                where: { matchAttemptId: attempt.id },
                select: { id: true },
            });

            results.push({
                label: team.label,
                matchAttemptId: attempt.id,
                chatRoomId: room?.id ?? null,
                courseId,
                travelDate: travelDate.toISOString().slice(0, 10),
                male: team.male,
                female: team.female,
            });
        }

        // 코스 상태는 손으로 박지 않고 실제 스케줄러에게 맡긴다.
        // 여행일이 된 코스는 IN_PROGRESS로, 지난 코스는 COMPLETED로 바뀌면서
        // 완료된 팀에게는 스탬프와 포인트까지 정상 지급된다.
        await schedule.startTodaysCourses();
        await schedule.completeFinishedCourses();
    } finally {
        await app.close();
    }

    // 스케줄러가 바꾼 최종 상태를 다시 읽어 온다
    const withStatus = [];
    for (const r of results) {
        const course = r.courseId
            ? await prisma.course.findUnique({
                  where: { id: r.courseId },
                  select: { status: true, title: true },
              })
            : null;
        withStatus.push({ ...r, courseStatus: course?.status ?? null, courseTitle: course?.title ?? null });
    }

    return withStatus;
}

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

    await resetMatchFlow();
    const results = await runMatchFlow();

    const nameOf = (id: string) =>
        TEST_USERS.find((u) => u.id === id)!.profile.name;

    console.log('매칭 + 코스 시드 완료 (실제 알고리즘이 짝을 짓고 TourAPI가 장소를 채움)\n');

    for (const r of results) {
        console.log(r.label);
        console.log(`  여행일         : ${r.travelDate}`);
        console.log(`  참여자         : ${r.male} ${nameOf(r.male)}  <->  ${r.female} ${nameOf(r.female)}`);
        console.log(`  matchAttemptId : ${r.matchAttemptId}`);
        console.log(`  chatRoomId     : ${r.chatRoomId ?? '없음'}`);
        console.log(
            `  코스           : ${
                r.courseId
                    ? `${r.courseStatus}  ${r.courseTitle ?? ''}  (${r.courseId})`
                    : '생성 실패 — POST /api/v1/courses/regenerate로 다시 시도'
            }`,
        );
        console.log('');
    }

    console.log(`토큰 발급 : POST /api/v1/auth/dev-token  { "userId": "1" }
            받은 accessToken을 Swagger 우측 상단 Authorize에 넣으면 그 사람으로 들어간다

계정
${TEST_USERS.map((u) => `  ${u.id}  ${u.profile.name} (${u.profile.gender === Gender.MALE ? '남' : '여'})`).join('\n')}

신고 : POST /api/v1/safety/reports  { "matchAttemptId": "${results[0].matchAttemptId}", "reasonCode": "NO_SHOW" }
차단 : POST /api/v1/safety/blocks   { "matchAttemptId": "${results[0].matchAttemptId}" }`);
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