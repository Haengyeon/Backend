// 인증샷 업로드와 한마디.
//
// 장소마다 두 사람이 한 장씩, 4곳이면 8장. 사진과 한마디가 다 차는 순간 코스를 닫는다.
// 못 채운 코스는 완료 버튼이나 여행 다음 날 시계가 닫는다 — course-completion.service.ts 머리말 참고.
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { buildObjectPath } from '../upload.config';
import { CourseStatus } from '../../generated/prisma/enums';
import { daysUntil } from '../course-date.util';
import { isUniqueViolation } from '../../common/prisma-error.util';
import {
  CourseCompletionResponseDto,
  MissionPhotoResponseDto,
} from '../dto/response/course-progress-response.dto';
import { CourseAccessService } from './course-access.service';
import { CourseCompletionService } from './course-completion.service';

type PhotoUpload = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  comment?: string;
};

type UploadCourse = Awaited<
  ReturnType<CourseAccessService['loadCourseForUser']>
>;

type SavedPhoto = {
  id: string;
  missionId: string;
  imageUrl: string;
  comment: string | null;
  createdAt: Date;
};

@Injectable()
export class CoursePhotoService {
  private readonly logger = new Logger(CoursePhotoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: CourseAccessService,
    private readonly completion: CourseCompletionService,
  ) {}

  /**
   * 인증샷 업로드.
   *
   * 검사를 먼저 끝내고 파일을 올린다. 순서를 뒤집으면 권한 없는 요청에도
   * 객체가 만들어져 주인 없는 파일이 쌓인다.
   */
  async uploadMissionPhoto(
    userId: string,
    courseId: string,
    missionId: string,
    upload: PhotoUpload,
  ): Promise<MissionPhotoResponseDto> {
    const course = await this.assertCanUpload(userId, courseId, missionId);

    const objectPath = buildObjectPath(upload.originalName);
    await this.storage.upload(objectPath, upload.buffer, upload.mimeType);

    try {
      return await this.savePhoto(
        userId,
        missionId,
        course,
        objectPath,
        upload.comment,
      );
    } catch (error) {
      // DB에 남기지 못하면 올라간 객체가 주인 없이 남는다
      await this.storage.remove(objectPath);
      throw error;
    }
  }

  /** 올릴 수 있는지 보고, 완료 처리에 쓸 코스를 돌려준다 */
  private async assertCanUpload(
    userId: string,
    courseId: string,
    missionId: string,
  ): Promise<UploadCourse> {
    const course = await this.access.loadCourseForUser(courseId, userId);

    if (daysUntil(course.travelDate) > 0) {
      throw new ForbiddenException('코스 당일부터 인증샷을 올릴 수 있어요');
    }

    // 완료된 코스에도 계속 받는다.
    //
    // 당일에 안 닫힌 코스는 여행 다음 날 00시에 닫히는데, 데이트를 마치고 집에 가서
    // 올리면 그 시각을 넘기기 쉽다. 사진은 추억이라 막을 이유가 약하다.
    // 다만 이미 만들어진 영상에는 들어가지 않는다.
    if (course.status === CourseStatus.CANCELLED) {
      throw new ForbiddenException('취소된 코스에는 인증샷을 올릴 수 없어요');
    }

    const mission = await this.prisma.courseMission.findUnique({
      where: { id: missionId },
      select: { id: true, courseId: true },
    });

    // 다른 코스의 미션 ID를 끼워 넣는 걸 막는다
    if (!mission || mission.courseId !== courseId) {
      throw new NotFoundException('미션을 찾을 수 없습니다');
    }

    return course;
  }

  private async savePhoto(
    userId: string,
    missionId: string,
    course: UploadCourse,
    objectPath: string,
    comment?: string,
  ): Promise<MissionPhotoResponseDto> {
    let photo;
    try {
      photo = await this.prisma.courseMissionPhoto.create({
        data: {
          missionId,
          userId,
          // 전체 URL이 아니라 객체 경로다. 서명 URL은 만료되므로 저장하지 않는다
          imageUrl: objectPath,
          comment: comment?.trim() || null,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('이미 인증샷을 등록했어요');
      }
      throw error;
    }

    return this.toResponse(photo, course, userId);
  }

  /**
   * 올린 인증샷에 한마디를 쓰거나 고친다.
   *
   * 사진부터 찍고 한마디는 나중에 쓰는 사람이 많다. 이 한마디로 다 차면 여기서도 코스를 닫는다.
   * 완료 뒤에 고친 한마디는 이미 만든 영상에 들어가지 않는다.
   */
  async updateComment(
    userId: string,
    courseId: string,
    missionId: string,
    photoId: string,
    comment: string,
  ): Promise<MissionPhotoResponseDto> {
    const course = await this.access.loadCourseForUser(courseId, userId);

    if (course.status === CourseStatus.CANCELLED) {
      throw new ForbiddenException('취소된 코스에는 한마디를 남길 수 없어요');
    }

    const photo = await this.prisma.courseMissionPhoto.findUnique({
      where: { id: photoId },
      select: {
        userId: true,
        missionId: true,
        mission: { select: { courseId: true } },
      },
    });

    // 다른 미션이나 코스의 사진 ID를 끼워 넣는 걸 막는다
    if (
      !photo ||
      photo.missionId !== missionId ||
      photo.mission.courseId !== courseId
    ) {
      throw new NotFoundException('인증샷을 찾을 수 없습니다');
    }
    if (photo.userId !== userId) {
      throw new ForbiddenException('내 인증샷에만 한마디를 쓸 수 있어요');
    }

    const updated = await this.prisma.courseMissionPhoto.update({
      where: { id: photoId },
      data: { comment: comment.trim() || null },
    });

    return this.toResponse(updated, course, userId);
  }

  /** 사진·한마디가 바뀐 뒤의 응답. 이번 변경으로 다 찼으면 코스를 닫는다 */
  private async toResponse(
    photo: SavedPhoto,
    course: UploadCourse,
    userId: string,
  ): Promise<MissionPhotoResponseDto> {
    const progress = await this.completion.missionProgress(course.id);
    const thisMission = progress.missions.find((m) => m.id === photo.missionId);

    // 4곳 모두 두 사람의 사진과 한마디가 찼으면 여행 다음 날을 기다리지 않고 닫는다
    const completion =
      progress.allRequiredCommented && course.status !== CourseStatus.COMPLETED
        ? await this.tryComplete(course, userId)
        : null;

    return {
      id: photo.id,
      missionId: photo.missionId,
      imageUrl: await this.storage.signedUrl(photo.imageUrl),
      comment: photo.comment,
      createdAt: photo.createdAt,
      missionCompleted:
        (thisMission?.photoCount ?? 0) >= progress.photosPerMission,
      courseProgress: {
        completedMissions: progress.completedCount,
        totalMissions: progress.missions.length,
      },
      completion,
    };
  }

  /**
   * 마지막 사진이나 한마디에 딸려 도는 코스 완료. 실패해도 던지지 않는다.
   *
   * 던지면 uploadMissionPhoto가 방금 올린 객체를 지워 사진 행만 남는다.
   * 못 닫은 코스는 완료 버튼이나 여행 다음 날 시계가 닫는다.
   */
  private async tryComplete(
    course: UploadCourse,
    userId: string,
  ): Promise<CourseCompletionResponseDto | null> {
    try {
      return await this.completion.completeCourse(
        course.id,
        userId,
        this.access.resolvePartnerId(course, userId),
      );
    } catch (error) {
      this.logger.error(
        `사진·한마디는 저장됐으나 코스 완료에 실패했습니다. course=${course.id} — 여행 다음 날 시계가 닫습니다`,
        error as Error,
      );
      return null;
    }
  }
}
