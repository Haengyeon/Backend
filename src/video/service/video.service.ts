import {
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CourseStatus, VideoStatus } from '../../generated/prisma/enums';

@Injectable()
export class VideoService {
    private readonly logger = new Logger(VideoService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: StorageService,
    ) {}

    /**
     * 영상 제작을 요청한다.
     *
     * 렌더링은 수십 초 이상 걸리므로 여기서는 대기열에만 올리고 바로 응답한다.
     * 실제 작업은 CourseVideoScheduler가 가져간다.
     */
    async request(userId: string, courseId: string) {
        const course = await this.findParticipantCourse(userId, courseId);

        if (course.status !== CourseStatus.COMPLETED) {
            throw new ConflictException(
                '여행을 마친 뒤에 영상을 만들 수 있습니다.',
            );
        }

        const photoCount = await this.prisma.courseMissionPhoto.count({
            where: { mission: { courseId } },
        });

        if (photoCount === 0) {
            throw new ConflictException(
                '인증샷이 있어야 영상을 만들 수 있습니다.',
            );
        }

        const existing = await this.prisma.courseVideo.findUnique({
            where: { courseId },
        });

        if (existing) {
            // 실패한 건은 다시 시도할 수 있게 열어 준다
            if (existing.status === VideoStatus.FAILED) {
                return this.prisma.courseVideo.update({
                    where: { courseId },
                    data: { status: VideoStatus.PENDING, errorMessage: null },
                });
            }

            throw new ConflictException('이미 영상 제작을 요청했습니다.');
        }

        return this.prisma.courseVideo.create({
            data: { courseId, status: VideoStatus.PENDING },
        });
    }

    /** 제작 상태 조회. 프론트가 폴링한다. */
    async findOne(userId: string, courseId: string) {
        await this.findParticipantCourse(userId, courseId);

        const video = await this.prisma.courseVideo.findUnique({
            where: { courseId },
        });

        if (!video) {
            throw new NotFoundException('제작된 영상이 없습니다.');
        }

        // DB에는 오브젝트 경로만 있다. 버킷이 비공개라 볼 때마다 서명 URL을 새로 낸다.
        if (video.status !== VideoStatus.COMPLETED) return video;

        return {
            ...video,
            videoUrl: video.videoUrl
                ? await this.storage.signedUrl(video.videoUrl)
                : null,
            thumbnailUrl: video.thumbnailUrl
                ? await this.storage.signedUrl(video.thumbnailUrl)
                : null,
        };
    }

    /** 코스 참가자인지 확인하고 코스를 돌려준다. */
    private async findParticipantCourse(userId: string, courseId: string) {
        const course = await this.prisma.course.findUnique({
            where: { id: courseId },
            include: {
                matchAttempt: {
                    select: {
                        matchingA: { select: { userId: true } },
                        matchingB: { select: { userId: true } },
                    },
                },
            },
        });

        if (!course) {
            throw new NotFoundException('코스를 찾을 수 없습니다.');
        }

        const { matchingA, matchingB } = course.matchAttempt;

        if (matchingA.userId !== userId && matchingB.userId !== userId) {
            throw new ForbiddenException('해당 코스에 대한 권한이 없습니다.');
        }

        return course;
    }
}