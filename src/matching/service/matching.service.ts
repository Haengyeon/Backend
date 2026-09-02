import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
  MatchAttemptStatus,
  MatchingStatus,
  UserStatus,
} from '../../generated/prisma/enums';
import { CreateMatchingDto } from '../dto/request/create-matching.dto';
import { UpdateMatchingDto } from '../dto/request/update-matching.dto';
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
        regions: dto.regions,
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
    });

    // 조건 저장 직후 즉시 후보 탐색을 시도한다. 실패해도 이 API 응답 자체는 성공으로 처리하고
    // Matching은 SEARCHING 상태로 남아, 추후 스케줄러(시간초과 이슈)가 재시도한다.
    try {
      await this.matchingEngine.tryMatch(matching.id);
    } catch (error) {
      this.logger.error('즉시 매칭 시도 중 오류 발생', error as Error);
    }

    // tryMatch가 그 자리에서 바로 상대를 찾았을 수도 있어서, currentAttempt까지 같이 조회해서 반환
    return this.findWithCurrentAttempt(matching.id);
  }

  // 거절 후 [이대로 재탐색] 버튼 액션: 조건은 그대로 두고 RETRY_READY -> SEARCHING
  async retry(userId: string, matchingId: string) {
    await this.validateRetryReady(userId, matchingId);

    return this.resumeSearching(matchingId);
  }

  // 거절 후 [조건 수정] 버튼 액션: 보낸 필드만 갈아끼우고 재탐색
  // rejectionCount는 일부러 리셋하지 않는다 — 조건을 바꿔도 하루 3회 제한은 그대로 유지.
  async update(userId: string, matchingId: string, dto: UpdateMatchingDto) {
    const matching = await this.validateRetryReady(userId, matchingId);

    // 한쪽만 보내도 기존 값과 비교해서 검증해야 함 (예: ageMin만 수정한 경우)
    const ageMin = dto.ageMin ?? matching.ageMin;
    const ageMax = dto.ageMax ?? matching.ageMax;
    this.validateAgeRange(ageMin, ageMax);

    if (dto.availableDates) {
      this.validateAvailableDates(dto.availableDates);
    }

    await this.prisma.matching.update({
      where: { id: matchingId },
      data: {
        regions: dto.regions,
        ageMin: dto.ageMin,
        ageMax: dto.ageMax,
        preferredGender: dto.preferredGender,
        themes: dto.themes,

        // 날짜는 부분 수정이 아니라 전체 교체 (안 보내면 기존 유지)
        ...(dto.availableDates && {
          availableDates: {
            deleteMany: {},
            create: [...new Set(dto.availableDates)].map((date) => ({
              date: this.parseDate(date),
            })),
          },
        }),
      },
    });

    return this.resumeSearching(matchingId);
  }

  // 프론트가 폴링용으로 쓰는 "내 현재 매칭 상태 + attemptId 조회"
  async findMyActive(userId: string) {
    const matching = await this.prisma.matching.findFirst({
      where: { userId, endedAt: null },
      select: { id: true },
    });

    if (!matching) {
      throw new NotFoundException('진행 중인 매칭이 없습니다.');
    }

    return this.findWithCurrentAttempt(matching.id);
  }

  // retry/update 공통: 소유권 + RETRY_READY 상태인지 확인하고 해당 Matching을 돌려준다.
  private async validateRetryReady(userId: string, matchingId: string) {
    const matching = await this.prisma.matching.findUnique({
      where: { id: matchingId },
    });

    if (!matching) {
      throw new NotFoundException('매칭을 찾을 수 없습니다.');
    }

    if (matching.userId !== userId) {
      throw new ForbiddenException('해당 매칭에 대한 권한이 없습니다.');
    }

    if (matching.status !== MatchingStatus.RETRY_READY) {
      throw new ConflictException('재탐색 가능한 상태가 아닙니다.');
    }

    return matching;
  }

  // retry/update 공통: SEARCHING으로 되돌리고 즉시 재탐색을 시도한다.
  private async resumeSearching(matchingId: string) {
    await this.prisma.matching.update({
      where: { id: matchingId },
      data: { status: MatchingStatus.SEARCHING },
    });

    try {
      await this.matchingEngine.tryMatch(matchingId);
    } catch (error) {
      this.logger.error('재탐색 시도 중 오류 발생', error as Error);
    }

    return this.findWithCurrentAttempt(matchingId);
  }

  // Matching + 현재 응답/결제 대기중인 MatchAttempt(있으면)를 함께 조회하는 공통 헬퍼.
  private async findWithCurrentAttempt(matchingId: string) {
    const activeAttemptFilter = {
      where: {
        status: {
          in: [MatchAttemptStatus.WAITING_RESPONSE, MatchAttemptStatus.PAYMENT_PENDING],
        },
      },
      orderBy: { createdAt: 'desc' as const },
      take: 1,
      select: {
        id: true,
        status: true,
        respondDeadlineAt: true,
        paymentDeadlineAt: true,
      },
    };

    const matching = await this.prisma.matching.findUniqueOrThrow({
      where: { id: matchingId },
      include: {
        availableDates: { orderBy: { date: 'asc' } },
        attemptsAsA: activeAttemptFilter,
        attemptsAsB: activeAttemptFilter,
      },
    });

    const { attemptsAsA, attemptsAsB, ...rest } = matching;
    const currentAttempt = attemptsAsA[0] ?? attemptsAsB[0] ?? null;

    return { ...rest, currentAttempt };
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