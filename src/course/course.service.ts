import { Injectable } from '@nestjs/common';
import { GenerateCoursePreviewDto } from './dto/generate-course-preview.dto';
import { CoursePreviewService } from './algorithm/course-preview.service';

@Injectable()
export class CourseService {
  constructor(private readonly coursePreview: CoursePreviewService) {}

  /** 코스 알고리즘만 실행한다. DB 저장 없음. */
  preview(dto: GenerateCoursePreviewDto) {
    return this.coursePreview.preview(dto);
  }
}
