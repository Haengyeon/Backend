// 데이트가 끝난 뒤 남기는 후기.
//
// 세 종류를 한 화면에서 한 번에 받는다. 공개 범위가 달라 테이블은 나뉘지만
// 쓰는 시점이 같아 요청은 하나다.
//   partnerReview  상대가 어땠나  필수  나 + 상대 + 운영진
//   courseReview   코스가 어땠나  선택  나 + 운영진
//   spotReviews    장소가 어땠나  선택  전체 공개(익명)
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CourseStatus,
  NotificationChannel,
} from '../../generated/prisma/enums';
import { daysUntil } from '../course-date.util';
import { isUniqueViolation } from '../prisma-error.util';
import { CreateCourseReviewDto } from '../dto/request/create-course-review.dto';
import {
  SPOT_REVIEW_DEFAULT_LIMIT,
  SPOT_REVIEW_MAX_LIMIT,
} from '../dto/request/spot-review-query.dto';
import { SpotReviewListResponseDto } from '../dto/response/spot-review-response.dto';
import { MyReviewResponseDto } from '../dto/response/my-review-response.dto';
import {
  CourseReviewResponseDto,
  SavedSpotReviewDto,
} from '../dto/response/course-progress-response.dto';
import { CourseAccessService } from './course-access.service';

@Injectable()
export class CourseReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  /**
   * 데이트 마무리 후기.
   *
   * 장소 후기에 contentId를 함께 저장하는 게 핵심이다. CourseSpot 행은 코스마다
   * 새로 생겨서 spotId로만 묶으면 후기가 코스별로 흩어진다. 같은 장소가 나중에
   * 다른 커플의 코스에 나왔을 때 예전 후기를 보여주려면 코스를 가로지르는 키가 필요하다.
   */
  async createReview(
    userId: string,
    courseId: string,
    dto: CreateCourseReviewDto,
  ): Promise<CourseReviewResponseDto> {
    const course = await this.access.loadCourseForUser(courseId, userId);

    // 완료(여행 다음 날)까지 기다리게 하면 데이트를 마친 그날 밤에 후기를 못 쓴다.
    // 후기는 보상과 무관해서 완료 상태에 묶을 이유가 없다. 다녀온 날부터 연다.
    if (daysUntil(course.travelDate) > 0) {
      throw new BadRequestException('여행 당일부터 후기를 남길 수 있어요');
    }

    // 완료 상태를 조건에서 뺀 대신 취소는 여기서 따로 막는다.
    // 안 그러면 취소됐는데 날짜만 지난 코스에 후기가 달린다.
    if (course.status === CourseStatus.CANCELLED) {
      throw new BadRequestException('취소된 코스에는 후기를 남길 수 없어요');
    }

    const partnerId = this.access.resolvePartnerId(course, userId);

    const spotReviews = dto.spotReviews ?? [];
    const spotIds = spotReviews.map((item) => item.spotId);
    if (new Set(spotIds).size !== spotIds.length) {
      throw new BadRequestException('같은 장소에 후기를 두 번 담을 수 없어요');
    }

    const spots = await this.loadSpotsForReview(courseId, spotIds);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const partner = await tx.partnerReview.create({
          data: {
            matchAttemptId: course.matchAttemptId,
            reviewerId: userId,
            revieweeId: partnerId,
            content: dto.partnerReview,
          },
        });

        // 코스 한줄평은 선택이라 보냈을 때만 만든다
        if (dto.courseReview) {
          await tx.courseReview.create({
            data: { courseId, userId, content: dto.courseReview },
          });
        }

        const saved: SavedSpotReviewDto[] = [];
        for (const item of spotReviews) {
          const spot = spots.get(item.spotId)!;
          const created = await tx.spotReview.create({
            data: {
              contentId: spot.contentId,
              courseId,
              spotId: spot.id,
              userId,
              content: item.content,
            },
          });

          saved.push({
            id: created.id,
            spotId: spot.id,
            contentId: created.contentId,
            spotName: spot.name,
            content: created.content,
          });
        }

        // 상대에게 알림. 실제 발송은 아직 없어서 기록만 남긴다.
        // 발송 담당자가 붙으면 이 로그를 읽어 보내면 된다.
        await tx.notificationLog.create({
          data: {
            userId: partnerId,
            channel: NotificationChannel.KAKAO,
            type: 'PARTNER_REVIEW',
            status: 'PENDING',
          },
        });

        // 후기 작성 포인트는 아직 지급하지 않는다. 액수가 정해지지 않아서
        // 임의로 주면 나중에 정책이 바뀔 때 이미 준 것을 회수해야 한다.
        // 정해지면 CourseRewardService를 주입해 여기서 earnPoint를 부르고
        // 응답에 적립 결과를 실으면 된다.

        // 상대 후기는 내가 써야 열린다. 방금 썼으니 여기서 바로 꺼내
        // 응답에 실어 준다. 저장하자마자 상대 후기를 보여주려고 다시
        // 조회할 필요가 없어진다.
        const received = await tx.partnerReview.findUnique({
          where: {
            matchAttemptId_reviewerId: {
              matchAttemptId: course.matchAttemptId,
              reviewerId: partnerId,
            },
          },
          select: { id: true, content: true, createdAt: true },
        });

        return {
          id: partner.id,
          courseId,
          partnerReview: partner.content,
          courseReview: dto.courseReview ?? null,
          spotReviews: saved,
          partnerNotified: true,
          createdAt: partner.createdAt,
          partnerReviewArrived: received !== null,
          receivedPartnerReview: received,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('이미 후기를 작성했어요');
      }
      throw error;
    }
  }

  /**
   * 내가 쓴 후기와 상대가 나에게 쓴 후기.
   * 알림을 받고 상대 후기를 확인하는 지점이다.
   *
   * 상대 후기는 상호 공개다. 상대가 썼다는 사실(partnerReviewArrived)은 바로 알려주되,
   * 내가 쓰기 전에는 내용을 감춘다. 먼저 읽은 쪽이 거기 맞춰 쓰는 걸 막기 위해서다.
   */
  async getMyReviews(
    userId: string,
    courseId: string,
  ): Promise<MyReviewResponseDto> {
    const course = await this.access.loadCourseForUser(courseId, userId);
    const partnerId = this.access.resolvePartnerId(course, userId);

    const [written, received, courseReview, spotReviews] = await Promise.all([
      this.prisma.partnerReview.findUnique({
        where: {
          matchAttemptId_reviewerId: {
            matchAttemptId: course.matchAttemptId,
            reviewerId: userId,
          },
        },
      }),
      this.prisma.partnerReview.findUnique({
        where: {
          matchAttemptId_reviewerId: {
            matchAttemptId: course.matchAttemptId,
            reviewerId: partnerId,
          },
        },
      }),
      this.prisma.courseReview.findUnique({
        where: { courseId_userId: { courseId, userId } },
      }),
      this.prisma.spotReview.findMany({
        where: { courseId, userId },
        include: { spot: { select: { name: true } } },
      }),
    ]);

    const toDto = (row: { id: string; content: string; createdAt: Date }) => ({
      id: row.id,
      content: row.content,
      createdAt: row.createdAt,
    });

    return {
      courseId,
      myPartnerReview: written ? toDto(written) : null,
      partnerReviewArrived: received !== null,
      // 내가 써야 상대 것이 열린다
      receivedPartnerReview: written && received ? toDto(received) : null,
      myCourseReview: courseReview?.content ?? null,
      mySpotReviews: spotReviews.map((review) => ({
        id: review.id,
        spotId: review.spotId,
        contentId: review.contentId,
        spotName: review.spot.name,
        content: review.content,
      })),
    };
  }

  /**
   * 관광지 후기 목록. 코스와 무관하게 그 장소의 후기를 모두 모아 보여준다.
   * 익명이라 작성자는 내보내지 않고, 내가 쓴 것인지만 알려 준다.
   */
  async listSpotReviews(
    userId: string,
    contentId: string,
    limit: number = SPOT_REVIEW_DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<SpotReviewListResponseDto> {
    const take = Math.min(Math.max(limit, 1), SPOT_REVIEW_MAX_LIMIT);

    const [totalCount, rows] = await Promise.all([
      this.prisma.spotReview.count({ where: { contentId } }),
      this.prisma.spotReview.findMany({
        where: { contentId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          content: true,
          createdAt: true,
          userId: true,
        },
      }),
    ]);

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return {
      contentId,
      totalCount,
      items: page.map((review) => ({
        id: review.id,
        content: review.content,
        createdAt: review.createdAt,
        isMine: review.userId === userId,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  /**
   * 장소 후기를 쓸 수 있는 스팟인지 미리 확인한다.
   * 트랜잭션 안에서 걸리면 이미 저장된 다른 후기까지 되돌아가므로 먼저 본다.
   */
  private async loadSpotsForReview(courseId: string, spotIds: string[]) {
    const found = new Map<
      string,
      { id: string; contentId: string; name: string }
    >();
    if (spotIds.length === 0) return found;

    const rows = await this.prisma.courseSpot.findMany({
      where: { id: { in: spotIds }, courseId },
      select: { id: true, contentId: true, name: true },
    });

    for (const row of rows) {
      // 직접 등록한 장소라면 한국관광공사 ID가 없을 수 있다.
      // 그러면 후기가 모일 기준이 없어서 받지 않는다.
      if (!row.contentId) {
        throw new BadRequestException(
          `후기를 남길 수 없는 장소예요: ${row.name}`,
        );
      }
      found.set(row.id, {
        id: row.id,
        contentId: row.contentId,
        name: row.name,
      });
    }

    // 다른 코스의 스팟 ID를 끼워 넣는 걸 막는다
    if (spotIds.some((id) => !found.has(id))) {
      throw new NotFoundException('장소를 찾을 수 없습니다');
    }

    return found;
  }
}
