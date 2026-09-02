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
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { UPLOAD_DIR, toPublicUrl } from '../upload.config';
import { CourseStatus } from '../../generated/prisma/enums';
import { daysUntil } from '../course-date.util';
import { isUniqueViolation } from '../prisma-error.util';
import { MissionPhotoResponseDto } from '../dto/response/course-progress-response.dto';
import { CourseAccessService } from './course-access.service';
import { CourseCompletionService } from './course-completion.service';

@Injectable()
export class CoursePhotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly completion: CourseCompletionService,
  ) {}

  /**
   * 인증샷 업로드.
   *
   * 파일은 컨트롤러(multer)가 이미 디스크에 저장했고 여기는 그 파일명만 받는다.
   * 사진을 DB에 남기지 못하면 올라간 파일이 주인 없이 남으므로 지워 준다.
   */
  async uploadMissionPhoto(
    userId: string,
    courseId: string,
    missionId: string,
    upload: { filename: string; comment?: string },
  ): Promise<MissionPhotoResponseDto> {
    try {
      return await this.savePhoto(userId, courseId, missionId, upload);
    } catch (error) {
      await this.discardUpload(upload.filename);
      throw error;
    }
  }

  private async savePhoto(
    userId: string,
    courseId: string,
    missionId: string,
    upload: { filename: string; comment?: string },
  ): Promise<MissionPhotoResponseDto> {
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
    // 나중에 AI 추억영상이 붙으면 영상의 재료가 고정돼야 하므로 그때
    // 잠글 자리가 생긴다. 다만 기준은 완료가 아니라 "영상 생성"이어야 한다.
    // 지금은 영상 기능 자체가 없어서, 없는 제약으로 사용자를 막지 않는다.
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

    let photo;
    try {
      photo = await this.prisma.courseMissionPhoto.create({
        data: {
          missionId,
          userId,
          imageUrl: toPublicUrl(upload.filename),
          comment: upload.comment ?? null,
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
      imageUrl: photo.imageUrl,
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

  /** 저장에 실패한 업로드 파일을 지운다. 실패해도 원래 에러를 덮지 않는다. */
  private async discardUpload(filename: string) {
    try {
      await unlink(join(UPLOAD_DIR, filename));
    } catch {
      // 이미 없거나 지울 수 없으면 그냥 둔다
    }
  }
}
