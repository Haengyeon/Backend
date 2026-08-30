// 저장된 코스를 읽어서 화면에 맞게 잘라 주는 서비스
//
// 알고리즘을 다시 돌리지 않는다. 코스는 결제 완료 시점에 CourseGeneratorService가
// 한 번 만들어 저장했고, 여기서는 그걸 읽기만 한다.
// (매번 다시 만들면 새로고침할 때마다 코스가 바뀐다)
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus, MatchAttemptStatus } from '../../generated/prisma/enums';
import {
  THEME_DRESS_TIP,
  THEME_INDOOR,
  THEME_LABEL,
  formatDuration,
} from '../algorithm/labels';
import { daysUntil, toDateString, viewTypeOf } from '../course-date.util';
import {
  CourseDetailResponseDto,
  CoursePartnerDto,
  CourseSpotDto,
} from '../dto/response/course-detail-response.dto';
import {
  CourseHistoryResponseDto,
  CurrentCourseResponseDto,
} from '../dto/response/course-list-response.dto';
import { CourseReviewService } from './course-review.service';

/** 진행중 코스로 볼 상태 */
const ONGOING_STATUSES = [CourseStatus.UPCOMING, CourseStatus.IN_PROGRESS];

export const HISTORY_DEFAULT_LIMIT = 10;
export const HISTORY_MAX_LIMIT = 30;

// 참여자 판별과 상대 프로필에 필요한 관계
const participantInclude = {
  matchAttempt: {
    include: {
      matchingA: { include: { user: { include: { profile: true } } } },
      matchingB: { include: { user: { include: { profile: true } } } },
    },
  },
} as const;

const detailInclude = {
  ...participantInclude,
  // 완료된 코스에서만 쓰지만, 코스 한 건 조회에 붙는 1:1 관계라 늘 함께 읽는다
  video: true,
  spots: {
    orderBy: { order: 'asc' },
    include: { missions: { include: { photos: true } } },
  },
} as const;

@Injectable()
export class CourseQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly review: CourseReviewService,
  ) {}

  /** 코스 상세. viewType으로 공개 범위를 잘라서 준다. */
  async getDetail(
    userId: string,
    courseId: string,
  ): Promise<CourseDetailResponseDto> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: detailInclude,
    });

    if (!course) {
      throw new NotFoundException('코스를 찾을 수 없습니다');
    }

    const sides = this.resolveSides(course.matchAttempt, userId);
    if (!sides) {
      throw new ForbiddenException('코스 참여자만 조회할 수 있어요');
    }

    const dday = daysUntil(course.travelDate);
    const viewType = viewTypeOf(dday);

    // 어느 단계에서도 나가는 최소 정보
    const base: CourseDetailResponseDto = {
      viewType,
      id: course.id,
      region: course.region,
      theme: course.theme,
      themeLabel: THEME_LABEL[course.theme],
      travelDate: toDateString(course.travelDate),
      dday,
    };

    if (viewType === 'LOCKED') return base;

    // D-1부터는 코스 이름과 예고 정보를 연다
    const withPreview: CourseDetailResponseDto = {
      ...base,
      title: course.title,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      partner: this.toPartnerDto(sides.partnerProfile),
      preview: {
        isIndoor: THEME_INDOOR[course.theme],
        estimatedTime: formatDuration(course.durationMinutes ?? 0),
        dressTip: THEME_DRESS_TIP[course.theme],
      },
    };

    if (viewType === 'PREVIEW') return withPreview;

    // 당일부터 지도와 스팟 전체를 연다.
    // 후기 수는 스팟마다 세지 않고 contentId 묶음으로 한 번에 받는다.
    const reviews = await this.spotReviewCounts(
      userId,
      course.spots.map((spot) => spot.contentId),
    );

    const spots = course.spots.map((spot) =>
      this.toSpotDto(spot, userId, sides.partnerUserId, reviews),
    );

    const full: CourseDetailResponseDto = {
      ...withPreview,
      status: course.status,
      durationMinutes: course.durationMinutes,
      totalDistanceKm: course.totalDistanceKm,
      mapCenter: this.averageCenter(spots),
      spots,
    };

    if (course.status !== CourseStatus.COMPLETED) return full;

    // 완료된 코스는 추억 페이지가 된다. 영상과 후기를 함께 실어
    // 화면이 한 번의 조회로 그려지게 한다.
    return {
      ...full,
      video: course.video
        ? {
            status: course.video.status,
            videoUrl: course.video.videoUrl,
            thumbnailUrl: course.video.thumbnailUrl,
          }
        : null,
      review: await this.review.getMyReviews(userId, courseId),
    };
  }

  /**
   * 진행중인 코스 1건.
   *
   * 코스는 매칭 성사 직후 비동기로 만들어져서, 수락하자마자 열어 보면
   * 아직 없을 수 있다. 그때는 generating=true로 알려준다.
   * 화면이 "코스 없음"과 "만드는 중"을 구분해야 하기 때문이다.
   */
  async getCurrent(userId: string): Promise<CurrentCourseResponseDto> {
    const course = await this.prisma.course.findFirst({
      where: {
        status: { in: ONGOING_STATUSES },
        matchAttempt: this.participantFilter(userId),
      },
      orderBy: { travelDate: 'asc' },
      include: detailInclude,
    });

    if (course) {
      const sides = this.resolveSides(course.matchAttempt, userId)!;
      const missions = course.spots.flatMap((spot) => spot.missions);

      return {
        generating: false,
        course: {
          id: course.id,
          title: course.title,
          region: course.region,
          theme: course.theme,
          themeLabel: THEME_LABEL[course.theme],
          travelDate: toDateString(course.travelDate),
          dday: daysUntil(course.travelDate),
          status: course.status,
          thumbnailUrl: course.thumbnailUrl,
          partner: this.toPartnerDto(sides.partnerProfile),
          progress: {
            // 두 사람이 다 올려야 그 미션이 끝난 것으로 본다
            completedMissions: missions.filter((m) => m.photos.length >= 2)
              .length,
            totalMissions: missions.length,
          },
        },
      };
    }

    // 코스는 양쪽 결제가 끝나 CONFIRMED가 될 때 만들어진다.
    // PAYMENT_PENDING도 함께 보는 건 결제 직후 아주 짧은 순간을 놓치지 않기 위해서다.
    const awaitingGeneration = await this.prisma.matchAttempt.findFirst({
      where: {
        status: {
          in: [
            MatchAttemptStatus.PAYMENT_PENDING,
            MatchAttemptStatus.CONFIRMED,
          ],
        },
        course: { is: null },
        ...this.participantWhere(userId),
      },
      select: { id: true },
    });

    return { generating: awaitingGeneration !== null, course: null };
  }

  /** 완료 코스 목록. 최근에 끝난 것부터 커서 페이징. */
  async getHistory(
    userId: string,
    limit: number = HISTORY_DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<CourseHistoryResponseDto> {
    const take = Math.min(Math.max(limit, 1), HISTORY_MAX_LIMIT);

    // 한 건 더 받아서 다음 페이지가 있는지 본다
    const rows = await this.prisma.course.findMany({
      where: {
        status: CourseStatus.COMPLETED,
        matchAttempt: this.participantFilter(userId),
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        ...participantInclude,
        video: true,
        reviews: { where: { userId }, select: { id: true } },
        spots: {
          orderBy: { order: 'asc' },
          include: { missions: { include: { photos: true } } },
        },
      },
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const items = page.map((course) => {
      const sides = this.resolveSides(course.matchAttempt, userId)!;
      const photos = course.spots.flatMap((spot) =>
        spot.missions.flatMap((mission) => mission.photos),
      );

      return {
        id: course.id,
        title: course.title,
        region: course.region,
        theme: course.theme,
        themeLabel: THEME_LABEL[course.theme],
        travelDate: toDateString(course.travelDate),
        completedAt: course.completedAt,
        // 관광지 사진이 없으면 두 사람이 찍은 첫 인증샷을 대표로 쓴다
        thumbnailUrl: course.thumbnailUrl ?? photos[0]?.imageUrl ?? null,
        partner: this.toPartnerDto(sides.partnerProfile),
        photoCount: photos.length,
        hasReview: course.reviews.length > 0,
        // 목록에선 "영상 있음" 배지만 걸면 되니 상태만 준다.
        // 실제 재생은 코스 상세에서 videoUrl을 받아서 한다.
        video: course.video ? { status: course.video.status } : null,
      };
    });

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    };
  }

  /**
   * 스팟들의 관광지 후기 수와 내가 썼는지 여부를 한 번에 센다.
   * 후기는 코스가 아니라 contentId에 붙어 있어 다른 코스 것까지 함께 잡힌다.
   */
  private async spotReviewCounts(
    userId: string,
    contentIds: (string | null)[],
  ): Promise<Map<string, { count: number; mine: boolean }>> {
    const ids = contentIds.filter((id): id is string => id !== null);
    const result = new Map<string, { count: number; mine: boolean }>();
    if (ids.length === 0) return result;

    const [grouped, mine] = await Promise.all([
      this.prisma.spotReview.groupBy({
        by: ['contentId'],
        where: { contentId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.spotReview.findMany({
        where: { contentId: { in: ids }, userId },
        select: { contentId: true },
      }),
    ]);

    const mineSet = new Set(mine.map((row) => row.contentId));
    for (const row of grouped) {
      result.set(row.contentId, {
        count: row._count._all,
        mine: mineSet.has(row.contentId),
      });
    }

    return result;
  }

  /** MatchAttempt를 직접 조회할 때 쓰는 참여자 조건 */
  private participantWhere(userId: string) {
    return { OR: [{ matchingA: { userId } }, { matchingB: { userId } }] };
  }

  /**
   * Course에서 matchAttempt를 타고 들어갈 때 쓰는 관계 필터.
   * `is`는 관계를 건널 때만 붙는다. MatchAttempt를 직접 조회하는 곳에
   * 이걸 쓰면 Prisma가 `is`를 컬럼으로 읽고 터진다.
   */
  private participantFilter(userId: string) {
    return { is: this.participantWhere(userId) };
  }

  /**
   * 요청자가 A쪽인지 B쪽인지 가려내고 상대 정보를 함께 돌려준다.
   * 참여자가 아니면 null.
   */
  private resolveSides(
    attempt: {
      matchingA: { userId: string; user: { profile: unknown } };
      matchingB: { userId: string; user: { profile: unknown } };
    },
    userId: string,
  ) {
    const isSideA = attempt.matchingA.userId === userId;
    const isSideB = attempt.matchingB.userId === userId;
    if (!isSideA && !isSideB) return null;

    const partner = isSideA ? attempt.matchingB : attempt.matchingA;

    return {
      partnerUserId: partner.userId,
      partnerProfile: partner.user.profile as {
        nickname: string;
        profileImageUrl: string;
      } | null,
    };
  }

  private toPartnerDto(
    profile: { nickname: string; profileImageUrl: string } | null,
  ): CoursePartnerDto {
    // 프로필은 매칭 조건 생성 시점에 이미 검증되지만, 관계가 끊긴 경우를 대비한 기본값
    return {
      nickname: profile?.nickname ?? '알 수 없음',
      profileImageUrl: profile?.profileImageUrl ?? '',
    };
  }

  private toSpotDto(
    spot: {
      id: string;
      contentId: string | null;
      order: number;
      role: string | null;
      name: string;
      category: string | null;
      address: string;
      latitude: number;
      longitude: number;
      imageUrl: string | null;
      stayMinutes: number | null;
      moveMinutesFromPrevious: number | null;
      missions: {
        id: string;
        title: string;
        description: string | null;
        isRequired: boolean;
        photos: {
          id: string;
          userId: string;
          imageUrl: string;
          comment: string | null;
          createdAt: Date;
        }[];
      }[];
    },
    userId: string,
    partnerUserId: string,
    reviews: Map<string, { count: number; mine: boolean }>,
  ): CourseSpotDto {
    // 알고리즘은 스팟당 미션 하나만 만든다
    const mission = spot.missions[0];
    const review = spot.contentId ? reviews.get(spot.contentId) : undefined;

    return {
      id: spot.id,
      contentId: spot.contentId,
      order: spot.order,
      role: spot.role,
      name: spot.name,
      category: spot.category,
      address: spot.address,
      latitude: spot.latitude,
      longitude: spot.longitude,
      imageUrl: spot.imageUrl,
      stayMinutes: spot.stayMinutes,
      moveMinutesFromPrevious: spot.moveMinutesFromPrevious,
      reviewCount: review?.count ?? 0,
      reviewWritten: review?.mine ?? false,
      mission: mission
        ? {
            id: mission.id,
            title: mission.title,
            description: mission.description,
            isRequired: mission.isRequired,
            photoUploaded: mission.photos.some((p) => p.userId === userId),
            partnerPhotoUploaded: mission.photos.some(
              (p) => p.userId === partnerUserId,
            ),
            // 올린 순서대로. 완료된 코스에서는 이 두 장이 추억 페이지의 재료다.
            // 작성자는 "내 것인지"만 알려 준다 — 화면에서 구분할 수 있으면 충분하다.
            photos: [...mission.photos]
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
              .map((photo) => ({
                id: photo.id,
                imageUrl: photo.imageUrl,
                comment: photo.comment,
                isMine: photo.userId === userId,
                createdAt: photo.createdAt,
              })),
          }
        : null,
    };
  }

  /**
   * 지도를 어디에 맞출지 몰라 엉뚱한 곳이 중앙이 되는 걸 막는다.
   * 스팟이 좁게 모여 있어 단순 평균으로 충분하다.
   */
  private averageCenter(spots: { latitude: number; longitude: number }[]) {
    if (spots.length === 0) return { latitude: 0, longitude: 0 };

    const sum = spots.reduce(
      (acc, spot) => ({
        latitude: acc.latitude + spot.latitude,
        longitude: acc.longitude + spot.longitude,
      }),
      { latitude: 0, longitude: 0 },
    );

    return {
      latitude: sum.latitude / spots.length,
      longitude: sum.longitude / spots.length,
    };
  }
}
