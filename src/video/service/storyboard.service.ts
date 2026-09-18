import {
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInputContent } from 'openai/resources/responses/responses';

import { buildStoryboardSchema, Storyboard } from '../storyboard.schema';
import { buildSystemPrompt } from '../storyboard.prompt';

// 최초 요청 1회 + 사진 사용 검증 실패 시 추가 요청 2회
const MAX_GENERATION_ATTEMPTS = 3;

export interface StoryboardPhoto {
    /** 1부터 시작. AI가 참조하는 번호이자 렌더링 시 파일 순서 */
    index: number;

    /** 이미 내려받은 원본. 버킷이 비공개라 URL로는 바로 못 읽는다 */
    buffer: Buffer;

    contentType: string;
    spotName: string;
    category: string;
    comment: string;
    isMine: boolean;
    createdAt: Date;
}

export interface StoryboardContext {
    title: string;
    regionLabel: string;
    sigunguNames: string[];
    themeLabel: string;
    travelDate: Date;

    /** 후기는 분위기 참고용으로만 넘긴다. 자막에 그대로 쓰지 않는다. */
    reviewHints: string[];

    photos: StoryboardPhoto[];
}

@Injectable()
export class StoryboardService {
    private readonly logger = new Logger(StoryboardService.name);
    private client: OpenAI | null = null;

    private getClient(): OpenAI {
        if (this.client) {
            return this.client;
        }

        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            throw new InternalServerErrorException(
                'OPENAI_API_KEY 환경변수가 설정되지 않았습니다.',
            );
        }

        this.client = new OpenAI({ apiKey });

        return this.client;
    }

    async generate(context: StoryboardContext): Promise<Storyboard> {
        const photoCount = context.photos.length;

        if (photoCount === 0) {
            throw new InternalServerErrorException(
                '인증샷이 한 장도 없어 영상을 만들 수 없습니다.',
            );
        }

        const schema = buildStoryboardSchema(photoCount);
        const content = await this.buildUserContent(context);
        const client = this.getClient();

        let retryHint = '';

        for (
            let attempt = 1;
            attempt <= MAX_GENERATION_ATTEMPTS;
            attempt++
        ) {
            // 원본 사진과 설명은 유지하고, 재시도 시 수정 지시만 덧붙인다.
            const requestContent: ResponseInputContent[] = [
                ...content,
            ];

            if (retryHint) {
                requestContent.push({
                    type: 'input_text',
                    text: retryHint,
                });
            }

            const response = await client.responses.parse({
                model: process.env.OPENAI_MODEL ?? 'gpt-5.6-terra',
                input: [
                    {
                        role: 'system',
                        content: buildSystemPrompt(photoCount),
                    },
                    {
                        role: 'user',
                        content: requestContent,
                    },
                ],
                text: {
                    format: zodTextFormat(
                        schema,
                        'haengyeon_memory_video',
                    ),
                },
            });

            if (!response.output_parsed) {
                throw new InternalServerErrorException(
                    'AI 아트디렉션 결과를 받지 못했습니다.',
                );
            }

            /*
             * responses.parse()가 이미 Zod 기반 파싱을 수행하지만
             * 현재 SDK/스키마 타입 추론에서 output_parsed가 unknown으로
             * 잡히므로 명시적으로 다시 검증해 Storyboard 타입을 확정한다.
             */
            const plan = schema.parse(
                response.output_parsed,
            ) as Storyboard;

            try {
                this.validatePhotoUsage(plan, photoCount);
            } catch (error) {
                if (attempt === MAX_GENERATION_ATTEMPTS) {
                    this.logger.error(
                        `사진 사용 검증 최종 실패: ` +
                        `${MAX_GENERATION_ATTEMPTS}회 요청 모두 실패`,
                    );

                    throw error;
                }

                const used = plan.scenes.flatMap((scene) =>
                    scene.photoPlacements.map(
                        (placement) => placement.photoIndex,
                    ),
                );

                const expected = Array.from(
                    { length: photoCount },
                    (_, index) => index + 1,
                );

                retryHint =
                    `직전 생성 결과가 사진 중복 또는 누락으로 검증에 실패했다.\n` +
                    `직전 결과에서 사용한 사진 번호: ${JSON.stringify(used)}\n` +
                    `반드시 각각 한 번씩 사용해야 하는 사진 번호: ` +
                    `${JSON.stringify(expected)}\n\n` +
                    `위에 제공된 원본 사진을 다시 확인하고 전체 스토리보드를 새로 생성해라.\n` +
                    `모든 scenes의 photoPlacements를 통틀어 ` +
                    `각 photoIndex가 정확히 한 번씩만 등장해야 한다.\n` +
                    `한 장면 안에서뿐 아니라 서로 다른 장면 사이에서도 ` +
                    `같은 사진 번호를 반복하면 안 된다.\n` +
                    `장면 수와 사진 배치를 조정해서 모든 사진을 빠짐없이 사용해라.\n` +
                    `자막과 배치는 각 photoIndex에 해당하는 실제 사진을 기준으로 작성해라.`;

                this.logger.warn(
                    `사진 중복·누락으로 스토리보드 재생성: ` +
                    `다음 요청 ${attempt + 1}/${MAX_GENERATION_ATTEMPTS}`,
                );

                continue;
            }

            this.logger.log(
                `스토리보드 생성: 장면 ${plan.scenes.length}개, ` +
                `사진 ${photoCount}장, ` +
                `요청 ${attempt}/${MAX_GENERATION_ATTEMPTS}`,
            );

            return plan;
        }

        throw new InternalServerErrorException(
            'AI 스토리보드를 생성하지 못했습니다.',
        );
    }

    private async buildUserContent(
        context: StoryboardContext,
    ): Promise<ResponseInputContent[]> {
        const summary = {
            title: context.title,
            region: context.regionLabel,
            sigungu: context.sigunguNames,
            theme: context.themeLabel,
            travelDate: context.travelDate
                .toISOString()
                .slice(0, 10),

            // 후기는 그날 분위기를 가늠하는 힌트다.
            // 자막에 인용하라는 뜻이 아니다.
            reviewHints: context.reviewHints,
        };

        const content: ResponseInputContent[] = [
            {
                type: 'input_text',
                text:
                    `사진 ${context.photos.length}장으로 추억영상을 아트디렉팅해줘.\n` +
                    `사진 번호는 1~${context.photos.length}만 존재하고, ` +
                    `모두 정확히 한 번씩 써야 한다.\n\n` +
                    JSON.stringify(summary, null, 2),
            },
        ];

        for (const photo of context.photos) {
            content.push({
                type: 'input_text',
                text:
                    `PHOTO ${photo.index}\n` +
                    `장소: ${photo.spotName}\n` +
                    `분류: ${photo.category}\n` +
                    `찍은 사람: ${photo.isMine ? '사용자' : '동행'}\n` +
                    `코멘트: ${photo.comment}\n` +
                    `시각: ${photo.createdAt.toISOString().slice(11, 16)}`,
            });

            content.push({
                type: 'input_image',
                image_url:
                    `data:${photo.contentType};base64,` +
                    photo.buffer.toString('base64'),
                detail: 'low',
            });
        }

        return content;
    }

    /**
     * 사진을 빠뜨리거나 중복해서 쓰면 렌더 결과가 어긋난다.
     * 스키마의 min/max로는 "정확히 한 번씩"을 표현할 수 없어 여기서 검사한다.
     */
    private validatePhotoUsage(
        plan: Storyboard,
        photoCount: number,
    ): void {
        const used = plan.scenes
            .flatMap((scene) =>
                scene.photoPlacements.map(
                    (placement) => placement.photoIndex,
                ),
            )
            .sort((a, b) => a - b);

        const expected = Array.from(
            { length: photoCount },
            (_, index) => index + 1,
        );

        if (
            JSON.stringify(used) !==
            JSON.stringify(expected)
        ) {
            this.logger.warn(
                `사진 사용 검증 실패 ` +
                `expected=${JSON.stringify(expected)} ` +
                `used=${JSON.stringify(used)}`,
            );

            throw new InternalServerErrorException(
                'AI가 사진을 정확히 한 번씩 사용하지 않았습니다.',
            );
        }
    }
}