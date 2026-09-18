import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { VIDEO_HEIGHT, VIDEO_WIDTH } from './scene-renderer.service';

const ffmpegPath: string =
    process.env.FFMPEG_PATH ||
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@ffmpeg-installer/ffmpeg').path;

const FPS = 30;
const TRANSITION_SECONDS = 0.5;

// 음악이 뚝 끊기면 어색해서 끝부분을 서서히 줄인다
const AUDIO_FADE_OUT_SECONDS = 2;

export interface EncodeSegment {
    /** 이미 그려진 1080x1920 PNG */
    png: Buffer;
    durationSeconds: number;
    motion: 'still' | 'slowPush' | 'slowPull' | 'driftLeft' | 'driftRight';
    transition: 'softFade' | 'whiteFlash' | 'hardCut' | 'dipToBlack';
}

/**
 * 장면 PNG들을 이어 붙여 mp4로 만든다.
 *
 * 브라우저를 쓰지 않는다. 움직임은 정지 이미지에 zoompan을 걸어 만든다.
 * 프레임을 하나하나 그리는 것보다 훨씬 가볍고, 결과도 충분히 자연스럽다.
 */
@Injectable()
export class VideoEncoderService {
    private readonly logger = new Logger(VideoEncoderService.name);

    async encode(
        segments: EncodeSegment[],
        workDir: string,
        bgmPath?: string | null,
    ): Promise<string> {
        if (!ffmpegPath) {
            throw new Error('ffmpeg 바이너리를 찾을 수 없습니다.');
        }

        const inputPaths: string[] = [];

        for (const [index, segment] of segments.entries()) {
            const filePath = join(
                workDir,
                `scene-${String(index).padStart(2, '0')}.png`,
            );

            await writeFile(filePath, segment.png);
            inputPaths.push(filePath);
        }

        const outputPath = join(workDir, 'output.mp4');
        const args = this.buildArgs(
            segments,
            inputPaths,
            outputPath,
            bgmPath,
        );

        await this.run(ffmpegPath, args);

        return outputPath;
    }

    private buildArgs(
        segments: EncodeSegment[],
        inputPaths: string[],
        outputPath: string,
        bgmPath?: string | null,
    ): string[] {
        const args: string[] = ['-y'];

        // 정지 이미지를 지정한 길이만큼 반복 재생시킨다
        for (const [index, segment] of segments.entries()) {
            args.push(
                '-loop',
                '1',
                '-t',
                segment.durationSeconds.toFixed(2),
                '-i',
                inputPaths[index],
            );
        }

        // 입력 번호는 -i 순서대로 매겨진다.
        // 이미지가 0 ~ N-1을 쓰므로 음원은 N번이 된다.
        if (bgmPath) {
            args.push('-i', bgmPath);
        }

        const filters: string[] = [];

        for (const [index, segment] of segments.entries()) {
            filters.push(
                `[${index}:v]${this.motionFilter(segment)},` +
                `format=pix_fmts=yuv420p,setsar=1[v${index}]`,
            );
        }

        // xfade는 두 입력을 겹쳐 하나로 만든다. 순서대로 접어 나간다.
        let current = 'v0';
        let elapsed = segments[0].durationSeconds;

        for (let index = 1; index < segments.length; index++) {
            const segment = segments[index];
            const duration =
                segment.transition === 'hardCut' ? 0.01 : TRANSITION_SECONDS;

            // 전환이 겹치는 만큼 전체 길이가 줄어든다
            const offset = Math.max(0, elapsed - duration);
            const label = index === segments.length - 1 ? 'out' : `x${index}`;

            filters.push(
                `[${current}][v${index}]xfade=` +
                `transition=${this.xfadeName(segment.transition)}:` +
                `duration=${duration}:offset=${offset.toFixed(2)}[${label}]`,
            );

            current = label;
            elapsed = offset + segment.durationSeconds;
        }

        args.push(
            '-filter_complex',
            filters.join(';'),
            '-map',
            segments.length > 1 ? '[out]' : '[v0]',
        );

        if (bgmPath) {
            const fadeStart = Math.max(
                0,
                this.totalSeconds(segments) - AUDIO_FADE_OUT_SECONDS,
            );

            args.push(
                '-map',
                `${segments.length}:a`,
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-af',
                `afade=t=out:st=${fadeStart.toFixed(2)}:d=${AUDIO_FADE_OUT_SECONDS}`,
                // 음악이 영상보다 길어도 영상이 끝나면 함께 멈춘다
                '-shortest',
            );
        }

        args.push(
            '-r',
            String(FPS),
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '23',
            '-movflags',
            '+faststart',
            outputPath,
        );

        return args;
    }

    /** 전환이 겹치는 만큼 실제 길이는 각 장면 합보다 짧다. */
    private totalSeconds(segments: EncodeSegment[]): number {
        const overlap = (segments.length - 1) * TRANSITION_SECONDS;
        const sum = segments.reduce(
            (total, segment) => total + segment.durationSeconds,
            0,
        );

        return Math.max(0, sum - overlap);
    }

    /**
     * 정지 이미지에 움직임을 준다.
     *
     * zoompan은 프레임 단위로 확대 배율을 바꾼다.
     * 확대하면 가장자리가 잘리므로 미리 살짝 키워 두고 잘라 쓴다.
     */
    private motionFilter(segment: EncodeSegment): string {
        const frames = Math.round(segment.durationSeconds * FPS);
        const size = `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`;

        switch (segment.motion) {
            case 'slowPush':
                return (
                    `scale=${VIDEO_WIDTH * 2}:-1,` +
                    `zoompan=z='min(zoom+0.0006,1.12)':d=${frames}:` +
                    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${size}:fps=${FPS}`
                );

            case 'slowPull':
                return (
                    `scale=${VIDEO_WIDTH * 2}:-1,` +
                    `zoompan=z='if(eq(on,1),1.12,max(zoom-0.0006,1.0))':d=${frames}:` +
                    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${size}:fps=${FPS}`
                );

            case 'driftLeft':
            case 'driftRight': {
                // 살짝 확대해 둔 뒤 가로로 밀어 여백이 드러나지 않게 한다
                const direction = segment.motion === 'driftLeft' ? '-' : '+';

                return (
                    `scale=${Math.round(VIDEO_WIDTH * 1.12)}:-1,` +
                    `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:` +
                    `'(iw-ow)/2${direction}(iw-ow)/2*(t/${segment.durationSeconds.toFixed(2)})':0,` +
                    `fps=${FPS}`
                );
            }

            default:
                return `scale=${size},fps=${FPS}`;
        }
    }

    private xfadeName(transition: EncodeSegment['transition']): string {
        switch (transition) {
            case 'whiteFlash':
                return 'fadewhite';
            case 'dipToBlack':
                return 'fadeblack';
            case 'hardCut':
                return 'fade';
            default:
                return 'fade';
        }
    }

    private run(binary: string, args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = spawn(binary, args);

            let stderr = '';

            // ffmpeg은 진행 상황도 stderr로 보낸다. 실패했을 때만 쓴다.
            child.stderr.on('data', (chunk: Buffer) => {
                stderr += chunk.toString();
            });

            child.on('error', reject);

            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                    return;
                }

                this.logger.error(
                    `ffmpeg 종료 코드 ${code}\n${stderr.slice(-2000)}`,
                );
                reject(new Error('영상 인코딩에 실패했습니다.'));
            });
        });
    }
}