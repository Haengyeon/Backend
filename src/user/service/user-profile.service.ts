import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { UserStatus } from '../../generated/prisma/enums';
import { calcAge } from '../../common/age.util';
import { CreateUserProfileDto } from '../dto/request/create-user-profile.dto';
import { UpdateUserProfileDto } from '../dto/request/update-user-profile.dto';
import {
    ProfileImageFiles,
    UserProfileImageService,
} from './user-profile-image.service';

const MIN_AGE = 20;

@Injectable()
export class UserProfileService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly profileImage: UserProfileImageService,
    ) {}

    async create(
        userId: string,
        dto: CreateUserProfileDto,
        files: ProfileImageFiles,
    ) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { status: true, profile: { select: { id: true } } },
        });

        if (!user) {
            throw new NotFoundException('사용자를 찾을 수 없습니다.');
        }

        if (user.status !== UserStatus.ACTIVE) {
            throw new BadRequestException('활성 상태의 사용자가 아닙니다.');
        }

        if (user.profile) {
            throw new ConflictException('이미 프로필을 작성했습니다.');
        }

        const birthDate = this.parseBirthDate(dto.birthDate);

        // 사진은 필수다. DB에 넣기 전에 확인해야 반쪽짜리 프로필이 안 생긴다.
        const images = await this.profileImage.upload(userId, files);

        if (!images.profileImageUrl || !images.fullBodyImageUrl) {
            throw new BadRequestException(
                '프로필 사진과 전신 사진을 모두 올려 주세요.',
            );
        }

        const profile = await this.prisma.profile.create({
            data: {
                userId,
                name: dto.name,
                birthDate,
                gender: dto.gender,
                mbti: dto.mbti,
                introduce: dto.introduce,
                jobCategory: dto.jobCategory,
                jobPrivate: dto.jobPrivate ?? false,
                hobbies: dto.hobbies,
                profileImageUrl: images.profileImageUrl,
                fullBodyImageUrl: images.fullBodyImageUrl,
            },
        });

        return this.toResponse(profile);
    }

    async findMine(userId: string) {
        const profile = await this.prisma.profile.findUnique({
            where: { userId },
        });

        if (!profile) {
            throw new NotFoundException('프로필이 없습니다.');
        }

        return this.toResponse(profile);
    }

    /**
     * 이름·생년월일·성별은 UpdateUserProfileDto에서 제외되어 여기로 들어오지 않는다.
     * 사진은 새로 올린 것만 바뀌고, 올리지 않으면 기존 사진이 유지된다.
     */
    async update(
        userId: string,
        dto: UpdateUserProfileDto,
        files: ProfileImageFiles,
    ) {
        const existing = await this.prisma.profile.findUnique({
            where: { userId },
            select: { profileImageUrl: true, fullBodyImageUrl: true },
        });

        if (!existing) {
            throw new NotFoundException('프로필이 없습니다.');
        }

        const images = await this.profileImage.upload(userId, files);

        const profile = await this.prisma.profile.update({
            where: { userId },
            data: {
                mbti: dto.mbti,
                introduce: dto.introduce,
                jobCategory: dto.jobCategory,
                jobPrivate: dto.jobPrivate,
                hobbies: dto.hobbies,
                // undefined면 Prisma가 무시해서 기존 값이 남는다
                profileImageUrl: images.profileImageUrl,
                fullBodyImageUrl: images.fullBodyImageUrl,
            },
        });

        // 새 사진이 저장된 뒤에 옛 파일을 지운다. 순서가 반대면 저장에 실패했을 때
        // 사진이 통째로 사라진다.
        if (images.profileImageUrl) {
            await this.profileImage.removeIfOwned(existing.profileImageUrl);
        }

        if (images.fullBodyImageUrl) {
            await this.profileImage.removeIfOwned(existing.fullBodyImageUrl);
        }

        return this.toResponse(profile);
    }

    /**
     * 'YYYY-MM-DD'를 UTC 자정 Date로 변환한다.
     * @db.Date 컬럼이라 시각은 저장되지 않지만, 타임존에 따라 하루가 밀리지 않도록 UTC로 고정한다.
     */
    private parseBirthDate(value: string): Date {
        const [year, month, day] = value.split('-').map(Number);
        const parsed = new Date(Date.UTC(year, month - 1, day));

        if (Number.isNaN(parsed.getTime())) {
            throw new BadRequestException(`유효하지 않은 날짜입니다: ${value}`);
        }

        if (parsed > new Date()) {
            throw new BadRequestException('생년월일이 미래일 수 없습니다.');
        }

        if (calcAge(parsed) < MIN_AGE) {
            throw new BadRequestException(
                `만 ${MIN_AGE}세 이상만 이용할 수 있습니다.`,
            );
        }

        return parsed;
    }

    /**
     * 생년월일은 응답에 담지 않고 만 나이로 변환해서 내려준다.
     *
     * 사진은 DB에 객체 경로로 저장돼 있다. 버킷이 비공개라
     * 볼 때마다 서명 URL을 새로 만들어 내보낸다.
     */
    private async toResponse(profile: {
        id: string;
        name: string;
        birthDate: Date;
        gender: unknown;
        mbti: unknown;
        introduce: string;
        jobCategory: unknown;
        jobPrivate: boolean;
        hobbies: unknown;
        profileImageUrl: string;
        fullBodyImageUrl: string;
        createdAt: Date;
    }) {
        const { birthDate, profileImageUrl, fullBodyImageUrl, ...rest } =
            profile;

        const [signedProfile, signedFullBody] = await Promise.all([
            this.profileImage.toImageUrl(profileImageUrl),
            this.profileImage.toImageUrl(fullBodyImageUrl),
        ]);

        return {
            ...rest,
            age: calcAge(birthDate),
            profileImageUrl: signedProfile,
            fullBodyImageUrl: signedFullBody,
        };
    }
}