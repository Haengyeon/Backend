import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { UserStatus } from '../../generated/prisma/enums';
import { CreateMatchingDto } from '../dto/request/create-matching.dto';
import { MatchingEngineService } from './matching-engine.service';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
      private readonly prisma: PrismaService,
      private readonly matchingEngine: MatchingEngineService,
  ) {}

  async create(userId: string, dto: CreateMatchingDto) {
    await this.validateUser(userId);
    this.validateAgeRange(dto.ageMin, dto.ageMax);
    this.validateAvailableDates(dto.availableDates);

    const existingMatching = await this.prisma.matching.findFirst({
      where: {
        userId,
        endedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (existingMatching) {
      throw new ConflictException('이미 진행 중인 매칭이 있습니다.');
    }

    const matching = await this.prisma.matching.create({
      data: {
        userId,
        region: dto.region,
        ageMin: dto.ageMin,
        ageMax: dto.ageMax,
        preferredGender: dto.preferredGender,
        themes: dto.themes,

        availableDates: {
          create: [...new Set(dto.availableDates)].map((date) => ({
            date: this.parseDate(date),
          })),
        },
      },

      include: {
        availableDates: {
          orderBy: {
            date: 'asc',
          },
        },
      },
    });

    // 조건 저장 직후 즉시 후보 탐색을 시도한다. 실패해도 이 API 응답 자체는 성공으로 처리하고
    // Matching은 SEARCHING 상태로 남아, 추후 스케줄러(이슈 #4)가 재시도한다.
    try {
      await this.matchingEngine.tryMatch(matching.id);
    } catch (error) {
      this.logger.error('즉시 매칭 시도 중 오류 발생', error as Error);
    }

    return this.prisma.matching.findUniqueOrThrow({
      where: { id: matching.id },
      include: {
        availableDates: {
          orderBy: { date: 'asc' },
        },
      },
    });
  }

  private parseDate(date: string): Date {
    const [year, month, day] = date.split('-').map(Number);

    const parsedDate = new Date(
        Date.UTC(year, month - 1, day),
    );

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(
          `유효하지 않은 날짜입니다: ${date}`,
      );
    }

    return parsedDate;
  }

  private async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        status: true,
        profile: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException(
          '활성 상태의 사용자가 아닙니다.',
      );
    }

    if (!user.profile) {
      throw new BadRequestException(
          '프로필 작성이 필요합니다.',
      );
    }
  }

  private validateAgeRange(ageMin: number, ageMax: number) {
    if (ageMin > ageMax) {
      throw new BadRequestException(
          '최소 나이는 최대 나이보다 클 수 없습니다.',
      );
    }
  }

  // 과거 날짜와 오늘로부터 한 달을 초과하는 날짜를 모두 거른다.
  private validateAvailableDates(availableDates: string[]) {
    const koreaDateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const year = Number(
        koreaDateParts.find((part) => part.type === 'year')!.value,
    );
    const month = Number(
        koreaDateParts.find((part) => part.type === 'month')!.value,
    );
    const day = Number(
        koreaDateParts.find((part) => part.type === 'day')!.value,
    );

    const today = year * 10000 + month * 100 + day;

    // 오늘로부터 한 달 뒤(예: 8/15 -> 9/15)까지만 허용
    const maxDate = new Date(Date.UTC(year, month - 1, day));
    maxDate.setUTCMonth(maxDate.getUTCMonth() + 1);
    const maxDateNumber =
        maxDate.getUTCFullYear() * 10000 +
        (maxDate.getUTCMonth() + 1) * 100 +
        maxDate.getUTCDate();

    const invalidDate = availableDates.find((date) => {
      const targetDate = Number(date.replaceAll('-', ''));
      return targetDate < today || targetDate > maxDateNumber;
    });

    if (invalidDate) {
      throw new BadRequestException(
          `여행 가능 날짜는 오늘부터 한 달 이내여야 합니다: ${invalidDate}`,
      );
    }
  }
}