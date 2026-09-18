import { Module } from '@nestjs/common';
import { CourseModule } from '../course/course.module';
import { FestivalController } from './controller/festival.controller';
import { FestivalService } from './service/festival.service';
import { FestivalScheduler } from './service/festival.scheduler';

// TourAPI 클라이언트를 쓰려고 CourseModule을 가져온다.
// CourseModule은 행사 쪽을 참조하지 않아서 순환은 없다.
@Module({
  imports: [CourseModule],
  controllers: [FestivalController],
  providers: [FestivalService, FestivalScheduler],
})
export class FestivalModule {}
