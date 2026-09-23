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
     *
     * 이미 끝낸 체험이면 상태는 두고 영상 URL만 다시 준다.
     * 서명 URL이 24시간이라 나중에 다시 볼 때도 새로 받아야 한다.
     */
    async finish(userId: string, courseId: string) {
        const course = await this.access.loadCourseForUser(courseId, userId);

        const attempt = await this.prisma.matchAttempt.findUniqueOrThrow({
            where: { id: course.matchAttemptId },
            select: { isExperience: true },
        });

        if (!attempt.isExperience) {
            throw new BadRequestException('체험 매칭 코스가 아닙니다.');
        }

        if (course.status !== CourseStatus.COMPLETED) {
            await this.prisma.course.update({
                where: { id: courseId },
                data: {
                    status: CourseStatus.COMPLETED,
                    completedAt: new Date(),
                },
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