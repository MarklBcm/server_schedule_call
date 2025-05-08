import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { initializeFirebaseApp } from './config/firebase.config';
import * as dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

async function bootstrap() {
  try {
    // Firebase 초기화 시도
    initializeFirebaseApp();
  } catch (error) {
    console.warn('Firebase 초기화 중 오류가 발생했습니다:', error.message);
    console.warn('Firebase 기능 없이 애플리케이션을 계속 실행합니다.');
  }

  const app = await NestFactory.create(AppModule);

  // 전역 유효성 검사 파이프 설정
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 정의되지 않은 속성 제거
      forbidNonWhitelisted: true, // DTO에 정의되지 않은 속성이 있으면 요청 거부
      transform: true, // 요청 데이터를 DTO 클래스 인스턴스로 자동 변환
    }),
  );

  // CORS 설정
  app.enableCors();

  // 포트 설정 (환경 변수에서 가져오거나 기본값 사용)
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`애플리케이션이 http://localhost:${port}/ 에서 실행 중입니다.`);
}
bootstrap();
