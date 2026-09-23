/**
 * 체험 매칭용 고정 에셋.
 *
 * 체험 코스는 상대가 가상 프로필이라 실제로 사진을 올리거나 후기를 쓰지 않는다.
 * 그 자리를 비워 두면 흐름을 체험하기 어려워, 조회 응답에만 예시를 채워 넣는다.
 * DB에는 넣지 않는다 — 미션 완료·보상·집계에 섞이지 않게 하기 위함이다.
 *
 * 파일을 바꾸고 싶으면 코드를 고치지 않고 같은 경로에 다시 올리면 된다.
 */

/** 상대방 미션 칸에 보여 줄 가상 사진. 미션 순서대로 돌려 쓴다 */
export const EXPERIENCE_PARTNER_PHOTO_PATHS = [
    'experience/photos/1.png',
    'experience/photos/2.png',
    'experience/photos/3.png',
    'experience/photos/4.png',
];

/** 가상 사진에 붙는 한 줄 코멘트 */
export const EXPERIENCE_PARTNER_PHOTO_COMMENTS = [
    '가는 길에 찍은 사진!',
    '사진 잘 나왔어요',
    '생각보다 더 예뻐요',
    '오늘 날씨 딱이에요',
];

/** 상대방이 남긴 것으로 보여 줄 예시 후기. 코스마다 하나를 고정해서 고른다 */
export const EXPERIENCE_PARTNER_REVIEWS = [
    '덕분에 편하게 둘러봤어요. 코스 동선이 좋아서 걷기 편했어요.',
    '처음 가 보는 곳이었는데 같이 다니니 금방 익숙해졌어요.',
    '사진 찍기 좋은 곳이 많았어요. 다음에 또 가 보고 싶네요.',
    '맛있는 것도 먹고 이야기도 많이 나눠서 즐거운 하루였어요.',
];

/** 체험을 마치면 보여 줄 샘플 추억영상 */
export const EXPERIENCE_SAMPLE_VIDEO_PATH = 'ai-video/sample/memory.mp4';
export const EXPERIENCE_SAMPLE_THUMBNAIL_PATH = 'ai-video/sample/thumbnail.png';

/** 코스 id로 목록에서 하나를 고정해서 고른다. 같은 코스는 늘 같은 값이 나온다 */
export function pickByCourse<T>(courseId: string, items: readonly T[]): T {
    let hash = 0;

    for (const char of courseId) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }

    return items[hash % items.length];
}