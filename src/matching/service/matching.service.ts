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
import type { Region } from '../../generated/prisma/enums';
import { CreateMatchingDto } from '../dto/request/create-matching.dto';
import { UpdateMatchingDto } from '../dto/request/update-matching.dto';
import { MatchingEngineService } from './matching-engine.service';
import {
  normalizeSigunguCode,
  sigunguNameOf,
} from '../../course/algorithm/sigungu-name';
import { REGION_LABEL } from '../../course/algorithm/labels';
import { RegionPreferenceDto } from '../dto/request/region-preference.dto';
import { sigunguNameOf } from '../../course/algorithm/sigungu-name';
import {DummyMatchingService} from "../dummy/dummy-matching.service";

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
      private readonly prisma: PrismaService,
      private readonly matchingEngine: MatchingEngineService,
      private readonly dummyMatching: DummyMatchingService,
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
        regionPreferences: {
          // 배열 순서가 곧 순위다. 1순위부터 시작하도록 +1
          create: this.toRegionPreferences(dto.regionPreferences).map(
            (pref, index) => ({ ...pref, priority: index + 1 }),
          ),
        },
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

    try {
      const attempt =
          await this.matchingEngine.tryMatch(
              matching.id,
          );

      /*
       * 실제 사용자 후보를 먼저 탐색한다.
       *
       * 실제 후보가 하나라도 매칭되었다면
       * 더미 fallback은 절대 실행하지 않는다.
       */
      if (!attempt) {
        await this.dummyMatching.tryFallback(
            matching.id,
        );
      }
    } catch (error) {
      this.logger.error(
          '즉시 매칭 시도 중 오류 발생',
          error as Error,
      );
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
        // 순위가 있는 목록이라 부분 수정이 의미가 없다. 보내면 통째로 갈아끼운다.
        ...(dto.regionPreferences && {
          regionPreferences: {
            deleteMany: {},
            create: this.toRegionPreferences(dto.regionPreferences).map(
              (pref, index) => ({ ...pref, priority: index + 1 }),
            ),
          },
        }),
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
      const attempt =
          await this.matchingEngine.tryMatch(
              matchingId,
          );

      if (!attempt) {
        await this.dummyMatching.tryFallback(
            matchingId,
        );
      }
    } catch (error) {
      this.logger.error(
          '재탐색 시도 중 오류 발생',
          error as Error,
      );
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
        regionPreferences: { orderBy: { priority: 'asc' } },
        attemptsAsA: activeAttemptFilter,
        attemptsAsB: activeAttemptFilter,
      },
    });

    const { attemptsAsA, attemptsAsB, regionPreferences, ...rest } = matching;
    const currentAttempt = attemptsAsA[0] ?? attemptsAsB[0] ?? null;

    return {
      ...rest,
      regionPreferences: regionPreferences.map((pref) => ({
        ...pref,
        sigunguName: sigunguNameOf(pref.region, pref.sigunguCode),
      })),
      currentAttempt,
    };
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

  /**
   * 희망 지역을 저장할 수 있는 형태로 만든다.
   *
   * 두 가지를 한다.
   *  - 실재하지 않는 시군구 코드를 막는다. DTO는 숫자 형식만 보기 때문에
   *    서울 '999' 같은 값이 통과하는데, 그러면 아무와도 안 맞다가 어쩌다
   *    매칭돼도 TourAPI에 후보가 없어 결제까지 끝난 뒤 코스 생성이 터진다.
   *  - 폐지된 코드를 현행으로 옮긴다. 한 명이 "창원시", 다른 한 명이 "마산시"를
   *    고르면 같은 곳인데 매칭이 안 되기 때문이다.
   *
   * 정규화하면 서로 달랐던 두 선택이 같아질 수 있어(마산시·진해시 -> 창원시)
   * 여기서 한 번 더 중복을 뺀다. 순위가 높은(앞선) 쪽을 남긴다.
   */
  private toRegionPreferences(preferences: RegionPreferenceDto[]) {
    const seen = new Set<string>();
    const normalized: { region: Region; sigunguCode: string }[] = [];

    for (const pref of preferences) {
      const sigunguCode = normalizeSigunguCode(pref.region, pref.sigunguCode);

      if (!sigunguCode) {
        throw new BadRequestException(
          `${REGION_LABEL[pref.region]}에 없는 시군구입니다: ${pref.sigunguCode}`,
        );
      }

      const key = `${pref.region}:${sigunguCode}`;
      if (seen.has(key)) continue;

      seen.add(key);
      normalized.push({ region: pref.region, sigunguCode });
    }

    return normalized;
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