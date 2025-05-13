import { Injectable, Logger } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { v4 as uuidv4 } from 'uuid';
import * as admin from 'firebase-admin';
import * as apn from 'apn';
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
    // 클라이언트에서 제공한 UUID 검증 또는 새로 생성
    let uuid: string;

    if (scheduleCallDto.uuid && this.isValidUUID(scheduleCallDto.uuid)) {
      uuid = scheduleCallDto.uuid.toLowerCase();
    } else {
      // 클라이언트에서 UUID를 제공하지 않은 경우 새로 생성
      uuid = this.generateValidUUID();
      this.logger.warn(
        `클라이언트에서 UUID가 누락되었습니다. 자동 생성된 UUID: ${uuid}`,
      );
    }

    this.logger.log(`예약된 통화 UUID: ${uuid}`);

    // 빈 문자열 방지
    if (!uuid) {
      throw new Error('UUID가 누락되었습니다.');
    }

    const scheduledTimeAsDate = new Date(scheduleCallDto.scheduledTime);

    // 현재 시간이 예약 시간보다 이후인지 확인
    if (scheduledTimeAsDate <= new Date()) {
      throw new Error('예약 시간은 현재 시간 이후여야 합니다.');
    }

    // 예약된 통화 객체 생성
    const scheduledCall: ScheduledCall = {
      uuid: uuid,
      scheduledTime: scheduledTimeAsDate,
      deviceToken: scheduleCallDto.deviceToken,
      callerName: scheduleCallDto.callerName,
      callerAvatar: scheduleCallDto.callerAvatar,
      callPurpose: scheduleCallDto.callPurpose,
      platform: scheduleCallDto.platform,
      status: 'scheduled',
    };

    // 예약된 통화 저장
    this.scheduledCalls.set(uuid, scheduledCall);

    // 예약 시간에 실행될 작업 스케줄링
    this.scheduleCallJob(scheduledCall);

    this.logger.log(
      `통화가 예약되었습니다. ID: ${uuid}, 시간: ${new Date(scheduledCall.scheduledTime)}, 플랫폼: ${scheduleCallDto.platform}`,
    );

    return scheduledCall;
  }

  /**
   * UUID가 iOS CallKit 요구사항에 맞는지 확인
   * @param uuid 검증할 UUID 문자열
   * @returns UUID 유효성 여부
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * CallKit에 적합한 UUID 생성
   * @returns 검증된 UUID 문자열
   */
  private generateValidUUID(): string {
    const uuid = uuidv4();

    if (!this.isValidUUID(uuid)) {
      this.logger.warn('유효하지 않은 UUID 생성됨, 재시도합니다.');
      return this.generateValidUUID(); // 재귀적으로 다시 시도
    }

    this.logger.log(`생성된 UUID: ${uuid}`);
    return uuid.toLowerCase(); // 소문자로 통일 (일관성 유지)
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
   * @param uuid 통화 ID
   * @returns 예약된 통화 정보
   */
  getScheduledCallById(uuid: string): ScheduledCall {
    const call = this.scheduledCalls.get(uuid);
    if (!call) {
      throw new Error(`ID: ${uuid}에 해당하는 예약된 통화가 없습니다.`);
    }
    return call;
  }

  /**
   * 특정 ID의 예약된 통화 취소
   * @param uuid 통화 ID
   * @returns 취소된 통화 정보
   */
  cancelScheduledCall(uuid: string): ScheduledCall {
    const call = this.getScheduledCallById(uuid);

    // 크론 작업 취소
    try {
      this.schedulerRegistry.deleteCronJob(`call-${uuid}`);
    } catch (error) {
      this.logger.error(`크론 작업 취소 중 오류 발생: ${error.message}`);
    }

    // 상태 업데이트
    call.status = 'cancelled';
    this.scheduledCalls.set(uuid, call);

    this.logger.log(`통화가 취소되었습니다. ID: ${uuid}`);

    return call;
  }

  /**
   * 특정 통화에 대한 크론 작업 스케줄링
   * @param call 예약된 통화 정보
   */
  private scheduleCallJob(call: ScheduledCall): void {
    const { uuid: uuid, scheduledTime } = call; // scheduledTime은 이제 number 타입

    // 기존 크론 작업 확인 및 삭제
    try {
      const existingJob = this.schedulerRegistry.getCronJob(`call-${uuid}`);
      if (existingJob) {
        this.schedulerRegistry.deleteCronJob(`call-${uuid}`);
        this.logger.log(`기존 통화 작업 삭제됨. ID: ${uuid}`);
      }
    } catch (error) {
      // getCronJob은 작업이 없을 때 에러를 발생시킬 수 있으므로, 에러를 무시합니다.
      this.logger.debug(
        `'call-${uuid}' 이름의 크론 작업이 존재하지 않아 삭제하지 않았습니다.`,
      );
    }

    // 크론 작업 생성
    const date = new Date(scheduledTime); // 숫자형 타임스탬프를 Date 객체로 변환
    const job = new CronJob(date, () => {
      this.initiateCall(call);
    });

    // 스케줄러에 작업 등록
    this.schedulerRegistry.addCronJob(`call-${uuid}`, job);
    job.start();

    this.logger.log(
      `통화 작업이 스케줄링되었습니다. ID: ${uuid}, 시간: ${new Date(scheduledTime)}`,
    );
  }

  /**
   * 즉시 통화 시작 메서드
   * @param scheduleCallDto 통화 정보
   * @returns 시작된 통화 정보
   */
  initiateImmediateCall(scheduleCallDto: ScheduleCallDto): ScheduledCall {
    // 클라이언트에서 제공한 UUID 검증 또는 새로 생성
    let uuid: string;

    if (scheduleCallDto.uuid && this.isValidUUID(scheduleCallDto.uuid)) {
      uuid = scheduleCallDto.uuid.toLowerCase();
    } else {
      // 클라이언트에서 UUID를 제공하지 않은 경우 새로 생성
      uuid = this.generateValidUUID();
      this.logger.warn(
        `클라이언트에서 UUID가 누락되었습니다. 자동 생성된 UUID: ${uuid}`,
      );
    }

    this.logger.log(`즉시 통화 UUID: ${uuid}`);

    // 빈 문자열 방지
    if (!uuid) {
      throw new Error('UUID가 누락되었습니다.');
    }

    // 현재 시간 설정
    const currentTime = new Date();

    // 통화 객체 생성
    const scheduledCall: ScheduledCall = {
      uuid: uuid,
      scheduledTime: currentTime,
      deviceToken: scheduleCallDto.deviceToken,
      callerName: scheduleCallDto.callerName,
      callerAvatar: scheduleCallDto.callerAvatar,
      callPurpose: scheduleCallDto.callPurpose,
      platform: scheduleCallDto.platform,
      status: 'scheduled',
    };

    // 통화 저장
    this.scheduledCalls.set(uuid, scheduledCall);

    // 즉시 통화 시작
    this.initiateCall(scheduledCall);

    this.logger.log(
      `즉시 통화가 시작되었습니다. ID: ${uuid}, 시간: ${currentTime}, 플랫폼: ${scheduleCallDto.platform}`,
    );

    return scheduledCall;
  }

  /**
   * 통화 시작 메서드
   * @param call 예약된 통화 정보
   */
  private async initiateCall(call: ScheduledCall): Promise<void> {
    try {
      // 통화 상태 업데이트
      call.status = 'completed';
      this.scheduledCalls.set(call.uuid, call);

      // Firebase가 초기화되었는지 확인
      if (admin.apps.length === 0) {
        this.logger.warn(
          `Firebase가 초기화되지 않아 푸시 알림을 전송할 수 없습니다. 테스트 모드로 진행합니다.`,
        );
        this.logger.log(
          `[테스트 모드] 통화 알림이 전송되었습니다. ID: ${call.uuid}, 디바이스: ${call.deviceToken}, 플랫폼: ${call.platform}`,
        );
        return;
      }

      // 플랫폼에 따라 다른 메시지 구성
      if (call.platform === 'ios') {
        // iOS용 VoIP 푸시 알림 구성
        await this.sendIosVoipNotification(call);
      } else {
        // Android용 FCM 메시지 구성
        await this.sendAndroidFcmNotification(call);
      }
    } catch (error) {
      this.logger.error(`통화 시작 중 오류 발생: ${error.message}`);
    }
  }

  /**
   * iOS VoIP 푸시 알림 전송
   * @param call 예약된 통화 정보
   */
  private async sendIosVoipNotification(call: ScheduledCall): Promise<void> {
    console.log('sendIosVoipNotification = ', call.uuid);
    try {
      // UUID 형식 확인 및 검증
      const validUUID = this.ensureValidUUID(call.uuid);
      if (validUUID !== call.uuid) {
        this.logger.warn(`UUID 형식 수정됨: ${call.uuid} → ${validUUID}`);
        call.uuid = validUUID;
        this.scheduledCalls.set(validUUID, call);
      }

      // APNs 연결 설정
      const options = {
        token: {
          key: process.env.APN_KEY_PATH, // p8 파일 경로
          keyId: process.env.APN_KEY_ID,
          teamId: process.env.APN_TEAM_ID,
        },
        production: process.env.NODE_ENV === 'production',
      };

      const apnProvider = new apn.Provider(options);

      // VoIP 푸시 알림 생성
      const notification = new apn.Notification();
      notification.topic = `${process.env.IOS_BUNDLE_ID}.voip`; // 앱 번들 ID + .voip
      (notification as any).pushType = 'voip';
      notification.payload = {
        uuid: validUUID, // iOS 앱에서 사용하는 형식으로 수정
        name_caller: call.callerName,
        handle: call.callPurpose || 'Incoming Call',
        is_video: true,
      };

      // 푸시 알림 전송
      const result = await apnProvider.send(notification, call.deviceToken);

      if (result.failed.length > 0) {
        this.logger.error(
          `iOS VoIP 알림 전송 실패: ${JSON.stringify(result.failed)}`,
        );
      } else {
        this.logger.log(
          `iOS VoIP 통화 알림이 전송되었습니다. ID: ${validUUID}, 디바이스: ${call.deviceToken}`,
        );
      }

      // 연결 종료
      apnProvider.shutdown();
    } catch (error) {
      this.logger.error(`iOS VoIP 알림 전송 중 오류 발생: ${error.message}`);
    }
  }

  /**
   * UUID가 iOS CallKit 요구사항에 맞는지 확인하고 필요시 수정
   * @param uuid 검증할 UUID 문자열
   * @returns 검증된 UUID 문자열
   */
  private ensureValidUUID(uuid: string): string {
    if (!this.isValidUUID(uuid)) {
      this.logger.warn(
        `유효하지 않은 UUID 형식 발견: ${uuid}, 새로운 UUID 생성`,
      );
      return this.generateValidUUID();
    }

    // 소문자로 반환 (iOS에서 일관성 있게 처리하기 위함)
    const newUUID = this.generateValidUUID();
    this.logger.log(`UUID가 수정되었습니다. 새 UUID: ${newUUID}`);
    return newUUID;
  }

  /**
   * Android FCM 알림 전송
   * @param call 예약된 통화 정보
   */
  private async sendAndroidFcmNotification(call: ScheduledCall): Promise<void> {
    try {
      // UUID 형식 확인 및 검증 (Android에서도 동일한 형식 유지)
      const validUUID = this.ensureValidUUID(call.uuid);
      if (validUUID !== call.uuid) {
        this.logger.warn(`UUID 형식 수정됨: ${call.uuid} → ${validUUID}`);
        call.uuid = validUUID;
        this.scheduledCalls.set(validUUID, call);
      }

      // Android FCM 메시지 구성
      const message = {
        data: {
          screen: 'incoming_call',
          uuid: validUUID, // 검증된 UUID 사용
          caller_name: call.callerName,
          caller_avatar: call.callerAvatar || '',
          call_purpose: call.callPurpose || '',
          timestamp: new Date().toISOString(), // 알림 발송 시점의 타임스탬프
        },
        android: {
          priority: 'high' as const,
          ttl: 60 * 1000, // 1분
          data: {
            channel_id: 'incoming_calls',
          },
        },
        token: call.deviceToken,
      };

      // FCM을 통해 푸시 알림 전송
      await admin.messaging().send(message);
      this.logger.log(
        `Android FCM 통화 알림이 전송되었습니다. ID: ${validUUID}, 디바이스: ${call.deviceToken}`,
      );
    } catch (error) {
      this.logger.error(`Android FCM 알림 전송 중 오류 발생: ${error.message}`);
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
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    let cleanedCount = 0;

    // 완료되거나 취소된 오래된 통화 정리
    for (const [id, call] of this.scheduledCalls.entries()) {
      if (
        (call.status === 'completed' || call.status === 'cancelled') &&
        call.scheduledTime < twentyFourHoursAgo // 숫자형 타임스탬프 직접 비교
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
