// 인증샷을 Cloud Storage에 저장하고 서명 URL로 돌려준다.
//
// 버킷은 비공개다. 주소만으로는 못 열고, 조회할 때마다 만료 시간이 붙은
// URL을 새로 발급한다. 그래서 앱 밖으로 새어나간 주소는 하루 뒤 죽는다.
import { Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';

/** 서명 URL 유효기간 */
const SIGNED_URL_TTL_MS = 24 * 60 * 60 * 1000;

// 실제 만료보다 일찍 캐시를 버린다. 캐시 끝물에 받은 URL이
// 몇 분 만에 죽는 걸 막기 위한 여유다.
const CACHE_TTL_MS = 23 * 60 * 60 * 1000;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storage = new Storage();
  private readonly bucketName = process.env.GCS_BUCKET ?? '';
  private readonly cache = new Map<string, { url: string; expiresAt: number }>();

  private get bucket() {
    if (!this.bucketName) {
      throw new Error('GCS_BUCKET 환경변수가 설정되지 않았습니다.');
    }
    return this.storage.bucket(this.bucketName);
  }

  async upload(
    objectPath: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.bucket.file(objectPath).save(buffer, {
      contentType,
      resumable: false,
    });
  }

  /**
   * 조회용 서명 URL.
   *
   * 서명은 IAM API를 한 번 타므로 사진마다 부르면 느리다.
   * 유효기간이 하루라 캐시해도 안전하다.
   */
  async signedUrl(objectPath: string): Promise<string> {
    const hit = this.cache.get(objectPath);
    if (hit && hit.expiresAt > Date.now()) return hit.url;

    const [url] = await this.bucket.file(objectPath).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + SIGNED_URL_TTL_MS,
    });

    this.cache.set(objectPath, { url, expiresAt: Date.now() + CACHE_TTL_MS });
    return url;
  }

  /** 여러 장을 한 번에. 목록·상세는 사진이 여러 개라 직렬로 부르면 느리다 */
  async signMany(objectPaths: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(objectPaths.filter(Boolean))];
    const signed = await Promise.all(
      unique.map(async (path) => [path, await this.signedUrl(path)] as const),
    );
    return new Map(signed);
  }

  /** 지워도 실패를 삼킨다. 파일이 남는 것보다 원래 흐름이 끊기는 게 나쁘다 */
  async remove(objectPath: string): Promise<void> {
    try {
      await this.bucket.file(objectPath).delete({ ignoreNotFound: true });
      this.cache.delete(objectPath);
    } catch (error) {
      this.logger.warn(`객체 삭제 실패: ${objectPath}`, error as Error);
    }
  }
}
