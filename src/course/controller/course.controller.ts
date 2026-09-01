// 코스 API
//
// 코스를 만드는 엔드포인트는 없다. 양쪽 결제가 끝나 매칭이 확정되는 순간
// PaymentService가 알아서 만들어 저장하기 때문에, 클라이언트는 GET으로 읽기만 한다.
// (생성은 TourAPI 호출 + DB 9행 쓰기라 조회 때마다 돌릴 수 없다)
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { missionPhotoUploadOptions } from '../upload.config';
import { CourseQueryService } from '../service/course-query.service';
import { CoursePhotoService } from '../service/course-photo.service';
import { CourseCompletionService } from '../service/course-completion.service';
import { CourseReviewService } from '../service/course-review.service';
import { CourseRecommendService } from '../service/course-recommend.service';
import { RecommendedQueryDto } from '../dto/request/recommended-query.dto';
import { RecommendedResponseDto } from '../dto/response/recommended-response.dto';
import { CourseDetailResponseDto } from '../dto/response/course-detail-response.dto';
import { CourseHistoryQueryDto } from '../dto/request/course-history-query.dto';
import {
  CourseHistoryResponseDto,
  CurrentCourseResponseDto,
} from '../dto/response/course-list-response.dto';
import {
  CourseCompletionResponseDto,
  CourseReviewResponseDto,
  MissionPhotoResponseDto,
} from '../dto/response/course-progress-response.dto';
import { CreateCourseReviewDto } from '../dto/request/create-course-review.dto';
import { SpotReviewQueryDto } from '../dto/request/spot-review-query.dto';
import { SpotReviewListResponseDto } from '../dto/response/spot-review-response.dto';
import { CreateMissionPhotoDto } from '../dto/request/create-mission-photo.dto';
import { RegenerateCourseDto } from '../dto/request/regenerate-course.dto';
import { CourseGeneratorService } from '../algorithm/course-generator.service';

// JWT가 붙기 전까지 쓰는 임시 헤더. 매칭 API와 같은 방식이다.
const TEST_USER_HEADER = 'x-test-user-id';

/**
 * 스웨거에 헤더를 표시한다.
 *
 * 클래스에 @ApiHeader를 붙이면 @Headers()가 자동 생성하는 파라미터와 합쳐지지 않아
 * 스웨거에 입력칸이 두 개 생긴다. 메서드마다 붙여야 하나로 합쳐진다.
 */
const ApiTestUserHeader = () =>
  ApiHeader({
    name: TEST_USER_HEADER,
    description: '개발용 테스트 사용자 ID',
    required: true,
  });

@ApiTags('Course')
@Controller('courses')
export class CourseController {
  constructor(
    private readonly courseQuery: CourseQueryService,
    private readonly coursePhoto: CoursePhotoService,
    private readonly courseCompletion: CourseCompletionService,
    private readonly courseReview: CourseReviewService,
    private readonly courseGenerator: CourseGeneratorService,
    private readonly courseRecommend: CourseRecommendService,
  ) {}

  // 'current'와 'history'는 :courseId보다 먼저 선언해야 한다.
  // 아래에 두면 Nest가 두 단어를 코스 ID로 받아버린다.

  @Get('current')
  @ApiTestUserHeader()
  @ApiOperation({
    summary: '진행중인 코스 조회',
    description:
      '결제가 끝나 진행 예정이거나 당일인 코스 1건. 결제는 끝났는데 코스 생성이 ' +
      '아직이면 generating=true로 알려준다.',
  })
  getCurrent(
    @Headers(TEST_USER_HEADER) userId: string,
  ): Promise<CurrentCourseResponseDto> {
    return this.courseQuery.getCurrent(this.requireUserId(userId));
  }

  @Get('history')
  @ApiTestUserHeader()
  @ApiOperation({
    summary: '완료 코스 목록 조회',
    description: '완료 처리된 코스를 최근 순으로. 커서 페이징.',
  })
  getHistory(
    @Headers(TEST_USER_HEADER) userId: string,
    @Query() query: CourseHistoryQueryDto,
  ): Promise<CourseHistoryResponseDto> {
    return this.courseQuery.getHistory(
      this.requireUserId(userId),
      query.limit,
      query.cursor,
    );
  }

  @Get('recommended')
  @ApiTestUserHeader()
  @ApiOperation({
    summary: '추천 관광지 조회',
    description:
      '홈 화면에 뿌릴 가볼 만한 곳 목록. 코스가 아니라 관광지 단위다. ' +
      '프로필 취미로 연관도 높은 테마 3개를 뽑아 전국에서 고른다. ' +
      '지역과 테마를 따로 받지 않는 이유는 프로필에 지역이 없어서다. ' +
      '내 코스에 이미 들어간 곳과 사진이 없는 곳은 뺀다.',
  })
  getRecommended(
    @Headers(TEST_USER_HEADER) userId: string,
    @Query() query: RecommendedQueryDto,
  ): Promise<RecommendedResponseDto> {
    return this.courseRecommend.recommend(this.requireUserId(userId), query);
  }

  @Get('spots/:contentId/reviews')
  @ApiTestUserHeader()
  @ApiOperation({
    summary: '관광지 후기 목록 조회',
    description:
      '한 장소에 쌓인 후기를 코스와 무관하게 모아 본다. ' +
      '추천 목록이나 코스에서 본 장소가 어땠는지 미리 확인하는 용도. ' +
      '익명이라 작성자는 내려가지 않고, 내가 쓴 것인지만 isMine으로 알려준다.',
  })
  @ApiParam({
    name: 'contentId',
    description: '한국관광공사 원본 ID. 코스 스팟의 contentId와 같은 값',
    example: '2553908',
  })
  listSpotReviews(
    @Headers(TEST_USER_HEADER) userId: string,
    @Param('contentId') contentId: string,
    @Query() query: SpotReviewQueryDto,
  ): Promise<SpotReviewListResponseDto> {
    return this.courseReview.listSpotReviews(
      this.requireUserId(userId),
      contentId,
      query.limit,
      query.cursor,
    );
  }

  @Get(':courseId')
  @ApiTestUserHeader()
  @ApiOperation({
    summary: '코스 정보 조회',
    description:
      '여행일 기준으로 공개 범위가 갈린다. ' +
      'D-2 이전은 지역·테마만(LOCKED), D-1은 예고까지(PREVIEW), ' +
      '당일부터 지도와 스팟 전체(FULL). ' +
      '완료된 코스는 여기에 추억영상(video)과 후기(review)가 더 붙어, ' +
      '"그날 뭐 했는지 다시 보는 화면"을 한 번의 조회로 그릴 수 있다. ' +
      '채팅방·기록 탭·D-1 알림이 모두 이 API를 쓴다.',
  })
  @ApiParam({ name: 'courseId' })
  getDetail(
    @Headers(TEST_USER_HEADER) userId: string,
    @Param('courseId') courseId: string,
  ): Promise<CourseDetailResponseDto> {
    return this.courseQuery.getDetail(this.requireUserId(userId), courseId);
  }

  // 후기 조회 전용 엔드포인트는 두지 않는다.
  //   보기   — 완료된 코스의 GET /courses/:courseId 응답에 review로 들어 있다
  //   쓴 직후 — POST /courses/:courseId/reviews 응답이 상대 후기까지 돌려준다
  // 같은 데이터를 두 곳에서 내보내면 필드 하나 늘 때마다 두 군데를 고쳐야 한다.

  @Post(':courseId/missions/:missionId/photos')
  @ApiTestUserHeader()
  @ApiOperation({
    summary: '인증샷 업로드',
    description:
      '사진 파일을 직접 올린다. 사용자 한 명이 같은 미션에 한 장만 올릴 수 있다. ' +
      '저장된 사진은 응답의 imageUrl로 다시 열 수 있다. ' +
      '이 업로드로 필수 미션이 전부 차면 코스가 그 자리에서 완료되고, ' +
      '스탬프와 포인트가 두 사람에게 지급되며 결과가 completion에 실려 온다.',
  })
  @ApiParam({ name: 'courseId' })
  @ApiParam({ name: 'missionId' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '이미지 파일 (최대 10MB)',
        },
        comment: {
          type: 'string',
          maxLength: 100,
          example: '떡볶이 진짜 맛있었다',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', missionPhotoUploadOptions))
  uploadMissionPhoto(
    @Headers(TEST_USER_HEADER) userId: string,
    @Param('courseId') courseId: string,
    @Param('missionId') missionId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateMissionPhotoDto,
  ): Promise<MissionPhotoResponseDto> {
    if (!file) {
      throw new BadRequestException('사진 파일이 필요합니다.');
    }

    return this.coursePhoto.uploadMissionPhoto(
      this.requireUserId(userId),
      courseId,
      missionId,
      { filename: file.filename, comment: dto.comment },
    );
  }

  @Post(':courseId/completions')
  @ApiTestUserHeader()
  @ApiOperation({
    summary: '코스 완료 처리 (예비)',
    description:
      '보통은 마지막 인증샷이 올라올 때 자동으로 완료되므로 부를 일이 없다. ' +
      '자동 처리가 실패해 코스가 열린 채 남았을 때 쓰는 예비 경로다.',
  })
  @ApiParam({ name: 'courseId' })
  complete(
    @Headers(TEST_USER_HEADER) userId: string,
    @Param('courseId') courseId: string,
  ): Promise<CourseCompletionResponseDto> {
    return this.courseCompletion.complete(this.requireUserId(userId), courseId);
  }

  @Post(':courseId/reviews')
  @ApiTestUserHeader()
  @ApiOperation({
    summary: '완료 코스 후기 작성',
    description:
      '데이트를 마치고 한 화면에서 세 후기를 한 번에 보낸다. ' +
      'partnerReview(상대)는 필수이고 상대에게 알림이 간다. ' +
      'courseReview(코스)는 선택이고 본인과 운영진만 본다. ' +
      'spotReviews(장소)는 선택이고 익명으로 전체 공개된다. ' +
      '한 트랜잭션이라 하나라도 실패하면 전부 저장되지 않는다.',
  })
  @ApiParam({ name: 'courseId' })
  createReview(
    @Headers(TEST_USER_HEADER) userId: string,
    @Param('courseId') courseId: string,
    @Body() dto: CreateCourseReviewDto,
  ): Promise<CourseReviewResponseDto> {
    return this.courseReview.createReview(
      this.requireUserId(userId),
      courseId,
      dto,
    );
  }

  @Post('regenerate')
  @ApiOperation({
    summary: '[개발용] 코스 재생성',
    description:
      '코스는 양쪽 결제가 끝나 매칭이 확정될 때 자동으로 만들어진다. ' +
      '그 생성이 결제 응답을 막지 않으려고 비동기로 돌기 때문에 ' +
      'TourAPI가 죽어 있으면 코스 없이 지나간다. ' +
      '그런 매칭을 다시 시도할 때만 쓴다. 이미 코스가 있으면 그대로 반환한다. ' +
      '재시도 스케줄러가 생기면 삭제한다.',
  })
  regenerate(@Body() dto: RegenerateCourseDto): Promise<{ id: string }> {
    return this.courseGenerator.generateForMatchAttempt(dto.matchAttemptId);
  }

  private requireUserId(userId: string): string {
    if (!userId) {
      throw new BadRequestException(`${TEST_USER_HEADER} 헤더가 필요합니다.`);
    }
    return userId;
  }
}
