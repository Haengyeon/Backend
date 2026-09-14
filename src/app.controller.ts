import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';

// 서버가 떠 있는지 확인하는 용도라 스웨거 문서에는 넣지 않는다
@ApiExcludeController()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // 배포 중 새 컨테이너가 준비됐는지 판단하는 기준. 인증을 걸면 헬스체크가 막힌다
  @Public()
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
