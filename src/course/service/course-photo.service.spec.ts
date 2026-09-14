// 인증샷은 저장까지만 책임진다.
//
// 완료 기준이 "사진 8장"에서 "여행 다음 날"로 바뀌면서, 마지막 한 장이 올라와도
// 여기서 코스를 닫지 않는다. 닫는 건 course-schedule.service.ts의 시계다.
// 저장에 실패했을 때 주인 없는 객체를 지우는 책임은 그대로 남아 있다.
import { CoursePhotoService } from './course-photo.service';
import { CourseAccessService } from './course-access.service';
import { CourseCompletionService } from './course-completion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CourseStatus } from '../../generated/prisma/enums';

const COURSE_ID = 'course-1';
const MISSION_ID = 'mission-4';
const OBJECT_PATH = 'mission-photos/kept.png';

/** 오늘 날짜라 D-Day 검사를 통과한다 */
const course = {
  id: COURSE_ID,
  status: CourseStatus.IN_PROGRESS,
  travelDate: new Date(),
  matchAttempt: {
    matchingA: { userId: 'me' },
    matchingB: { userId: 'partner' },
  },
};

const upload = {
  buffer: Buffer.from('x'),
  originalName: 'kept.png',
  mimeType: 'image/png',
};

function buildService() {
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
        imageUrl: OBJECT_PATH,
        comment: null,
        createdAt: new Date(),
      }),
    },
  } as unknown as PrismaService;

  const accessService = {
    loadCourseForUser: jest.fn().mockResolvedValue(course),
    resolvePartnerId: jest.fn().mockReturnValue('partner'),
  } as unknown as CourseAccessService;

  // 마지막 한 장까지 채워진 상태 — 예전이라면 완료 처리가 돌던 지점
  const completeCourse = jest.fn();
  const completion = {
    missionProgress: jest.fn().mockResolvedValue({
      missions: [{ id: MISSION_ID, isRequired: true, photoCount: 2 }],
      completedCount: 1,
      allRequiredDone: true,
      photosPerMission: 2,
    }),
    completeCourse,
  } as unknown as CourseCompletionService;

  const storageUpload = jest.fn().mockResolvedValue(undefined);
  const storageRemove = jest.fn().mockResolvedValue(undefined);
  const storage = {
    upload: storageUpload,
    remove: storageRemove,
    signedUrl: jest.fn().mockResolvedValue('https://signed.example/kept.png'),
  } as unknown as StorageService;

  return {
    service: new CoursePhotoService(
      prisma,
      storage,
      accessService,
      completion,
    ),
    completeCourse,
    storageUpload,
    storageRemove,
  };
}

describe('CoursePhotoService — 사진은 저장하고 완료는 건드리지 않는다', () => {
  it('필수 미션이 다 차도 코스를 닫지 않는다', async () => {
    const { service, completeCourse, storageUpload, storageRemove } =
      buildService();

    const result = await service.uploadMissionPhoto(
      'me',
      COURSE_ID,
      MISSION_ID,
      upload,
    );

    expect(result.id).toBe('photo-1');
    // 완료는 여행 다음 날 시계가 한다
    expect(completeCourse).not.toHaveBeenCalled();
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it('응답의 imageUrl은 객체 경로가 아니라 서명 URL이다', async () => {
    const { service } = buildService();

    const result = await service.uploadMissionPhoto(
      'me',
      COURSE_ID,
      MISSION_ID,
      upload,
    );

    expect(result.imageUrl).toBe('https://signed.example/kept.png');
  });

  it('이 미션이 끝났는지와 코스 진행률을 함께 돌려준다', async () => {
    const { service } = buildService();

    const result = await service.uploadMissionPhoto(
      'me',
      COURSE_ID,
      MISSION_ID,
      upload,
    );

    // 두 사람이 다 올려야 그 미션이 끝난 것으로 본다
    expect(result.missionCompleted).toBe(true);
    expect(result.courseProgress).toEqual({
      completedMissions: 1,
      totalMissions: 1,
    });
  });

  it('완료된 코스에도 올릴 수 있다 - 늦게 올리는 사람이 많다', async () => {
    const { service } = buildService();
    (
      service as unknown as {
        access: { loadCourseForUser: jest.Mock };
      }
    ).access.loadCourseForUser = jest
      .fn()
      .mockResolvedValue({ ...course, status: CourseStatus.COMPLETED });

    const result = await service.uploadMissionPhoto(
      'me',
      COURSE_ID,
      MISSION_ID,
      upload,
    );

    expect(result.id).toBe('photo-1');
  });

  it('취소된 코스는 올리기 전에 막아서 객체를 만들지 않는다', async () => {
    const { service, storageUpload } = buildService();
    (
      service as unknown as {
        access: { loadCourseForUser: jest.Mock };
      }
    ).access.loadCourseForUser = jest
      .fn()
      .mockResolvedValue({ ...course, status: CourseStatus.CANCELLED });

    await expect(
      service.uploadMissionPhoto('me', COURSE_ID, MISSION_ID, upload),
    ).rejects.toThrow('취소된 코스에는 인증샷을 올릴 수 없어요');

    // 검사가 업로드보다 먼저라 주인 없는 객체가 생기지 않는다
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('사진 행을 만들지 못하면 올라간 객체를 지운다', async () => {
    const { service, storageRemove } = buildService();
    (
      service as unknown as {
        prisma: { courseMissionPhoto: { create: jest.Mock } };
      }
    ).prisma.courseMissionPhoto.create = jest
      .fn()
      .mockRejectedValue(new Error('저장 실패'));

    await expect(
      service.uploadMissionPhoto('me', COURSE_ID, MISSION_ID, upload),
    ).rejects.toThrow('저장 실패');

    expect(storageRemove).toHaveBeenCalledTimes(1);
  });
});
