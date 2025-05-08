import { Injectable, Logger } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { v4 as uuidv4 } from 'uuid';
import * as admin from 'firebase-admin';
import { ScheduleCallDto } from './dto/schedule-call.dto';
import { ScheduledCall } from './interfaces/scheduled-call.interface';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);
  private scheduledCalls: Map<string, ScheduledCall> = new Map();

  constructor(private schedulerRegistry: SchedulerRegistry) {}

  /**
   * 통화 예약 메서드
   * @param scheduleCallDto 통화 예약 정보
   * @returns 예약된 통화 정보
   */
  scheduleCall(scheduleCallDto: ScheduleCallDto): ScheduledCall {
    const id = uuidv4();
    const scheduledTime = new Date(scheduleCallDto.scheduledTime);

    // 현재 시간이 예약 시간보다 이후인지 확인
    if (scheduledTime <= new Date()) {
      throw new Error('예약 시간은 현재 시간 이후여야 합니다.');
    }

    // 예약된 통화 객체 생성
    const scheduledCall: ScheduledCall = {
      id,
      scheduledTime,
      deviceToken: scheduleCallDto.deviceToken,
      callerName: scheduleCallDto.callerName,
      callerAvatar: scheduleCallDto.callerAvatar,
      callPurpose: scheduleCallDto.callPurpose,
      status: 'scheduled',
    };

    // 예약된 통화 저장
    this.scheduledCalls.set(id, scheduledCall);

    // 예약 시간에 실행될 작업 스케줄링
    this.scheduleCallJob(scheduledCall);

    this.logger.log(`통화가 예약되었습니다. ID: ${id}, 시간: ${scheduledTime}`);

    return scheduledCall;
  }

  /**
   * 예약된 통화 목록 조회
   * @returns 예약된 통화 목록
   */
  getAllScheduledCalls(): ScheduledCall[] {
    return Array.from(this.scheduledCalls.values());
  }

  /**
   * 특정 ID의 예약된 통화 조회
   * @param id 통화 ID
   * @returns 예약된 통화 정보
   */
  getScheduledCallById(id: string): ScheduledCall {
    const call = this.scheduledCalls.get(id);
    if (!call) {
      throw new Error(`ID: ${id}에 해당하는 예약된 통화가 없습니다.`);
    }
    return call;
  }

  /**
   * 특정 ID의 예약된 통화 취소
   * @param id 통화 ID
   * @returns 취소된 통화 정보
   */
  cancelScheduledCall(id: string): ScheduledCall {
    const call = this.getScheduledCallById(id);

    // 크론 작업 취소
    try {
      this.schedulerRegistry.deleteCronJob(`call-${id}`);
    } catch (error) {
      this.logger.error(`크론 작업 취소 중 오류 발생: ${error.message}`);
    }

    // 상태 업데이트
    call.status = 'cancelled';
    this.scheduledCalls.set(id, call);

    this.logger.log(`통화가 취소되었습니다. ID: ${id}`);

    return call;
  }

  /**
   * 특정 통화에 대한 크론 작업 스케줄링
   * @param call 예약된 통화 정보
   */
  private scheduleCallJob(call: ScheduledCall): void {
    const { id, scheduledTime } = call;

    // 크론 작업 생성
    const date = new Date(scheduledTime);
    const job = new CronJob(date, () => {
      this.initiateCall(call);
    });

    // 스케줄러에 작업 등록
    this.schedulerRegistry.addCronJob(`call-${id}`, job);
    job.start();

    this.logger.log(
      `통화 작업이 스케줄링되었습니다. ID: ${id}, 시간: ${scheduledTime}`,
    );
  }

  /**
   * 통화 시작 메서드
   * @param call 예약된 통화 정보
   */
  private async initiateCall(call: ScheduledCall): Promise<void> {
    try {
      // 통화 상태 업데이트
      call.status = 'completed';
      this.scheduledCalls.set(call.id, call);

      // FCM 메시지 구성
      const message = {
        data: {
          type: 'call_incoming',
          id: call.id,
          caller_name: call.callerName,
          caller_avatar: call.callerAvatar || '',
          call_purpose: call.callPurpose || '',
          timestamp: new Date().toISOString(),
        },
        token: call.deviceToken,
      };

      // Firebase가 초기화되었는지 확인
      if (admin.apps.length === 0) {
        this.logger.warn(
          `Firebase가 초기화되지 않아 푸시 알림을 전송할 수 없습니다. 테스트 모드로 진행합니다.`,
        );
        this.logger.log(
          `[테스트 모드] 통화 알림이 전송되었습니다. ID: ${call.id}, 디바이스: ${call.deviceToken}`,
        );
        return;
      }

      // FCM을 통해 푸시 알림 전송
      try {
        await admin.messaging().send(message);
        this.logger.log(
          `통화 알림이 전송되었습니다. ID: ${call.id}, 디바이스: ${call.deviceToken}`,
        );
      } catch (fcmError) {
        this.logger.error(`FCM 메시지 전송 중 오류 발생: ${fcmError.message}`);
        // 오류가 발생해도 통화 상태는 완료로 유지
      }
    } catch (error) {
      this.logger.error(`통화 시작 중 오류 발생: ${error.message}`);
    }
  }

  /**
   * 매일 자정에 완료된 통화 정리
   */
  @Cron('0 0 0 * * *', {
    timeZone: 'Asia/Seoul',
  })
  cleanupCompletedCalls(): void {
    const now = new Date();
    let cleanedCount = 0;

    // 완료되거나 취소된 오래된 통화 정리
    for (const [id, call] of this.scheduledCalls.entries()) {
      if (
        (call.status === 'completed' || call.status === 'cancelled') &&
        call.scheduledTime < new Date(now.getTime() - 24 * 60 * 60 * 1000)
      ) {
        this.scheduledCalls.delete(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`${cleanedCount}개의 완료된 통화가 정리되었습니다.`);
    }
  }
}
