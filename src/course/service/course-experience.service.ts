import {
    BadRequestException,
    Injectable,
    Logger,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CourseStatus } from '../../generated/prisma/enums';
import {
    EXPERIENCE_SAMPLE_THUMBNAIL_PATH,
    EXPERIENCE_SAMPLE_VIDEO_PATH,
} from '../../common/experience.constant';
import { CourseAccessService } from './course-access.service';

@Injectable()
export class CourseExperienceService {
    private readonly logger = new Logger(CourseExperienceService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: StorageService,
        private readonly access: CourseAccessService,
    ) {}

    /**
     * 체험을 마치고 샘플 추억영상을 돌려준다.
     *
     * 체험에서 올린 사진은 한쪽뿐이라 영상으로 만들면 짧고 빈약해진다.
     * 실제 서비스의 영상이 어떤지 보여 주는 게 목적이라 미리 만든 샘플을 쓴다.
     *
     * 실제 완료 처리(completeCourse)를 타지 않는다. 그 경로는 포인트와 스탬프를 주는데,
     * 가상 상대와의 체험으로 실제 기록이 쌓이면 안 되기 때문이다.
     * 다만 매칭을 닫는 일은 그쪽과 똑같이 해 준다 — 안 닫으면 다음 매칭을 못 한다.
     *
     * 이미 끝낸 체험이면 상태는 두고 영상 URL만 다시 준다.
     * 서명 URL이 24시간이라 나중에 다시 볼 때도 새로 받아야 한다.
     */
    async finish(userId: string, courseId: string) {
        const course = await this.access.loadCourseForUser(courseId, userId);

        const attempt = await this.prisma.matchAttempt.findUniqueOrThrow({
            where: { id: course.matchAttemptId },
            select: {
                isExperience: true,
                matchingA: { select: { id: true } },
                matchingB: { select: { id: true } },
            },
        });

        if (!attempt.isExperience) {
            throw new BadRequestException('체험 매칭 코스가 아닙니다.');
        }

        if (course.status !== CourseStatus.COMPLETED) {
            await this.prisma.$transaction(async (tx) => {
                await tx.course.update({
                    where: { id: courseId },
                    data: {
                        status: CourseStatus.COMPLETED,
                        completedAt: new Date(),
                    },
                });

                /*
                 * 매칭을 닫아야 다음 매칭을 걸 수 있다.
                 * 새 매칭은 "끝나지 않은 매칭이 있으면"(endedAt: null) 막히기 때문에,
                 * 여기서 닫지 않으면 체험을 마친 사용자가 아무것도 못 하게 된다.
                 *
                 * 이미 닫힌 매칭(거절 3회로 EXHAUSTED된 경우 등)은 건드리지 않는다.
                 */
                await tx.matching.updateMany({
                    where: {
                        id: { in: [attempt.matchingA.id, attempt.matchingB.id] },
                        endedAt: null,
                    },
                    data: { endedAt: new Date() },
                });
            });

            this.logger.log(`체험 완료: course=${courseId}`);
        }

        const [videoUrl, thumbnailUrl] = await Promise.all([
            this.storage.signedUrl(EXPERIENCE_SAMPLE_VIDEO_PATH),
            this.storage.signedUrl(EXPERIENCE_SAMPLE_THUMBNAIL_PATH),
        ]);

        return {
            courseId,
            status: CourseStatus.COMPLETED,
            sampleVideo: { videoUrl, thumbnailUrl },
        };
    }
}