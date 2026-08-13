import { Test, TestingModule } from '@nestjs/testing';
import { CourseService } from './course.service';
import { CoursePreviewService } from './algorithm/course-preview.service';

describe('CourseService', () => {
  let service: CourseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseService,
        { provide: CoursePreviewService, useValue: { preview: jest.fn() } },
      ],
    }).compile();

    service = module.get<CourseService>(CourseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
