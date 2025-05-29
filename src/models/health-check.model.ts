import { HttpStatus } from '@nestjs/common';

/**
 * 서버 정보 모델
 */
export class ServerInfo {
  nodeVersion: string;
  memoryUsage: {
    rss: string;
    heapTotal: string;
    heapUsed: string;
    external: string;
  };

  constructor(nodeVersion: string, memoryUsage: any) {
    this.nodeVersion = nodeVersion;
    this.memoryUsage = memoryUsage;
  }
}

/**
 * 헬스체크 응답 모델
 */
export class HealthCheckResponse {
  status: HttpStatus;
  message: string;
  timestamp: string;
  timezone: string;
  serverInfo: ServerInfo;

  constructor(
    status: HttpStatus,
    message: string,
    timestamp: string,
    timezone: string,
    serverInfo: ServerInfo,
  ) {
    this.status = status;
    this.message = message;
    this.timestamp = timestamp;
    this.timezone = timezone;
    this.serverInfo = serverInfo;
  }

  /**
   * KST 시간으로 현재 헬스체크 응답 생성
   */
  static createHealthy(): HealthCheckResponse {
    const now = new Date();
    const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);

    const memoryUsage = process.memoryUsage();
    const serverInfo = new ServerInfo(process.version, {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
    });

    return new HealthCheckResponse(
      HttpStatus.OK,
      '서버가 정상적으로 동작 중입니다',
      kstTime.toISOString(),
      'Asia/Seoul (KST, UTC+9)',
      serverInfo,
    );
  }
}
