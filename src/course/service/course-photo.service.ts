// 인증샷 업로드.
//
// 장소마다 두 사람이 한 장씩, 4곳이면 8장. 마지막 한 장이 채워지는 순간
// 완료 서비스를 불러 코스를 닫는다. 완료가 여기서 시작되는 이유는
// course-completion.service.ts 머리말에 적어 뒀다.
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(CoursePhotoService.name);

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
   *
   * 지우는 건 사진 저장까지다. 사진이 저장된 뒤에 벌어지는 일(코스 완료 처리)이
   * 실패했다고 파일을 지우면, DB에는 사진 기록이 있는데 파일만 없는 상태가 된다.
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

    // 마지막 한 장이 채워지면 그 자리에서 코스를 닫는다. 완료를 따로 눌러야
    // 하면 두 사람이 같이 걸은 코스인데 먼저 누른 쪽만 보상을 받는다.
    const completed =
      progress.allRequiredDone && course.status !== CourseStatus.COMPLETED
        ? await this.tryComplete(courseId, userId, course)
        : null;

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
      courseCompletable: progress.allRequiredDone,
      completion: completed,
    };
  }

  /**
   * 마지막 인증샷에 딸려 도는 코스 완료 처리.
   *
   * 사진은 이미 저장됐으므로 여기서 실패해도 업로드까지 실패시키지 않는다.
   * 실패하면 completion이 null로 나가고, 코스는 인증샷 8장을 채운 채
   * 열려 있게 된다. 그때는 POST /courses/:courseId/completions로 다시 닫는다.
   */
  private async tryComplete(
    courseId: string,
    userId: string,
    course: Parameters<CourseAccessService['resolvePartnerId']>[0],
  ) {
    try {
      return await this.completion.completeCourse(
        courseId,
        userId,
        this.access.resolvePartnerId(course, userId),
      );
    } catch (error) {
      this.logger.error(
        `인증샷은 저장됐으나 코스 완료 처리에 실패했습니다. course=${courseId} ` +
          `— POST /courses/${courseId}/completions로 다시 닫을 수 있습니다`,
        error as Error,
      );
      return null;
    }
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
