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
const HARD_CUT_SECONDS = 0.01;

// 음악이 뚝 끊기면 어색해서 끝부분을 서서히 줄인다
const AUDIO_FADE_OUT_SECONDS = 2;

// 어딘가 잘못돼 무한정 도는 것을 막는다. 8분이면 정상적인 영상은 충분히 끝난다.
const ENCODE_TIMEOUT_MS = 8 * 60 * 1000;

// 실패했을 때만 쓰는 로그라 뒤쪽 일부만 남긴다
const STDERR_MAX_LENGTH = 16_000;

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
 *
 * 인코딩은 CPU를 오래 붙잡는 작업이라, 같은 서버가 API 요청도 받는 동안
 * 응답이 밀리지 않도록 스레드 수와 프로세스 우선순위를 낮춰서 돌린다.
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

        this.validateSegments(segments);

        // 장면 길이를 프레임 단위로 맞춘다.
        // 소수점이 남으면 전환 지점이 프레임 사이에 걸려 한 컷이 튀어 보인다.
        const normalized: EncodeSegment[] = segments.map((segment) => ({
            ...segment,
            durationSeconds:
                Math.max(1, Math.round(segment.durationSeconds * FPS)) / FPS,
        }));

        const inputPaths: string[] = [];

        for (const [index, segment] of normalized.entries()) {
            const filePath = join(
                workDir,
                `scene-${String(index).padStart(2, '0')}.png`,
            );

            await writeFile(filePath, segment.png);
            inputPaths.push(filePath);
        }

        const outputPath = join(workDir, 'output.mp4');
        const totalSeconds = this.totalSeconds(normalized);

        const args = this.buildArgs(
            normalized,
            inputPaths,
            outputPath,
            bgmPath,
        );

        const startedAt = Date.now();

        this.logger.log(
            `인코딩 시작: 장면 ${normalized.length}개, ` +
            `길이 ${totalSeconds.toFixed(1)}초`,
        );

        await this.run(args);

        this.logger.log(
            `인코딩 완료: ${((Date.now() - startedAt) / 1000).toFixed(1)}초 소요`,
        );

        return outputPath;
    }

    private validateSegments(segments: EncodeSegment[]): void {
        if (segments.length === 0) {
            throw new Error('인코딩할 장면이 없습니다.');
        }

        for (const [index, segment] of segments.entries()) {
            if (
                !Number.isFinite(segment.durationSeconds) ||
                segment.durationSeconds <= 0
            ) {
                throw new Error(
                    `${index + 1}번 장면의 재생 시간이 올바르지 않습니다.`,
                );
            }

            if (!segment.png?.length) {
                throw new Error(`${index + 1}번 장면의 이미지가 없습니다.`);
            }
        }
    }

    private buildArgs(
        segments: EncodeSegment[],
        inputPaths: string[],
        outputPath: string,
        bgmPath?: string | null,
    ): string[] {
        const args: string[] = [
            '-y',
            '-nostdin',
            '-hide_banner',
            '-loglevel',
            'warning',

            // 필터가 코어를 다 쓰지 않도록 묶어 둔다.
            // 영상이 조금 늦게 나오더라도 API 응답이 밀리지 않는 쪽이 낫다.
            '-filter_threads',
            '1',
            '-filter_complex_threads',
            '1',
        ];

        // 정지 이미지를 지정한 길이만큼 반복 재생시킨다
        for (const [index, segment] of segments.entries()) {
            args.push(
                '-loop',
                '1',
                '-framerate',
                String(FPS),
                '-t',
                segment.durationSeconds.toFixed(6),
                '-threads',
                '1',
                '-i',
                inputPaths[index],
            );
        }

        // 입력 번호는 -i 순서대로 매겨진다.
        // 이미지가 0 ~ N-1을 쓰므로 음원은 N번이 된다.
        // 음악이 영상보다 짧으면 반복해서 끝까지 채운다.
        if (bgmPath) {
            args.push('-stream_loop', '-1', '-i', bgmPath);
        }

        const filters: string[] = [];

        for (const [index, segment] of segments.entries()) {
            const frames = Math.max(
                1,
                Math.round(segment.durationSeconds * FPS),
            );

            filters.push(
                `[${index}:v]${this.motionFilter(segment)},` +
                // zoompan이 프레임을 한두 개 더 뱉는 경우가 있어 잘라 맞춘다
                `trim=end_frame=${frames},` +
                `settb=AVTB,setpts=PTS-STARTPTS,` +
                `format=pix_fmts=yuv420p,setsar=1[v${index}]`,
            );
        }

        // xfade는 두 입력을 겹쳐 하나로 만든다. 순서대로 접어 나간다.
        let current = 'v0';
        let elapsed = segments[0].durationSeconds;

        for (let index = 1; index < segments.length; index++) {
            const duration = this.transitionSeconds(segments, index);

            // 전환이 겹치는 만큼 전체 길이가 줄어든다
            const offset = Math.max(0, elapsed - duration);
            const label = `x${index}`;

            filters.push(
                `[${current}][v${index}]xfade=` +
                `transition=${this.xfadeName(segments[index].transition)}:` +
                `duration=${duration.toFixed(6)}:` +
                `offset=${offset.toFixed(6)}[${label}]`,
            );

            current = label;
            elapsed = offset + segments[index].durationSeconds;
        }

        args.push('-filter_complex', filters.join(';'), '-map', `[${current}]`);

        const totalSeconds = this.totalSeconds(segments);

        if (bgmPath) {
            const fadeDuration = Math.min(
                AUDIO_FADE_OUT_SECONDS,
                totalSeconds,
            );
            const fadeStart = Math.max(0, totalSeconds - fadeDuration);

            args.push(
                '-map',
                `${segments.length}:a:0`,
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-af',
                `afade=t=out:st=${fadeStart.toFixed(6)}:d=${fadeDuration.toFixed(6)}`,
                // 음악을 무한 반복시켰으므로 영상 길이에서 끊어야 한다
                '-shortest',
            );
        } else {
            args.push('-an');
        }

        args.push(
            // 필터 계산이 어긋나도 영상이 늘어지지 않도록 길이를 못 박는다
            '-t',
            totalSeconds.toFixed(6),
            '-r',
            String(FPS),
            '-c:v',
            'libx264',
            '-threads:v',
            '1',
            '-preset',
            'veryfast',
            '-crf',
            '23',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            outputPath,
        );

        return args;
    }

    /**
     * 짧은 장면에서 앞뒤 전환이 겹치지 않도록 이웃 장면 길이의 절반으로 제한한다.
     * 겹치면 xfade offset이 음수가 되어 인코딩이 실패한다.
     */
    private transitionSeconds(
        segments: EncodeSegment[],
        index: number,
    ): number {
        const requested =
            segments[index].transition === 'hardCut'
                ? HARD_CUT_SECONDS
                : TRANSITION_SECONDS;

        return Math.min(
            requested,
            segments[index - 1].durationSeconds / 2,
            segments[index].durationSeconds / 2,
        );
    }

    /** 전환이 겹치는 만큼 실제 길이는 각 장면 합보다 짧다. */
    private totalSeconds(segments: EncodeSegment[]): number {
        const sum = segments.reduce(
            (total, segment) => total + segment.durationSeconds,
            0,
        );

        let overlap = 0;

        for (let index = 1; index < segments.length; index++) {
            overlap += this.transitionSeconds(segments, index);
        }

        return Math.max(1 / FPS, sum - overlap);
    }

    /**
     * 정지 이미지에 움직임을 준다.
     *
     * 원본 크기 그대로 두고 zoompan의 배율만 키운다.
     * 미리 확대해 두면(예: 가로 2배) 픽셀이 네 배가 되어 인코딩이 그만큼 느려진다.
     *
     * 배율을 누적(zoom+0.0006)하지 않고 진행률로 계산하는 이유는,
     * 장면 길이가 달라도 시작과 끝 배율이 항상 같아지기 때문이다.
     */
    private motionFilter(segment: EncodeSegment): string {
        const frames = Math.max(
            2,
            Math.round(segment.durationSeconds * FPS),
        );

        const size = `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`;
        const base = `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`;
        const progress = `min(on/${frames - 1},1)`;
        const centerX = 'iw/2-(iw/zoom/2)';
        const centerY = 'ih/2-(ih/zoom/2)';

        switch (segment.motion) {
            case 'slowPush':
                return (
                    `${base},` +
                    `zoompan=z='1+0.12*${progress}':d=1:` +
                    `x='${centerX}':y='${centerY}':s=${size}:fps=${FPS}`
                );

            case 'slowPull':
                return (
                    `${base},` +
                    `zoompan=z='1.12-0.12*${progress}':d=1:` +
                    `x='${centerX}':y='${centerY}':s=${size}:fps=${FPS}`
                );

            case 'driftLeft':
            case 'driftRight': {
                // 살짝 확대해 둔 뒤 가로로 밀어 여백이 드러나지 않게 한다
                const direction = segment.motion === 'driftLeft' ? '-' : '+';
                const seconds = segment.durationSeconds.toFixed(6);

                return (
                    `scale=${Math.round(VIDEO_WIDTH * 1.12)}:-1,` +
                    `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:` +
                    `'(iw-ow)/2${direction}(iw-ow)/2*min(t/${seconds},1)':` +
                    `'(ih-oh)/2',` +
                    `fps=${FPS}`
                );
            }

            default:
                return `${base},fps=${FPS}`;
        }
    }

    private xfadeName(transition: EncodeSegment['transition']): string {
        switch (transition) {
            case 'whiteFlash':
                return 'fadewhite';

            case 'dipToBlack':
                return 'fadeblack';

            // hardCut은 전환 시간을 0.01초로 줘서 사실상 잘라 붙인 효과를 낸다
            case 'hardCut':
            case 'softFade':
            default:
                return 'fade';
        }
    }

    /**
     * ffmpeg을 실행한다.
     *
     * nice로 우선순위를 낮춰서 돌린다. 스레드를 하나로 묶어도 그 코어를 100% 쓰면
     * API 요청이 뒤로 밀리는데, 우선순위를 낮추면 요청이 들어올 때 CPU를 양보한다.
     * 영상 제작이 조금 늦어지는 대신 서비스 응답이 일정해진다.
     */
    private run(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const useNice = process.env.DISABLE_FFMPEG_NICE !== 'true';

            const child = useNice
                ? spawn('nice', ['-n', '19', ffmpegPath, ...args], {
                    stdio: ['ignore', 'ignore', 'pipe'],
                    // nice가 부모라서, 프로세스 그룹을 만들어야 타임아웃 때 ffmpeg까지 함께 정리된다
                    detached: true,
                })
                : spawn(ffmpegPath, args, {
                    stdio: ['ignore', 'ignore', 'pipe'],
                });

            let stderr = '';
            let timedOut = false;
            let spawnError: Error | undefined;

            const timer = setTimeout(() => {
                timedOut = true;

                this.logger.error(
                    `인코딩 제한 시간 초과 (${ENCODE_TIMEOUT_MS / 60_000}분)`,
                );

                this.kill(child.pid, useNice);
            }, ENCODE_TIMEOUT_MS);

            // ffmpeg은 진행 상황도 stderr로 보낸다. 실패했을 때만 쓴다.
            child.stderr?.on('data', (chunk: Buffer) => {
                stderr = (stderr + chunk.toString()).slice(-STDERR_MAX_LENGTH);
            });

            child.on('error', (error: Error) => {
                spawnError = error;
            });

            child.on('close', (code, signal) => {
                clearTimeout(timer);

                if (timedOut) {
                    reject(new Error('영상 인코딩 제한 시간을 초과했습니다.'));
                    return;
                }

                if (spawnError) {
                    this.logger.error(`ffmpeg 실행 오류: ${spawnError.message}`);
                    reject(
                        new Error('영상 인코딩 프로세스를 실행하지 못했습니다.'),
                    );
                    return;
                }

                if (code === 0) {
                    resolve();
                    return;
                }

                this.logger.error(
                    `ffmpeg 종료 코드=${code}, signal=${signal}\n` +
                    stderr.slice(-4000),
                );

                reject(new Error('영상 인코딩에 실패했습니다.'));
            });
        });
    }

    /** detached로 띄웠으면 그룹째 죽여야 자식 ffmpeg이 남지 않는다. */
    private kill(pid: number | undefined, grouped: boolean): void {
        if (!pid) return;

        try {
            process.kill(grouped ? -pid : pid, 'SIGKILL');
        } catch (error) {
            this.logger.warn(`인코딩 프로세스 종료 실패: ${String(error)}`);
        }
    }
}