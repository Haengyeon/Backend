import 'dotenv/config';
import {ValidationPipe} from "@nestjs/common";
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

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
