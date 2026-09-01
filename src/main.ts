import 'dotenv/config';
import {ValidationPipe} from "@nestjs/common";
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { UPLOAD_DIR, UPLOAD_URL_PREFIX } from './course/upload.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');

  // 업로드한 인증샷을 다시 내려주는 경로.
  // setGlobalPrefix 아래가 아니라 루트에 붙어서 /uploads/파일명 으로 열린다.
  app.useStaticAssets(UPLOAD_DIR, { prefix: `${UPLOAD_URL_PREFIX}/` });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
      );

  const config = new DocumentBuilder()
    .setTitle('행연 API')
    .setDescription('행연 API 문서')
    .setVersion('1.0')
    .addTag('행연')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
}
bootstrap();
