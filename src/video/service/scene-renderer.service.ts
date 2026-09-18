import { Injectable, Logger } from '@nestjs/common';
import { createCanvas, loadImage, GlobalFonts, Image } from '@napi-rs/canvas';
import { join } from 'node:path';

import type { Storyboard } from '../storyboard.schema';

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;

type Scene = Storyboard['scenes'][number];
type Placement = Scene['photoPlacements'][number];
type Caption = Scene['caption'];
type Decoration = Scene['decorations'][number];

const FONT_FAMILY = 'Pretendard';

/**
 * 스토리보드 한 장면을 1080x1920 PNG로 그린다.
 *
 * 브라우저를 띄우지 않는다. @napi-rs/canvas는 미리 빌드된 네이티브 바이너리라
 * 시스템 의존성 없이 설치되고, 폰트도 파일에서 직접 등록할 수 있다.
 */
@Injectable()
export class SceneRendererService {
    private readonly logger = new Logger(SceneRendererService.name);
    private fontsReady = false;

    /**
     * 한글 폰트를 등록한다.
     *
     * 컨테이너에 시스템 폰트가 없을 수 있어 레포에 넣어 둔 파일을 직접 읽는다.
     * 등록하지 않으면 한글이 네모로 깨진다.
     */
    private ensureFonts(): void {
        if (this.fontsReady) return;

        const dir = join(process.cwd(), 'assets', 'font');

        GlobalFonts.registerFromPath(
            join(dir, 'font1.ttf'),
            FONT_FAMILY,
        );
        GlobalFonts.registerFromPath(
            join(dir, 'font2.ttf'),
            `${FONT_FAMILY} Bold`,
        );

        this.fontsReady = true;
    }

    /** 오프닝 화면 */
    async renderOpening(opening: Storyboard['opening']): Promise<Buffer> {
        this.ensureFonts();

        const { canvas, ctx } = this.createSurface(opening.backgroundColor);

        ctx.fillStyle = opening.textColor;
        ctx.textAlign = 'center';

        ctx.font = `36px "${FONT_FAMILY}"`;
        ctx.globalAlpha = 0.6;
        ctx.fillText(opening.kicker, VIDEO_WIDTH / 2, 820);
        ctx.globalAlpha = 1;

        ctx.font = `68px "${FONT_FAMILY} Bold"`;
        this.fillWrapped(ctx, opening.title, VIDEO_WIDTH / 2, 930, 880, 86);

        ctx.font = `38px "${FONT_FAMILY}"`;
        ctx.globalAlpha = 0.75;
        this.fillWrapped(ctx, opening.subtitle, VIDEO_WIDTH / 2, 1080, 820, 52);

        return canvas.toBuffer('image/png');
    }

    /** 엔딩 화면 */
    async renderClosing(closing: Storyboard['closing']): Promise<Buffer> {
        this.ensureFonts();

        const { canvas, ctx } = this.createSurface(closing.backgroundColor);

        ctx.fillStyle = closing.textColor;
        ctx.textAlign = 'center';

        ctx.font = `58px "${FONT_FAMILY} Bold"`;
        this.fillWrapped(ctx, closing.line1, VIDEO_WIDTH / 2, 920, 860, 74);

        ctx.font = `34px "${FONT_FAMILY}"`;
        ctx.globalAlpha = 0.7;
        this.fillWrapped(ctx, closing.line2, VIDEO_WIDTH / 2, 1030, 820, 48);

        return canvas.toBuffer('image/png');
    }

    /**
     * 본 장면.
     *
     * @param photoBuffers 1번 사진이 [0]에 오도록 정렬된 원본 이미지
     */
    async renderScene(scene: Scene, photoBuffers: Buffer[]): Promise<Buffer> {
        this.ensureFonts();

        const { canvas, ctx } = this.createSurface(scene.backgroundColor);

        // zIndex가 낮은 것부터 깔아야 겹침 순서가 맞는다
        const placements = [...scene.photoPlacements].sort(
            (a, b) => a.zIndex - b.zIndex,
        );

        for (const placement of placements) {
            const buffer = photoBuffers[placement.photoIndex - 1];
            if (!buffer) continue;

            await this.drawPhoto(ctx, placement, buffer);
        }

        this.drawDecorations(ctx, scene.decorations, scene.accentColor);
        this.drawCaption(ctx, scene.caption, scene.textColor);

        if (scene.vignette > 0) {
            this.drawVignette(ctx, scene.vignette);
        }

        return canvas.toBuffer('image/png');
    }

    private createSurface(backgroundColor: string) {
        const canvas = createCanvas(VIDEO_WIDTH, VIDEO_HEIGHT);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

        return { canvas, ctx };
    }

    private async drawPhoto(
        ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
        placement: Placement,
        buffer: Buffer,
    ): Promise<void> {
        const image = await loadImage(buffer);

        // 프레임이 있으면 사진 둘레에 여백이 생긴다. 폴라로이드는 아래가 더 두껍다.
        const frame = this.frameMetrics(placement.frameStyle);

        const innerWidth = placement.width - frame.padding * 2;
        const innerHeight =
            placement.height - frame.padding - frame.bottomPadding;

        ctx.save();

        // 회전 중심을 사진 한가운데로 옮긴다
        ctx.translate(
            placement.x + placement.width / 2,
            placement.y + placement.height / 2,
        );
        ctx.rotate((placement.rotation * Math.PI) / 180);
        ctx.translate(-placement.width / 2, -placement.height / 2);

        if (placement.shadow !== 'none') {
            ctx.shadowColor = 'rgba(0,0,0,0.28)';
            ctx.shadowBlur = placement.shadow === 'strong' ? 42 : 20;
            ctx.shadowOffsetY = placement.shadow === 'strong' ? 16 : 8;
        }

        if (frame.color) {
            ctx.fillStyle = frame.color;
            this.roundRect(
                ctx,
                0,
                0,
                placement.width,
                placement.height,
                placement.borderRadius,
            );
            ctx.fill();
        }

        // 그림자는 프레임에만 적용한다. 사진에까지 들어가면 이중으로 번진다
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        ctx.save();
        this.roundRect(
            ctx,
            frame.padding,
            frame.padding,
            innerWidth,
            innerHeight,
            Math.max(0, placement.borderRadius - frame.padding / 2),
        );
        ctx.clip();

        this.drawFitted(
            ctx,
            image,
            frame.padding,
            frame.padding,
            innerWidth,
            innerHeight,
            placement.objectFit,
        );

        ctx.restore();
        ctx.restore();
    }

    /** cover는 꽉 채우고 넘치는 부분을 자르고, contain은 전체를 보이게 줄인다. */
    private drawFitted(
        ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
        image: Image,
        x: number,
        y: number,
        width: number,
        height: number,
        objectFit: 'cover' | 'contain',
    ): void {
        const scale =
            objectFit === 'cover'
                ? Math.max(width / image.width, height / image.height)
                : Math.min(width / image.width, height / image.height);

        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;

        ctx.drawImage(
            image,
            x + (width - drawWidth) / 2,
            y + (height - drawHeight) / 2,
            drawWidth,
            drawHeight,
        );
    }

    private frameMetrics(style: Placement['frameStyle']): {
        color: string | null;
        padding: number;
        bottomPadding: number;
    } {
        switch (style) {
            case 'whitePolaroid':
                // 인화 사진처럼 아래쪽 여백을 크게 준다
                return { color: '#FBFAF7', padding: 22, bottomPadding: 96 };
            case 'creamPrint':
                return { color: '#F2EADC', padding: 18, bottomPadding: 18 };
            case 'darkFilm':
                return { color: '#1F1E1D', padding: 16, bottomPadding: 16 };
            case 'thinWhite':
                return { color: '#FFFFFF', padding: 10, bottomPadding: 10 };
            case 'softCard':
                return { color: '#FFFFFF', padding: 14, bottomPadding: 14 };
            default:
                return { color: null, padding: 0, bottomPadding: 0 };
        }
    }

    private drawCaption(
        ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
        caption: Caption,
        textColor: string,
    ): void {
        ctx.fillStyle = textColor;
        ctx.textAlign = caption.align;

        // align에 따라 기준점이 달라진다
        const anchorX =
            caption.align === 'left'
                ? caption.x
                : caption.align === 'right'
                    ? caption.x + caption.width
                    : caption.x + caption.width / 2;

        let y = caption.y;

        if (caption.eyebrow) {
            ctx.font = `28px "${FONT_FAMILY}"`;
            ctx.globalAlpha = 0.6;
            ctx.fillText(caption.eyebrow, anchorX, y);
            ctx.globalAlpha = 1;
            y += 52;
        }

        if (caption.headline) {
            const bold = caption.weight === 'bold' || caption.weight === 'heavy';
            ctx.font = `${caption.fontSize}px "${FONT_FAMILY}${bold ? ' Bold' : ''}"`;
            y = this.fillWrapped(
                ctx,
                caption.headline,
                anchorX,
                y,
                caption.width,
                caption.fontSize * 1.32,
            );
            y += 18;
        }

        if (caption.subline) {
            ctx.font = `30px "${FONT_FAMILY}"`;
            ctx.globalAlpha = 0.72;
            this.fillWrapped(
                ctx,
                caption.subline,
                anchorX,
                y,
                caption.width,
                42,
            );
            ctx.globalAlpha = 1;
        }
    }

    /**
     * 폭에 맞춰 줄바꿈하며 그린다.
     *
     * 한국어는 단어 사이 공백이 영어보다 적어 공백 기준만으로는 넘칠 때가 있다.
     * 공백으로 나눈 조각이 여전히 길면 글자 단위로 더 쪼갠다.
     *
     * @returns 마지막 줄의 y 좌표
     */
    private fillWrapped(
        ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        lineHeight: number,
    ): number {
        const lines: string[] = [];
        let line = '';

        for (const chunk of text.split(' ')) {
            const candidate = line ? `${line} ${chunk}` : chunk;

            if (ctx.measureText(candidate).width <= maxWidth) {
                line = candidate;
                continue;
            }

            if (line) lines.push(line);

            if (ctx.measureText(chunk).width <= maxWidth) {
                line = chunk;
                continue;
            }

            line = '';
            for (const char of chunk) {
                if (ctx.measureText(line + char).width > maxWidth) {
                    lines.push(line);
                    line = char;
                } else {
                    line += char;
                }
            }
        }

        if (line) lines.push(line);

        let currentY = y;
        for (const entry of lines) {
            ctx.fillText(entry, x, currentY);
            currentY += lineHeight;
        }

        return currentY;
    }

    private drawDecorations(
        ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
        decorations: Decoration[],
        accentColor: string,
    ): void {
        for (const decoration of decorations) {
            ctx.save();
            ctx.globalAlpha = decoration.opacity;
            ctx.translate(decoration.x, decoration.y);
            ctx.rotate((decoration.rotation * Math.PI) / 180);
            ctx.fillStyle = accentColor;
            ctx.strokeStyle = accentColor;

            switch (decoration.type) {
                case 'tape':
                    ctx.fillRect(-90, -22, 180, 44);
                    break;

                case 'underline':
                    ctx.lineWidth = 6;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(240, 0);
                    ctx.stroke();
                    break;

                case 'rec':
                    ctx.fillStyle = '#E2453C';
                    ctx.beginPath();
                    ctx.arc(0, 0, 13, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = accentColor;
                    ctx.font = `26px "${FONT_FAMILY} Bold"`;
                    ctx.textAlign = 'left';
                    ctx.fillText('REC', 26, 9);
                    break;

                case 'dateStamp':
                    ctx.fillStyle = '#E8A33D';
                    ctx.font = `30px "${FONT_FAMILY}"`;
                    ctx.textAlign = 'left';
                    ctx.fillText(this.todayStamp(), 0, 0);
                    break;

                case 'cornerMarks':
                    ctx.lineWidth = 4;
                    for (const [cx, cy, dx, dy] of [
                        [0, 0, 1, 1],
                        [VIDEO_WIDTH - 100, 0, -1, 1],
                    ]) {
                        ctx.beginPath();
                        ctx.moveTo(cx, cy + dy * 46);
                        ctx.lineTo(cx, cy);
                        ctx.lineTo(cx + dx * 46, cy);
                        ctx.stroke();
                    }
                    break;

                case 'filmHoles':
                    for (let i = 0; i < 9; i++) {
                        ctx.fillRect(0, i * 58, 26, 34);
                    }
                    break;

                case 'scribble':
                    ctx.lineWidth = 5;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    for (let i = 1; i <= 6; i++) {
                        ctx.quadraticCurveTo(
                            i * 30 - 15,
                            i % 2 === 0 ? -18 : 18,
                            i * 30,
                            0,
                        );
                    }
                    ctx.stroke();
                    break;

                case 'smallHeart':
                    // 관계를 암시하는 용도가 아니라 사진첩 손그림 장식이다
                    ctx.beginPath();
                    ctx.moveTo(0, 8);
                    ctx.bezierCurveTo(-16, -8, -8, -22, 0, -12);
                    ctx.bezierCurveTo(8, -22, 16, -8, 0, 8);
                    ctx.fill();
                    break;
            }

            ctx.restore();
        }
    }

    /** 가장자리를 어둡게 해 시선을 가운데로 모은다 */
    private drawVignette(
        ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
        strength: number,
    ): void {
        const gradient = ctx.createRadialGradient(
            VIDEO_WIDTH / 2,
            VIDEO_HEIGHT / 2,
            VIDEO_HEIGHT * 0.34,
            VIDEO_WIDTH / 2,
            VIDEO_HEIGHT / 2,
            VIDEO_HEIGHT * 0.78,
        );

        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, `rgba(0,0,0,${strength})`);

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
    }

    private roundRect(
        ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
    ): void {
        const r = Math.min(radius, width / 2, height / 2);

        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    }

    private todayStamp(): string {
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(now);

        const get = (type: string) =>
            parts.find((part) => part.type === type)!.value;

        return `${get('year')}.${get('month')}.${get('day')}`;
    }
}