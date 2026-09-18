import { Injectable, Logger } from '@nestjs/common';

import { StorageService } from '../../storage/storage.service';
import {
    buildProfileImagePath,
    ProfileImageKind,
} from '../profile-image.config';

/** 프로필 작성·수정에서 함께 올라오는 파일들 */
export interface ProfileImageFiles {
    profileImage?: Express.Multer.File[];
    fullBodyImage?: Express.Multer.File[];
}

@Injectable()
export class UserProfileImageService {
    private readonly logger = new Logger(UserProfileImageService.name);

    constructor(private readonly storage: StorageService) {}

    /**
     * 올라온 파일을 Cloud Storage에 저장하고 객체 경로를 돌려준다.
     * 파일이 없으면 undefined를 돌려줘, 수정 시 기존 사진을 유지할 수 있게 한다.
     */
    async upload(
        userId: string,
        files: ProfileImageFiles,
    ): Promise<{ profileImageUrl?: string; fullBodyImageUrl?: string }> {
        const [profileImageUrl, fullBodyImageUrl] = await Promise.all([
            this.uploadOne(userId, 'profile', files.profileImage?.[0]),
            this.uploadOne(userId, 'fullBody', files.fullBodyImage?.[0]),
        ]);

        return { profileImageUrl, fullBodyImageUrl };
    }

    private async uploadOne(
        userId: string,
        kind: ProfileImageKind,
        file: Express.Multer.File | undefined,
    ): Promise<string | undefined> {
        if (!file) return undefined;

        const objectPath = buildProfileImagePath(
            userId,
            kind,
            file.originalname,
        );

        await this.storage.upload(objectPath, file.buffer, file.mimetype);

        return objectPath;
    }

    /**
     * 더 이상 쓰지 않는 사진을 지운다.
     *
     * 실패해도 넘어간다. 파일이 남는 것보다 프로필 수정이 실패하는 게 더 나쁘다.
     * 외부 URL(시드 데이터 등)은 우리 버킷 객체가 아니므로 건드리지 않는다.
     */
    async removeIfOwned(objectPath: string | null | undefined): Promise<void> {
        if (!objectPath) return;
        if (objectPath.startsWith('http')) return;

        await this.storage.remove(objectPath);
    }

    /** 저장된 경로를 화면에서 바로 쓸 수 있는 URL로 바꾼다 */
    async toImageUrl(objectPath: string): Promise<string> {
        // 시드 데이터처럼 이미 완전한 URL이면 그대로 쓴다
        if (objectPath.startsWith('http')) return objectPath;

        return this.storage.signedUrl(objectPath);
    }
}