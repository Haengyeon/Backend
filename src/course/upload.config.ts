// 인증샷 업로드 설정.
//
// 파일은 Cloud Storage에 저장하고 DB에는 객체 경로만 남긴다.
// 조회할 때 StorageService가 그 경로로 서명 URL을 만들어 준다.
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { memoryStorage } from 'multer';
import { extname } from 'path';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** 원본 확장자를 잃지 않으면서 파일명 충돌과 경로 조작을 막는다 */
const SAFE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];

const OBJECT_PREFIX = 'mission-photos';

export const missionPhotoUploadOptions = {
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

/** DB의 imageUrl에 저장되는 값. 전체 URL이 아니라 버킷 안 경로다 */
export function buildObjectPath(originalName: string): string {
  const ext = extname(originalName).toLowerCase();
  const safe = SAFE_EXTENSIONS.includes(ext) ? ext : '.jpg';
  return `${OBJECT_PREFIX}/${randomUUID()}${safe}`;
}
