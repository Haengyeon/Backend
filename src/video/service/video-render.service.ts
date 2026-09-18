import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { StorageService } from '../../storage/storage.service';
import type { Storyboard } from '../storyboard.schema';
import { pickBgmPath } from '../bgm.util';
import { SceneRendererService } from './scene-renderer.service';
import { EncodeSegment, VideoEncoderService } from './video-encoder.service';

const OPENING_SECONDS = 2.6;
const CLOSING_SECONDS = 3.2;

export interface RenderResult {
    videoPath: string;
    thumbnailPath: string;
}

@Injectable()
export class VideoRenderService {
    private readonly logger = new Logger(VideoRenderService.name);

    constructor(
        private readonly sceneRenderer: SceneRendererService,
        private readonly encoder: VideoEncoderService,
        private readonly storage: StorageService,
    ) {}

    async render(params: {
        courseId: string;
        plan: Storyboard;
        photoBuffers: Buffer[];
    }): Promise<RenderResult> {
        const workDir = await mkdtemp(
            join(tmpdir(), 'haengyeon-video-'),
        );

        try {
            const segments = await this.buildSegments(
                params.plan,
                params.photoBuffers,
            );

            const bgmPath = pickBgmPath();

            this.logger.log(
                `선택된 BGM: ${bgmPath ?? '없음'}`,
            );

            const outputPath = await this.encoder.encode(
                segments,
                workDir,
                bgmPath,
            );

            const video = await readFile(outputPath);

            const thumbnail =
                segments[1]?.png ?? segments[0].png;

            // 같은 코스를 다시 제작해도 덮어쓰지 않도록
            // 제작마다 새로운 UUID를 파일명에 넣는다.
            const renderId = randomUUID();

            const videoPath =
                `ai-video/${params.courseId}/memory-${renderId}.mp4`;

            const thumbnailPath =
                `ai-video/${params.courseId}/thumbnail-${renderId}.png`;

            await this.storage.upload(
                videoPath,
                video,
                'video/mp4',
            );

            await this.storage.upload(
                thumbnailPath,
                thumbnail,
                'image/png',
            );

            this.logger.log(
                `영상 업로드 완료: course=${params.courseId}, render=${renderId}, ${Math.round(video.length / 1024)}KB`,
            );

            return {
                videoPath,
                thumbnailPath,
            };
        } finally {
            await rm(workDir, {
                recursive: true,
                force: true,
            });
        }
    }

    private async buildSegments(
        plan: Storyboard,
        photoBuffers: Buffer[],
    ): Promise<EncodeSegment[]> {
        const segments: EncodeSegment[] = [];

        segments.push({
            png: await this.sceneRenderer.renderOpening(
                plan.opening,
            ),
            durationSeconds: OPENING_SECONDS,
            motion: 'still',
            transition: 'softFade',
        });

        for (const scene of plan.scenes) {
            segments.push({
                png: await this.sceneRenderer.renderScene(
                    scene,
                    photoBuffers,
                ),
                durationSeconds: scene.durationSeconds,
                motion: scene.motion,
                transition: scene.transition,
            });
        }

        segments.push({
            png: await this.sceneRenderer.renderClosing(
                plan.closing,
            ),
            durationSeconds: CLOSING_SECONDS,
            motion: 'still',
            transition: 'dipToBlack',
        });

        return segments;
    }
}