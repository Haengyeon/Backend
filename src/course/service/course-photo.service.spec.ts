// 인증샷 저장, 한마디, 당일 자동 완료.
//
// 4곳 모두 두 사람의 사진과 한마디가 차면 그 자리에서 코스를 닫는다. 마지막 조각은 사진일
// 수도 한마디일 수도 있다. 완료가 실패해도 사진은 이미 저장됐으므로 올라간 객체를 지우면 안 된다.
import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { CoursePhotoService } from './course-photo.service';
import { CourseAccessService } from './course-access.service';
import { CourseCompletionService } from './course-completion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CourseStatus } from '../../generated/prisma/enums';

const COURSE_ID = 'course-1';
const MISSION_ID = 'mission-4';
const PHOTO_ID = 'photo-1';
const OBJECT_PATH = 'mission-photos/kept.png';

/** 오늘 날짜라 D-Day 검사를 통과한다 */
const course = {
  id: COURSE_ID,
  status: CourseStatus.IN_PROGRESS as CourseStatus,
  travelDate: new Date(),
  matchAttempt: {
    isExperience: false,
    matchingA: { userId: 'me' },
    matchingB: { userId: 'partner' },
  },
};

const upload = {
  buffer: Buffer.from('x'),
  originalName: 'kept.png',
  mimeType: 'image/png',
};

const COMPLETION = {
  id: COURSE_ID,
  status: CourseStatus.COMPLETED,
  completedAt: new Date(),
  earnedStamps: [],
  earnedPoints: 1000,
  pointsAfter: 1000,
};

/** 이번 요청 뒤 이 미션의 사진·한마디 수. 나머지 3곳은 이미 두 개씩 찼다 */
type ThisMission = { photos: number; comments: number };

/** 사진 8장 + 한마디 8개 */
const FILLED: ThisMission = { photos: 2, comments: 2 };
/** 사진은 8장인데 한마디 하나가 빈 상태 */
const ONE_COMMENT_MISSING: ThisMission = { photos: 2, comments: 1 };
/** 사진 7장 */
const ONE_PHOTO_MISSING: ThisMission = { photos: 1, comments: 1 };

function progressAfter(thisMission: ThisMission) {
  const missions = [
    { id: 'mission-1', isRequired: true, photoCount: 2, commentCount: 2 },
    { id: 'mission-2', isRequired: true, photoCount: 2, commentCount: 2 },
    { id: 'mission-3', isRequired: true, photoCount: 2, commentCount: 2 },
    {
      id: MISSION_ID,
      isRequired: true,
      photoCount: thisMission.photos,
      commentCount: thisMission.comments,
    },
  ];

  return {
    missions,
    completedCount: missions.filter((m) => m.photoCount >= 2).length,
    allRequiredDone: missions.every((m) => m.photoCount >= 2),
    allRequiredCommented: missions.every((m) => m.commentCount >= 2),
    photosPerMission: 2,
  };
}

function buildService({
  after = FILLED,
  loaded = course,
}: { after?: ThisMission; loaded?: typeof course } = {}) {
  const saved = {
    id: PHOTO_ID,
    missionId: MISSION_ID,
    imageUrl: OBJECT_PATH,
    comment: null,
    createdAt: new Date(),
  };

  const createPhoto = jest.fn().mockResolvedValue(saved);
  const findPhoto = jest.fn().mockResolvedValue({
    userId: 'me',
    missionId: MISSION_ID,
    mission: { courseId: COURSE_ID },
  });
  const updatePhoto = jest.fn(
    ({ data }: { data: { comment: string | null } }) =>
      Promise.resolve({ ...saved, comment: data.comment }),
  );

  const prisma = {
    courseMission: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: MISSION_ID, courseId: COURSE_ID }),
    },
    courseMissionPhoto: {
      create: createPhoto,
      findUnique: findPhoto,
      update: updatePhoto,
    },
  } as unknown as PrismaService;

  const accessService = {
    loadCourseForUser: jest.fn().mockResolvedValue(loaded),
    resolvePartnerId: jest.fn().mockReturnValue('partner'),
  } as unknown as CourseAccessService;

  const completeCourse = jest.fn().mockResolvedValue(COMPLETION);
  const completion = {
    missionProgress: jest.fn().mockResolvedValue(progressAfter(after)),
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
    service: new CoursePhotoService(prisma, storage, accessService, completion),
    completeCourse,
    createPhoto,
    findPhoto,
    updatePhoto,
    storageUpload,
    storageRemove,
  };
}

describe('CoursePhotoService — 사진과 한마디가 다 차면 그 자리에서 코스를 닫는다', () => {
  afterEach(() => jest.restoreAllMocks());

  it('마지막 사진으로 다 차면 두 사람 몫으로 닫고 결과를 실어 준다', async () => {
    const { service, completeCourse } = buildService();

    const result = await service.uploadMissionPhoto(
      'me',
      COURSE_ID,
      MISSION_ID,
      upload,
    );

    expect(completeCourse).toHaveBeenCalledWith(COURSE_ID, 'me', 'partner');
    expect(result.completion).toBe(COMPLETION);
  });

  it('사진이 8장이어도 한마디가 비면 닫지 않는다', async () => {
    const { service, completeCourse } = buildService({
      after: ONE_COMMENT_MISSING,
    });

    const result = await service.uploadMissionPhoto(
      'me',
      COURSE_ID,
      MISSION_ID,
      upload,
    );

    expect(completeCourse).not.toHaveBeenCalled();
    expect(result.completion).toBeNull();
  });

  it('사진이 덜 찼으면 닫지 않는다 - 완료 버튼이나 시계 몫이다', async () => {
    const { service, completeCourse } = buildService({
      after: ONE_PHOTO_MISSING,
    });

    const result = await service.uploadMissionPhoto(
      'me',
      COURSE_ID,
      MISSION_ID,
      upload,
    );

    expect(completeCourse).not.toHaveBeenCalled();
    expect(result.completion).toBeNull();
  });

  it('완료가 터져도 업로드는 성공하고 올라간 객체를 지우지 않는다', async () => {
    const logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { service, completeCourse, storageRemove } = buildService();
    completeCourse.mockRejectedValue(new Error('보상 지급 실패'));

    const result = await service.uploadMissionPhoto(
      'me',
      COURSE_ID,
      MISSION_ID,
      upload,
    );

    // 사진 행은 이미 있다. 객체를 지우면 사진이 깨지고 영상도 못 만든다
    expect(result.id).toBe(PHOTO_ID);
    expect(result.completion).toBeNull();
    expect(storageRemove).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });

  it('시계가 먼저 닫은 코스면 다시 닫지 않는다', async () => {
    const { service, completeCourse } = buildService({
      loaded: { ...course, status: CourseStatus.COMPLETED },
    });

    const result = await service.uploadMissionPhoto(
      'me',
      COURSE_ID,
      MISSION_ID,
      upload,
    );

    expect(completeCourse).not.toHaveBeenCalled();
    expect(result.completion).toBeNull();
  });
});

describe('CoursePhotoService — 사진을 올린 뒤 한마디 쓰기', () => {
  it('앞뒤 공백을 걷어 저장한다', async () => {
    const { service, updatePhoto } = buildService({
      after: ONE_COMMENT_MISSING,
    });

    const result = await service.updateComment(
      'me',
      COURSE_ID,
      MISSION_ID,
      PHOTO_ID,
      '  떡볶이 진짜 맛있었다 ',
    );

    expect(updatePhoto.mock.calls[0][0].data.comment).toBe(
      '떡볶이 진짜 맛있었다',
    );
    expect(result.comment).toBe('떡볶이 진짜 맛있었다');
  });

  it('빈 문자열이면 한마디를 지운다', async () => {
    const { service, updatePhoto } = buildService({
      after: ONE_COMMENT_MISSING,
    });

    await service.updateComment('me', COURSE_ID, MISSION_ID, PHOTO_ID, '   ');

    expect(updatePhoto.mock.calls[0][0].data.comment).toBeNull();
  });

  it('마지막 한마디로 다 차면 여기서도 코스를 닫는다', async () => {
    const { service, completeCourse } = buildService();

    const result = await service.updateComment(
      'me',
      COURSE_ID,
      MISSION_ID,
      PHOTO_ID,
      '마지막 한마디',
    );

    expect(completeCourse).toHaveBeenCalledWith(COURSE_ID, 'me', 'partner');
    expect(result.completion).toBe(COMPLETION);
  });

  it('상대 사진에는 쓸 수 없다', async () => {
    const { service, findPhoto, updatePhoto } = buildService();
    findPhoto.mockResolvedValue({
      userId: 'partner',
      missionId: MISSION_ID,
      mission: { courseId: COURSE_ID },
    });

    await expect(
      service.updateComment('me', COURSE_ID, MISSION_ID, PHOTO_ID, '몰래'),
    ).rejects.toThrow(ForbiddenException);
    expect(updatePhoto).not.toHaveBeenCalled();
  });

  it('다른 미션의 사진 ID를 끼워 넣으면 404', async () => {
    const { service, findPhoto } = buildService();
    findPhoto.mockResolvedValue({
      userId: 'me',
      missionId: 'mission-9',
      mission: { courseId: COURSE_ID },
    });

    await expect(
      service.updateComment('me', COURSE_ID, MISSION_ID, PHOTO_ID, '한마디'),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('CoursePhotoService — 저장', () => {
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
      completedMissions: 4,
      totalMissions: 4,
    });
  });

  it('완료된 코스에도 올릴 수 있다 - 늦게 올리는 사람이 많다', async () => {
    const { service } = buildService({
      after: ONE_PHOTO_MISSING,
      loaded: { ...course, status: CourseStatus.COMPLETED },
    });

    const result = await service.uploadMissionPhoto(
      'me',
      COURSE_ID,
      MISSION_ID,
      upload,
    );

    expect(result.id).toBe(PHOTO_ID);
  });

  it('취소된 코스는 올리기 전에 막아서 객체를 만들지 않는다', async () => {
    const { service, storageUpload } = buildService({
      loaded: { ...course, status: CourseStatus.CANCELLED },
    });

    await expect(
      service.uploadMissionPhoto('me', COURSE_ID, MISSION_ID, upload),
    ).rejects.toThrow('취소된 코스에는 인증샷을 올릴 수 없어요');

    // 검사가 업로드보다 먼저라 주인 없는 객체가 생기지 않는다
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('사진 행을 만들지 못하면 올라간 객체를 지운다', async () => {
    const { service, createPhoto, storageRemove } = buildService();
    createPhoto.mockRejectedValue(new Error('저장 실패'));

    await expect(
      service.uploadMissionPhoto('me', COURSE_ID, MISSION_ID, upload),
    ).rejects.toThrow('저장 실패');

    expect(storageRemove).toHaveBeenCalledTimes(1);
  });
});
