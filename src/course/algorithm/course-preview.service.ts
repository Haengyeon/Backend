// 코스를 만들어 보여주기만 하는 서비스 (저장 X)
// 스웨거에서 조건 입력 -> priview.service.ts -> 결과 반환하고 끝
// course-planner.ts(순수 계산)에 TourAPI 호출해서 보여는 기능.
// 저장하지 않는 이유: 매칭·결제가 아직 없어서 "매칭됐다고 치고" 조건을 직접 넣기 때문.
// 참고: 결제가 붙은 뒤의 실제 코스 생성은 course-generator.service.ts가 담당
// generator.service.ts에서 조건을 MatchAttempt에서 읽고 결과를 DB에 저장한다.
// 만약에 관계도를 다 연동했다면 '코스 다시 만들기 기능'을 만들거면 계속 필요.

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CoursePreviewResponseDto,
  CoursePreviewSpotDto,
} from '../dto/course-preview-response.dto';
import { GenerateCoursePreviewDto } from '../dto/generate-course-preview.dto';
import {
  CoursePlanningError,
  buildCoursePlan,
  resolveTheme,
} from './course-planner';
import { templateFor } from './course-template';
import { REGION_LABEL, THEME_DESCRIPTION, THEME_LABEL } from './labels';
import { THEME_FILTER, toPoolQueries } from './tour-category';
import { TourApiClient } from './tour-api.client';
import { PlannedSpot } from './types';

// DB를 거치지 않고 코스 알고리즘만 실행
// DB 저장은 course-generator.service.ts 해줌
//공통 테마/취미를 직접 받으므로 User, MatchAttempt 관계가 필요 없음 지금은
@Injectable()
export class CoursePreviewService {
  private readonly logger = new Logger(CoursePreviewService.name);

  constructor(private readonly tourApi: TourApiClient) {}

  async preview(
    dto: GenerateCoursePreviewDto,
  ): Promise<CoursePreviewResponseDto> {
    try {
      // 공통 테마를 직접 받으므로 A/B에 같은 배열을 넣으면 교집합이 곧 입력값이 된다
      const themeResult = resolveTheme(
        dto.commonThemes,
        dto.commonThemes,
        dto.commonHobbies,
      );
      const theme = themeResult.theme;

      // 시간 필터 + 완화용 테마 필터에서 조회 단위를 뽑아 대분류별 1회씩만 호출
      const template = templateFor(theme);
      const queries = toPoolQueries([
        ...template.map((slot) => slot.filter),
        THEME_FILTER[theme],
      ]);

      const pool = await this.tourApi.fetchPool(dto.region, queries);
      this.logger.log(
        `후보 ${pool.length}건 / 호출 ${queries.length}회 (region=${dto.region}, theme=${theme})`,
      );

      const plan = buildCoursePlan(
        { region: dto.region, theme, seed: dto.seed ?? 'preview' },
        pool,
      );

      for (const spot of plan.spots) {
        if (spot.relaxation) {
          this.logger.warn(`스팟 ${spot.order} 조건 완화: ${spot.relaxation}`);
        }
      }

      return {
        title: `${REGION_LABEL[plan.region]} ${THEME_LABEL[plan.theme]} 코스`,
        description: THEME_DESCRIPTION[plan.theme],
        region: plan.region,
        theme: plan.theme,
        themeScores: themeResult.scores,
        thumbnailUrl: plan.spots[0].spot.firstImage,
        totalDistanceKm: Math.round(plan.totalDistanceKm * 10) / 10,
        backtrackPenaltyKm: Math.round(plan.backtrackPenaltyKm * 100) / 100,
        durationMinutes: plan.durationMinutes,
        candidateCount: pool.length,
        apiCallCount: queries.length,
        spots: plan.spots.map((spot) => this.toSpotDto(spot)),
      };
    } catch (error) {
      if (error instanceof CoursePlanningError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private toSpotDto(planned: PlannedSpot): CoursePreviewSpotDto {
    const { spot } = planned;

    return {
      order: planned.order,
      contentId: spot.contentId,
      name: spot.title,
      address: spot.address,
      latitude: spot.latitude,
      longitude: spot.longitude,
      imageUrl: spot.firstImage,
      role: planned.role,
      category:
        [spot.lclsSystm1, spot.lclsSystm2].filter(Boolean).join(' / ') || '-',
      missionTitle: planned.mission.title,
      missionDescription: planned.mission.description,
      stayMinutes: planned.stayMinutes,
      moveMinutesFromPrevious: planned.moveMinutesFromPrevious,
      distanceKmFromPrevious:
        planned.distanceKmFromPrevious === null
          ? null
          : Math.round(planned.distanceKmFromPrevious * 10) / 10,
      relaxation: planned.relaxation,
    };
  }
}
