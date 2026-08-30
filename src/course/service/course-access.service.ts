// 코스 접근 권한. 인증샷·완료·후기 서비스가 모두 여기를 거쳐 코스를 읽는다.
//
// 코스는 두 사람의 것이라 "찾았다"와 "볼 수 있다"가 늘 붙어 다닌다.
// 한 군데로 모아 두면 참여자 검사를 빠뜨린 경로가 생기지 않는다.
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CourseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** 코스를 찾고 요청자가 참여자인지 확인한다 */
  async loadCourseForUser(courseId: string, userId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        matchAttempt: {
          select: {
            matchingA: { select: { userId: true } },
            matchingB: { select: { userId: true } },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('코스를 찾을 수 없습니다');
    }

    const { matchingA, matchingB } = course.matchAttempt;
    if (matchingA.userId !== userId && matchingB.userId !== userId) {
      throw new ForbiddenException('코스 참여자만 이용할 수 있어요');
    }

    return course;
  }

  /** 코스에서 상대가 누구인지 찾는다 */
  resolvePartnerId(
    course: {
      matchAttempt: {
        matchingA: { userId: string };
        matchingB: { userId: string };
      };
    },
    userId: string,
  ): string {
    const { matchingA, matchingB } = course.matchAttempt;
    return matchingA.userId === userId ? matchingB.userId : matchingA.userId;
  }
}
