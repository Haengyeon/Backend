// 프로필 사진 업로드 설정.
//
// 인증샷과 마찬가지로 파일은 Cloud Storage에 저장하고
// DB에는 객체 경로만 남긴다. 조회할 때 서명 URL로 바꿔 내보낸다.
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { memoryStorage } from 'multer';
import { extname } from 'path';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** 원본 확장자를 잃지 않으면서 파일명 충돌과 경로 조작을 막는다 */
const SAFE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];

const OBJECT_PREFIX = 'profile_image';

/** 프로필 작성·수정에서 받는 파일 필드 */
export const PROFILE_IMAGE_FIELDS = [
    { name: 'profileImage', maxCount: 1 },
    { name: 'fullBodyImage', maxCount: 1 },
];

export const profileImageUploadOptions = {
    // 디스크를 거치지 않고 바로 GCS로 올린다. 10MB 상한이 메모리를 묶어 준다
    storage: memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES },
    fileFilter: (
        _req: unknown,
        file: { mimetype: string },
        cb: (error: Error | null, accept: boolean) => void,
    ) => {
        if (!file.mimetype.startsWith('image/')) {
            cb(new BadRequestException('이미지 파일만 올릴 수 있어요'), false);
            return;
        }
        cb(null, true);
    },
};

export type ProfileImageKind = 'profile' | 'fullBody';

/**
 * DB에 저장되는 값. 전체 URL이 아니라 버킷 안 경로다.
 *
 * 사용자별 폴더로 나누면 탈퇴 시 한 번에 지우기 쉽고,
 * 파일명에 uuid를 붙여 같은 사용자가 다시 올려도 덮어쓰지 않는다.
 * 옛 사진은 교체 시점에 지운다.
 */
export function buildProfileImagePath(
    userId: string,
    kind: ProfileImageKind,
    originalName: string,
): string {
    const ext = extname(originalName).toLowerCase();
    const safe = SAFE_EXTENSIONS.includes(ext) ? ext : '.jpg';

    return `${OBJECT_PREFIX}/${userId}/${kind}-${randomUUID()}${safe}`;
}