import {BadRequestException, ConflictException, Injectable, NotFoundException} from "@nestjs/common";
import {PrismaService} from "../../prisma/prisma.service";
import {UserStatus} from "../../generated/prisma/enums";
import {calcAge} from "../../common/age.util";
import {UpdateUserProfileDto} from "../dto/request/update-user-profile.dto";
import {CreateUserProfileDto} from "../dto/request/create-user-profile.dto";


const MIN_AGE = 20;

@Injectable()
export class UserProfileService {
    constructor(private readonly prisma: PrismaService) {}

    async create(userId: string, dto: CreateUserProfileDto) {
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
                profileImageUrl: dto.profileImageUrl,
                fullBodyImageUrl: dto.fullBodyImageUrl,
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

    async update(userId: string, dto: UpdateUserProfileDto) {
        const existing = await this.prisma.profile.findUnique({
            where: {userId},
            select: { id: true },
        });

        if (!existing) {
            throw new NotFoundException('프로필이 없습니다.');
        }

        const profile = await this.prisma.profile.update({
            where: { userId },
            data: {
                mbti: dto.mbti,
                introduce: dto.introduce,
                jobCategory: dto.jobCategory,
                jobPrivate: dto.jobPrivate,
                hobbies: dto.hobbies,
                profileImageUrl: dto.profileImageUrl,
                fullBodyImageUrl: dto.fullBodyImageUrl,
            },
        });

        return this.toResponse(profile);
    }

    /**
     * 'YYYY-MM-DD'를 UTC 자정 Date로 변환
     * @db.Date 컬럼이라 시각은 저장되지 않지만 타임존에 따라 하루가 밀리지 않도록 UTC로 고정
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

    // 생년월일은 응답에 담지 않고 만 나이로 변환해서 내려줌
    private toResponse(profile: {
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
        const { birthDate, ...rest } = profile;

        return { ...rest, age: calcAge(birthDate) };
    }
}