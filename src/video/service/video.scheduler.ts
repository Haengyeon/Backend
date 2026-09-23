import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus, VideoStatus } from '../../generated/prisma/enums';
import { REGION_LABEL } from '../../course/algorithm/labels';
import { sigunguNameOf } from '../../course/algorithm/sigungu-name';
import { StorageService } from '../../storage/storage.service';
import type { Storyboard } from '../storyboard.schema';
import {
    StoryboardService,
    StoryboardPhoto,
} from './storyboard.service';
import { VideoRenderService } from './video-render.service';

const MAX_ATTEMPTS = 2;

// VideoRenderService의 오프닝 2.6초와 엔딩 3.2초를 제외한 시간이다.
const TARGET_SCENE_SECONDS = 30 - 2.6 - 3.2;

// 렌더링 도중 서버가 재시작되면 PROCESSING인 채로 남는다.
// 이 시간이 지나도록 끝나지 않은 건은 죽은 작업으로 보고 되돌린다.
const STALE_PROCESSING_MS = 10 * 60 * 1000;

@Injectable()
export class VideoScheduler {
    private readonly logger = new Logger(VideoScheduler.name);
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly storyboard: StoryboardService,
        private readonly render: VideoRenderService,
        private readonly storage: StorageService,
    ) {}

    /**
     * 여행을 마친 코스를 찾아 영상 제작 대기열에 올린다.
     *
     * 사용자나 프론트가 따로 요청하지 않아도 되도록 서버가 알아서 집어간다.
     * 이미 CourseVideo가 있는 코스는 건너뛰므로 여러 번 돌아도 중복되지 않는다.
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async enqueueCompletedCourses() {
        const courses = await this.prisma.course.findMany({
            where: {
                status: CourseStatus.COMPLETED,
                video: null,
                // 체험 코스는 샘플 영상을 보여주므로 실제로 만들지 않는다
                matchAttempt: { isExperience: false },
                // 인증샷이 한 장도 없으면 만들 영상이 없다
                missions: { some: { photos: { some: {} } } },
            },
            select: { id: true },
            take: 20,
        });

        if (courses.length === 0) return;

        await this.prisma.courseVideo.createMany({
            data: courses.map((course) => ({
                courseId: course.id,
                status: VideoStatus.PENDING,
            })),
            skipDuplicates: true,
        });

        this.logger.log(`영상 제작 대기열 등록: ${courses.length}건`);
    }

    @Cron(CronExpression.EVERY_30_SECONDS)
    async processQueue() {
        // 이전 작업이 아직 끝나지 않았으면 건너뛴다.
        // 크론 주기보다 렌더가 오래 걸리는 게 정상이라 이 가드가 필요하다.
        if (this.running) return;

        await this.recoverStale();

        const pending = await this.prisma.courseVideo.findFirst({
            where: {
                status: VideoStatus.PENDING,
                attemptCount: { lt: MAX_ATTEMPTS },
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true, courseId: true },
        });

        if (!pending) return;

        this.running = true;

        try {
            await this.processOne(pending.id, pending.courseId);
        } catch (error) {
            await this.markFailed(pending.id, error as Error);
        } finally {
            this.running = false;
        }
    }

    /** 렌더 도중 서버가 죽어 PROCESSING에 갇힌 건을 되돌린다. */
    private async recoverStale(): Promise<void> {
        const result = await this.prisma.courseVideo.updateMany({
            where: {
                status: VideoStatus.PROCESSING,
                updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) },
            },
            data: { status: VideoStatus.PENDING },
        });

        if (result.count > 0) {
            this.logger.warn(`멈춰 있던 영상 작업 복구: ${result.count}건`);
        }
    }

    private async processOne(videoId: string, courseId: string): Promise<void> {
        await this.prisma.courseVideo.update({
            where: { id: videoId },
            data: {
                status: VideoStatus.PROCESSING,
                attemptCount: { increment: 1 },
            },
        });

        this.logger.log(`영상 제작 시작: course=${courseId}`);

        const context = await this.collectContext(courseId);

        this.logger.log(
            `인증샷 ${context.photos.length}장, 장소 ${context.photoGroups.length}곳 수집 완료`,
        );

        const spotPlans: Storyboard[] = [];

        // 장소마다 따로 구성해 서로 다른 장소의 사진이 섞이지 않게 한다.
        // photoGroups는 코스 방문 순서대로 들어 있다.
        for (const group of context.photoGroups) {
            const spotPlan = await this.storyboard.generate({
                title: context.title,
                regionLabel: context.regionLabel,
                sigunguNames: context.sigunguNames,
                themeLabel: context.themeLabel,
                travelDate: context.travelDate,
                reviewHints: context.reviewHints,
                photos: group.map((photo, index) => ({
                    ...photo,
                    // AI에 넘기는 사진 번호는 장소마다 1부터 시작한다.
                    index: index + 1,
                })),
            });

            spotPlans.push({
                ...spotPlan,
                scenes: spotPlan.scenes.map((scene) => ({
                    ...scene,
                    photoPlacements: scene.photoPlacements.map((placement) => {
                        const originalPhoto = group[placement.photoIndex - 1];

                        if (!originalPhoto) {
                            throw new Error(
                                `장소별 사진 번호가 올바르지 않습니다: ${placement.photoIndex}`,
                            );
                        }

                        return {
                            ...placement,
                            // 렌더러가 전체 사진 배열을 참조하도록 번호를 복원한다.
                            photoIndex: originalPhoto.index,
                        };
                    }),
                })),
            });
        }

        const firstPlan = spotPlans[0];
        const lastPlan = spotPlans[spotPlans.length - 1];

        if (!firstPlan || !lastPlan) {
            throw new Error('영상에 사용할 장면이 없습니다.');
        }

        // 첫 번째 장소의 장면부터 마지막 장소의 장면까지 순서대로 합친다.
        const scenes = spotPlans.flatMap((spotPlan) => spotPlan.scenes);

        if (
            scenes.length === 0 ||
            scenes.some(
                (scene) =>
                    !Number.isFinite(scene.durationSeconds) ||
                    scene.durationSeconds <= 0,
            )
        ) {
            throw new Error('영상 장면의 재생 시간이 올바르지 않습니다.');
        }

        const totalSceneSeconds = scenes.reduce(
            (sum, scene) => sum + scene.durationSeconds,
            0,
        );

        // 오프닝과 엔딩은 한 번씩만 사용한다.
        // 장소별 영상을 합쳐도 전체 길이가 약 30초가 되도록 시간을 배분한다.
        const plan: Storyboard = {
            ...firstPlan,
            opening: firstPlan.opening,
            closing: lastPlan.closing,
            scenes: scenes.map((scene) => ({
                ...scene,
                durationSeconds:
                    (scene.durationSeconds / totalSceneSeconds) *
                    TARGET_SCENE_SECONDS,
            })),
        };

        const result = await this.render.render({
            courseId,
            plan,
            photoBuffers: context.photos.map((photo) => photo.buffer),
        });

        await this.prisma.courseVideo.update({
            where: { id: videoId },
            data: {
                status: VideoStatus.COMPLETED,
                // 버킷이 비공개라 URL이 아니라 오브젝트 경로를 저장하고,
                // 조회할 때마다 서명 URL로 바꿔 내보낸다
                videoUrl: result.videoPath,
                thumbnailUrl: result.thumbnailPath,
                completedAt: new Date(),
                errorMessage: null,
            },
        });

        this.logger.log(`영상 제작 완료: course=${courseId}`);
    }

    /** 코스·사진·후기를 모아 AI에 넘길 형태로 만든다. */
    private async collectContext(courseId: string) {
        const course = await this.prisma.course.findUniqueOrThrow({
            where: { id: courseId },
            include: {
                spots: {
                    orderBy: { order: 'asc' },
                    include: {
                        missions: {
                            include: {
                                photos: { orderBy: { createdAt: 'asc' } },
                            },
                        },
                    },
                },
                reviews: { select: { content: true } },
                spotReviews: { select: { content: true } },
            },
        });

        const photos: StoryboardPhoto[] = [];
        const photoGroups: StoryboardPhoto[][] = [];

        for (const spot of course.spots) {
            const spotPhotos: StoryboardPhoto[] = [];

            // 같은 장소의 사진은 사용자·미션 구분 없이 업로드 시간순으로 모은다.
            const orderedPhotos = spot.missions
                .flatMap((mission) => mission.photos)
                .sort((a, b) => {
                    const timeDiff =
                        a.createdAt.getTime() - b.createdAt.getTime();

                    return timeDiff || String(a.id).localeCompare(String(b.id));
                });

            for (const photo of orderedPhotos) {
                const downloaded = await this.download(photo.imageUrl);

                const storyboardPhoto: StoryboardPhoto = {
                    // 전체 사진 배열에서 사용하는 번호다.
                    index: photos.length + 1,
                    buffer: downloaded.buffer,
                    contentType: downloaded.contentType,
                    spotName: spot.name,
                    category: spot.category ?? '',
                    comment: photo.comment ?? '',
                    isMine: false,
                    createdAt: photo.createdAt,
                };

                photos.push(storyboardPhoto);
                spotPhotos.push(storyboardPhoto);
            }

            // 사진이 없는 장소는 영상에서 건너뛴다.
            if (spotPhotos.length > 0) {
                photoGroups.push(spotPhotos);
            }
        }

        if (photos.length === 0) {
            throw new Error('인증샷이 없어 영상을 만들 수 없습니다.');
        }

        return {
            title: course.title,
            regionLabel: REGION_LABEL[course.region],
            sigunguNames: course.sigunguCode
                ? [sigunguNameOf(course.region, course.sigunguCode)]
                : [],
            themeLabel: course.theme,
            travelDate: course.travelDate,
            // 후기는 그날 분위기를 가늠하는 힌트로만 쓴다. 자막에 그대로 인용하지 않는다.
            reviewHints: [
                ...course.reviews.map((r) => r.content),
                ...course.spotReviews.map((r) => r.content),
            ].slice(0, 6),
            photos,
            photoGroups,
        };
    }

    /**
     * 인증샷을 내려받는다.
     *
     * 버킷이 비공개라 저장된 경로로 바로 접근할 수 없다.
     * 서명 URL을 발급받아 받아온 뒤, AI 전달과 렌더링에 같은 버퍼를 쓴다.
     */
    private async download(
        objectPath: string,
    ): Promise<{ buffer: Buffer; contentType: string }> {
        // 이미 완전한 URL이면 그대로 쓴다 (시드 데이터 등)
        const url = objectPath.startsWith('http')
            ? objectPath
            : await this.storage.signedUrl(objectPath);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                `인증샷을 불러오지 못했습니다 (${response.status}): ${objectPath}`,
            );
        }

        return {
            buffer: Buffer.from(await response.arrayBuffer()),
            contentType: response.headers.get('content-type') ?? 'image/jpeg',
        };
    }

    private async markFailed(videoId: string, error: Error): Promise<void> {
        this.logger.error('영상 제작 실패', error);

        await this.prisma.courseVideo.update({
            where: { id: videoId },
            data: {
                status: VideoStatus.FAILED,
                // 사용자에게 그대로 보여줄 수 있는 수준으로만 남긴다
                errorMessage: error.message.slice(0, 200),
            },
        });
    }
}