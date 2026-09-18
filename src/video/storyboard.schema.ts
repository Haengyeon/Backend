import { z } from 'zod';

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const FRAME_STYLES = [
    'none',
    'whitePolaroid',
    'creamPrint',
    'darkFilm',
    'thinWhite',
    'softCard',
] as const;

export const DECORATION_TYPES = [
    'tape',
    'smallHeart',
    'scribble',
    'dateStamp',
    'rec',
    'filmHoles',
    'underline',
    'cornerMarks',
] as const;

/**
 * 사진 개수에 따라 스키마가 달라진다(photoIndex 상한, 장면 수).
 * 그래서 상수가 아니라 함수로 만든다.
 */
export function buildStoryboardSchema(photoCount: number) {
    const PhotoPlacement = z.object({
        photoIndex: z.number().int().min(1).max(photoCount),

        // 1080 x 1920 기준. 화면 밖으로 살짝 걸치는 배치도 허용한다.
        x: z.number().min(-200).max(1000),
        y: z.number().min(-200).max(1850),
        width: z.number().min(260).max(1080),
        height: z.number().min(300).max(1500),

        rotation: z.number().min(-16).max(16),
        zIndex: z.number().int().min(1).max(10),

        objectFit: z.enum(['cover', 'contain']),
        frameStyle: z.enum(FRAME_STYLES),
        borderRadius: z.number().min(0).max(70),
        shadow: z.enum(['none', 'soft', 'strong']),
    });

    const CaptionBlock = z.object({
        eyebrow: z.string().max(28),
        headline: z.string().max(46),
        subline: z.string().max(60),

        x: z.number().min(30).max(900),
        y: z.number().min(80).max(1700),
        width: z.number().min(260).max(980),

        align: z.enum(['left', 'center', 'right']),
        fontSize: z.number().min(34).max(82),
        weight: z.enum(['regular', 'medium', 'bold', 'heavy']),
    });

    const Decoration = z.object({
        type: z.enum(DECORATION_TYPES),
        x: z.number().min(0).max(1080),
        y: z.number().min(0).max(1920),
        rotation: z.number().min(-20).max(20),
        opacity: z.number().min(0.15).max(1),
    });

    const Scene = z.object({
        durationSeconds: z.number().min(2.4).max(6),

        backgroundColor: HexColor,
        accentColor: HexColor,
        textColor: HexColor,

        photoPlacements: z
            .array(PhotoPlacement)
            .min(1)
            .max(Math.min(3, photoCount)),

        caption: CaptionBlock,
        decorations: z.array(Decoration).max(6),

        motion: z.enum([
            'still',
            'slowPush',
            'slowPull',
            'driftLeft',
            'driftRight',
        ]),
        transition: z.enum([
            'softFade',
            'whiteFlash',
            'hardCut',
            'dipToBlack',
        ]),

        grain: z.number().min(0).max(0.28),
        vignette: z.number().min(0).max(0.45),
    });

    return z.object({
        opening: z.object({
            kicker: z.string().max(28),
            title: z.string().max(42),
            subtitle: z.string().max(60),
            backgroundColor: HexColor,
            textColor: HexColor,
        }),

        closing: z.object({
            line1: z.string().max(48),
            line2: z.string().max(60),
            backgroundColor: HexColor,
            textColor: HexColor,
        }),

        bgmMood: z.string().max(120),
        editorialNote: z.string().max(300),

        scenes: z
            .array(Scene)
            .min(Math.min(3, photoCount))
            .max(photoCount),
    });
}

export type Storyboard = z.infer<ReturnType<typeof buildStoryboardSchema>>;