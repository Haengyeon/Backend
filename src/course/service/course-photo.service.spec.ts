// 인증샷 저장과 코스 완료 처리는 성패를 따로 본다.
//
// 사진은 트랜잭션 밖에서 저장되고, 완료 처리는 그 뒤에 붙는다. 완료가 실패했다고
// 업로드까지 되돌리면 DB에는 사진 기록이 남고 파일만 지워져 깨진 이미지가 된다.
import { mkdir, writeFile, access as canAccess, rm } from 'fs/promises';
import { join } from 'path';
import { CoursePhotoService } from './course-photo.service';
import { CourseAccessService } from './course-access.service';
import { CourseCompletionService } from './course-completion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UPLOAD_DIR } from '../upload.config';
import { CourseStatus } from '../../generated/prisma/enums';

const COURSE_ID = 'course-1';
const MISSION_ID = 'mission-4';

/** 오늘 날짜라 D-Day 검사를 통과한다 */
const course = {
  id: COURSE_ID,
  status: CourseStatus.UPCOMING,
  travelDate: new Date(),
  matchAttempt: {
    matchingA: { userId: 'me' },
    matchingB: { userId: 'partner' },
  },
};

function buildService(completeCourse: jest.Mock) {
  const prisma = {
    courseMission: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: MISSION_ID, courseId: COURSE_ID }),
    },
    courseMissionPhoto: {
      create: jest.fn().mockResolvedValue({
        id: 'photo-1',
        missionId: MISSION_ID,
        imageUrl: '/uploads/kept.png',
        comment: null,
        createdAt: new Date(),
      }),
    },
  } as unknown as PrismaService;

  const accessService = {
    loadCourseForUser: jest.fn().mockResolvedValue(course),
    resolvePartnerId: jest.fn().mockReturnValue('partner'),
  } as unknown as CourseAccessService;

  // 마지막 한 장까지 채워진 상태 — 완료 처리가 도는 지점
  const completion = {
    missionProgress: jest.fn().mockResolvedValue({
      missions: [{ id: MISSION_ID, isRequired: true, photoCount: 2 }],
      completedCount: 1,
      allRequiredDone: true,
      photosPerMission: 2,
    }),
    completeCourse,
  } as unknown as CourseCompletionService;

  return new CoursePhotoService(prisma, accessService, completion);
}

describe('CoursePhotoService — 완료 처리가 실패해도 인증샷은 남는다', () => {
  const filename = 'kept.png';
  const filePath = join(UPLOAD_DIR, filename);

  beforeEach(async () => {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(filePath, 'x');
  });

  afterEach(async () => {
    await rm(filePath, { force: true });
  });

  const fileExists = async () =>
    canAccess(filePath).then(
      () => true,
      () => false,
    );

  it('완료 처리가 터져도 업로드는 성공하고 completion만 null이 된다', async () => {
    const service = buildService(
      jest.fn().mockRejectedValue(new Error('DB 연결 끊김')),
    );

    const result = await service.uploadMissionPhoto(
      'me',
      COURSE_ID,
      MISSION_ID,
      {
        filename,
      },
    );

    expect(result.id).toBe('photo-1');
    expect(result.completion).toBeNull();
    // 필수 미션은 다 찼으므로 "완료할 수 있는 상태"라는 사실은 그대로 알려 준다
    expect(result.courseCompletable).toBe(true);
    // 사진 파일이 지워지면 DB 기록만 남아 깨진 이미지가 된다
    expect(await fileExists()).toBe(true);
  });

  it('완료 처리가 성공하면 결과를 그대로 실어 준다', async () => {
    const completionResult = {
      id: COURSE_ID,
      status: CourseStatus.COMPLETED,
      completedAt: new Date(),
      earnedStamp: null,
      earnedPoint: 1000,
      balanceAfter: 1000,
    };
    const service = buildService(jest.fn().mockResolvedValue(completionResult));

    const result = await service.uploadMissionPhoto(
      'me',
      COURSE_ID,
      MISSION_ID,
      {
        filename,
      },
    );

    expect(result.completion).toEqual(completionResult);
    expect(await fileExists()).toBe(true);
  });

  it('사진 저장 자체가 실패하면 주인 없는 파일을 지운다', async () => {
    const service = buildService(jest.fn());
    // 사진 행을 만들지 못하는 상황
    (
      service as unknown as {
        prisma: { courseMissionPhoto: { create: jest.Mock } };
      }
    ).prisma.courseMissionPhoto.create = jest
      .fn()
      .mockRejectedValue(new Error('저장 실패'));

    await expect(
      service.uploadMissionPhoto('me', COURSE_ID, MISSION_ID, { filename }),
    ).rejects.toThrow('저장 실패');

    expect(await fileExists()).toBe(false);
  });
});
