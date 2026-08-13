import {
  Body,
  Controller,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CourseService } from './course.service';
import { CoursePreviewResponseDto } from './dto/course-preview-response.dto';
import { GenerateCoursePreviewDto } from './dto/generate-course-preview.dto';

@ApiTags('course')
@Controller('course')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post('preview')
  @ApiOperation({
    summary: '코스 추천 알고리즘 실행 (DB 저장 없음)',
    description:
      '매칭이 성사된 상태를 가정하고 공통 테마(1~2개)와 공통 취미(1~3개)를 직접 넣어 ' +
      '한국관광공사 TourAPI 실데이터로 코스를 구성한다. DB에 저장하지 않는다.',
  })
  // 전역 파이프를 건드리지 않기 위해 이 엔드포인트에만 적용
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  preview(
    @Body() dto: GenerateCoursePreviewDto,
  ): Promise<CoursePreviewResponseDto> {
    return this.courseService.preview(dto);
  }
}
