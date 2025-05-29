import { HttpStatus, Injectable } from '@nestjs/common';
import { HealthCheckResponse } from './models/health-check.model';

@Injectable()
export class AppService {
  getHello(): string {
    console.log('Hello World!');
    return 'Hello World!';
  }

  getHealthCheck(): HealthCheckResponse {
    const memoryUsage = process.memoryUsage();

    return {
      status: HttpStatus.OK,
      message: '서버가 정상적으로 동작 중입니다.',
      timestamp: new Date().toISOString(),
      timezone: 'KST (UTC+9)',
      serverInfo: {
        nodeVersion: process.version,
        memoryUsage: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
        },
      },
    };
  }
}
