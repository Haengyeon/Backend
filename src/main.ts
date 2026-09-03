import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import * as cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { UPLOAD_DIR, UPLOAD_URL_PREFIX } from './course/upload.config';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');

  // 리프레시 토큰을 HttpOnly 쿠키로 주고받기 위해 필요
  app.use(cookieParser());

  // 프론트와 도메인이 다르므로 쿠키 전송을 허용해야 한다
  app.enableCors({
    origin: process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  // 업로드한 인증샷을 다시 내려주는 경로.
  // setGlobalPrefix 아래가 아니라 루트에 붙어서 /uploads/파일명 으로 열린다.
  app.useStaticAssets(UPLOAD_DIR, { prefix: `${UPLOAD_URL_PREFIX}/` });

  app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
  );

  // 기본적으로 모든 엔드포인트에 인증을 요구하고, @Public()이 붙은 것만 열어준다
  app.useGlobalGuards(
      new JwtAuthGuard(app.get(JwtService), app.get(Reflector)),
  );

  const config = new DocumentBuilder()
      .setTitle('행연 API')
      .setDescription(
          [
            '## 인증',
            '',
            '카카오 로그인 없이 시드 계정으로 바로 들어갈 수 있다.',
            '',
            '1. `POST /api/v1/auth/dev-token` 에 `{ "userId": "1" }` 로 요청',
            '2. 응답의 `accessToken` 복사',
            '3. 우측 상단 Authorize 버튼에 붙여넣기',
            '',
            '유효기간 1일. 다른 사람으로 바꾸려면 `userId`만 바꿔서 다시 발급받으면 된다.',
            '`refreshToken`은 HttpOnly 쿠키로만 오가므로 Authorize에 넣지 않는다.',
          ].join('\n'),
      )
      .setVersion('1.0')
      .addTag('행연')
      .addBearerAuth()
      .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();