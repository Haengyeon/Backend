// 인증샷 파일 저장 설정
//
// 지금은 서버 디스크에 바로 쓴다. 운영에서는 S3로 옮겨야 하지만,
// 그때도 바뀌는 건 "파일을 어디에 두고 어떤 URL을 돌려주느냐"뿐이라
// API 모양과 DB에 저장하는 값(imageUrl 문자열)은 그대로다.
//
// 컨테이너 안에 쓰기 때문에 docker-compose의 app 서비스에 볼륨이 걸려 있어야
// 재시작 후에도 사진이 남는다. (uploads_data:/app/uploads)
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';

/** 정적 서빙 경로. main.ts와 맞춰야 한다 */
export const UPLOAD_URL_PREFIX = '/uploads';

export const UPLOAD_DIR = join(process.cwd(), 'uploads');

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** 원본 확장자를 잃지 않으면서 파일명 충돌과 경로 조작을 막는다 */
const SAFE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];

export const missionPhotoUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      // 컨테이너를 새로 만들면 디렉터리가 없다
      if (!existsSync(UPLOAD_DIR)) {
        mkdirSync(UPLOAD_DIR, { recursive: true });
      }
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(
        null,
        `${randomUUID()}${SAFE_EXTENSIONS.includes(ext) ? ext : '.jpg'}`,
      );
    },
  }),
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

/** 저장된 파일명을 클라이언트가 쓸 수 있는 경로로 바꾼다 */
export function toPublicUrl(filename: string): string {
  return `${UPLOAD_URL_PREFIX}/${filename}`;
}
