// 인증샷 업로드.
//
// 장소마다 두 사람이 한 장씩, 4곳이면 8장. 다 채웠다고 코스가 끝나지는 않는다.
// 완료는 여행 다음 날 시계가 처리한다 — course-completion.service.ts 머리말 참고.
// 여기서는 사진을 저장하고 "몇 곳까지 찍었는지"만 돌려준다.
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { buildObjectPath } from '../upload.config';
import { CourseStatus } from '../../generated/prisma/enums';
import { daysUntil } from '../course-date.util';
import { isUniqueViolation } from '../../common/prisma-error.util';
import { MissionPhotoResponseDto } from '../dto/response/course-progress-response.dto';
import { CourseAccessService } from './course-access.service';
import { CourseCompletionService } from './course-completion.service';

type PhotoUpload = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  comment?: string;
};

@Injectable()
export class CoursePhotoService {
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
    await this.assertCanUpload(userId, courseId, missionId);

    const objectPath = buildObjectPath(upload.originalName);
    await this.storage.upload(objectPath, upload.buffer, upload.mimeType);

    try {
      return await this.savePhoto(userId, missionId, courseId, objectPath, upload.comment);
    } catch (error) {
      // DB에 남기지 못하면 올라간 객체가 주인 없이 남는다
      await this.storage.remove(objectPath);
      throw error;
    }
  }

  private async assertCanUpload(
    userId: string,
    courseId: string,
    missionId: string,
  ): Promise<void> {
    const course = await this.access.loadCourseForUser(courseId, userId);

    if (daysUntil(course.travelDate) > 0) {
      throw new ForbiddenException('코스 당일부터 인증샷을 올릴 수 있어요');
    }

    // 완료된 코스에도 계속 받는다.
    //
    // 완료는 여행 다음 날 00시에 걸리는데, 데이트를 마치고 집에 가서 올리면
    // 그 시각을 넘기기 쉽다. 사진은 추억이라 "하루 지났으니 안 됩니다"로
    // 막을 이유가 약하다.
    //
    // 나중에 AI 추억영상이 붙으면 그때 잠글 자리가 생긴다.
    // 기준은 완료가 아니라 8장(4곳 x 두 사람)이 다 찼는지다 — 재료가 빠진 채로
    // 만들면 다시 만들어야 한다. 다 찼는지는 missionProgress()의 allRequiredDone.
    // 지금은 영상 기능이 없어서 없는 제약으로 사용자를 막지 않는다.
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
  }

  private async savePhoto(
    userId: string,
    missionId: string,
    courseId: string,
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
          comment: comment ?? null,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('이미 인증샷을 등록했어요');
      }
      throw error;
    }

    const progress = await this.completion.missionProgress(courseId);
    const thisMission = progress.missions.find((m) => m.id === missionId);

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
    };
  }
}
