import { StorageService } from '../storage/storage.service';

/**
 * 프로필 사진 경로를 화면에서 바로 쓸 수 있는 URL로 바꾼다.
 *
 * 사진은 비공개 버킷에 있고 DB에는 객체 경로만 저장한다.
 * 그대로 내보내면 클라이언트가 열 수 없으므로 볼 때마다 서명 URL을 만든다.
 *
 * 시드 데이터처럼 이미 완전한 URL이면 그대로 둔다.
 */
export async function toProfileImageUrl(
    storage: StorageService,
    objectPath: string | null | undefined,
): Promise<string> {
    if (!objectPath) return '';
    if (objectPath.startsWith('http')) return objectPath;

    return storage.signedUrl(objectPath);
}