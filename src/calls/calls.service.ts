import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { v4 as uuidv4 } from 'uuid';
import * as admin from 'firebase-admin';
import * as apn from 'apn';
import { ScheduleCallDto } from './dto/schedule-call.dto';
import { ToggleCallDto } from './dto/toggle-call.dto';
import { ScheduledCall } from './interfaces/scheduled-call.interface';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);
  private scheduledCalls: Map<string, ScheduledCall> = new Map();
  private memberCallMap: Map<number, string[]> = new Map(); // 회원 번호와 UUID 배열 매핑

  constructor(private schedulerRegistry: SchedulerRegistry) {}

  /**
   * 통화 예약 메서드
   * @param scheduleCallDto 통화 예약 정보
   * @returns 예약된 통화 정보
   */
  scheduleCall(scheduleCallDto: ScheduleCallDto): ScheduledCall {
    // 회원이 이미 예약한 통화가 있는지 확인
    const existingCallUuids = this.memberCallMap.get(scheduleCallDto.memberSeq);
    if (existingCallUuids && existingCallUuids.length > 0) {
      // 기존 예약 취소 (첫 번째 통화만 취소)
      try {
        this.cancelScheduledCall(existingCallUuids[0]);
        this.logger.log(
          `회원 ${scheduleCallDto.memberSeq}의 기존 예약이 취소되었습니다.`,
        );
      } catch (error) {
        this.logger.error(`기존 예약 취소 중 오류 발생: ${error.message}`);
      }
    }

    // UUID 처리: 클라이언트 제공 UUID 검증 또는 서버에서 자동 생성
    let uuid: string;

    if (scheduleCallDto.uuid?.trim()) {
      // 클라이언트에서 UUID를 제공한 경우 유효성 검증
      if (this.isValidUUID(scheduleCallDto.uuid.trim())) {
        uuid = scheduleCallDto.uuid.toLowerCase().trim();
        this.logger.log(`클라이언트 제공 UUID 사용: ${uuid}`);
      } else {
        // 유효하지 않은 UUID인 경우 서버에서 새로 생성
        uuid = this.generateValidUUID();
        this.logger.warn(
          `클라이언트에서 제공한 UUID가 유효하지 않습니다. 자동 생성된 UUID로 대체: ${uuid}`,
        );
      }
    } else {
      // 클라이언트에서 UUID를 제공하지 않은 경우 서버에서 새로 생성
      uuid = this.generateValidUUID();
      this.logger.log(`UUID가 제공되지 않아 서버에서 자동 생성: ${uuid}`);
    }

    // UUID 중복 검사 및 처리
    if (this.scheduledCalls.has(uuid)) {
      uuid = this.generateValidUUID();
      this.logger.warn(`UUID 중복 발생, 새로운 UUID로 생성: ${uuid}`);
    }

    this.logger.log(`예약된 통화 UUID: ${uuid}`);

    // 빈 문자열 방지
    if (!uuid) {
      throw new Error('UUID가 누락되었습니다.');
    }

    const scheduledTimeAsDate = new Date(scheduleCallDto.scheduledTime);

    // 예약된 통화 객체 생성
    const scheduledCall: ScheduledCall = {
      uuid: uuid,
      memberSeq: scheduleCallDto.memberSeq,
      scheduledTime: scheduledTimeAsDate,
      deviceToken: scheduleCallDto.deviceToken,
      callerName: scheduleCallDto.callerName,
      callerAvatar: scheduleCallDto.callerAvatar,
      callPurpose: scheduleCallDto.callPurpose,
      platform: scheduleCallDto.platform as 'ios' | 'android',
      status: 'scheduled',
      enabled: true,
    };

    // 예약된 통화 저장
    this.scheduledCalls.set(uuid, scheduledCall);

    // 회원의 통화 목록에 추가
    if (!this.memberCallMap.has(scheduleCallDto.memberSeq)) {
      this.memberCallMap.set(scheduleCallDto.memberSeq, []);
    }
    this.memberCallMap.get(scheduleCallDto.memberSeq).push(uuid);

    // 매일 같은 시간에 실행될 작업 스케줄링
    this.scheduleRecurringCallJob(scheduledCall);

    this.logger.log(
      `통화가 예약되었습니다. ID: ${uuid}, 회원: ${scheduleCallDto.memberSeq}, 시간: ${scheduledTimeAsDate.toLocaleTimeString('ko-KR')}, 플랫폼: ${scheduleCallDto.platform}`,
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
    let attempts = 0;
    const maxAttempts = 5; // 무한 루프 방지

    while (attempts < maxAttempts) {
      const uuid = uuidv4().toLowerCase(); // uuidv4는 항상 유효한 UUID를 생성하므로 소문자만 적용

      // 중복 검사
      if (!this.scheduledCalls.has(uuid)) {
        this.logger.log(
          `새로운 UUID 생성 성공: ${uuid} (시도 ${attempts + 1}회)`,
        );
        return uuid;
      }

      attempts++;
      this.logger.warn(`UUID 중복으로 재시도: ${uuid} (시도 ${attempts}회)`);
    }

    // 최대 시도 횟수 초과 시 강제로 UUID 생성 (확률적으로 매우 낮음)
    const fallbackUuid = uuidv4().toLowerCase();
    this.logger.error(
      `최대 UUID 생성 시도 횟수 초과, 강제 생성: ${fallbackUuid}`,
    );
    return fallbackUuid;
  }

  /**
   * 예약된 통화 목록 조회
   * @returns 예약된 통화 목록
   */
  getAllScheduledCalls(): ScheduledCall[] {
    return Array.from(this.scheduledCalls.values());
  }

  /**
   * 특정 회원의 예약된 통화 목록 조회
   * @param memberSeq 회원 번호
   * @returns 예약된 통화 목록
   */
  getScheduledCallsByMemberSeq(memberSeq: number): ScheduledCall[] {
    const uuids = this.memberCallMap.get(memberSeq);
    if (!uuids || uuids.length === 0) {
      throw new NotFoundException(
        `회원 ${memberSeq}에 해당하는 예약된 통화가 없습니다.`,
      );
    }

    return uuids
      .map((uuid) => {
        const call = this.scheduledCalls.get(uuid);
        if (!call) {
          this.logger.warn(`UUID ${uuid}에 해당하는 통화 정보가 없습니다.`);
        }
        return call;
      })
      .filter((call) => call !== undefined);
  }

  /**
   * 특정 ID의 예약된 통화 조회
   * @param uuid 통화 ID
   * @returns 예약된 통화 정보
   */
  getScheduledCallById(uuid: string): ScheduledCall {
    const call = this.scheduledCalls.get(uuid);
    if (!call) {
      throw new NotFoundException(
        `ID: ${uuid}에 해당하는 예약된 통화가 없습니다.`,
      );
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

    // 회원 매핑에서 제거
    const memberUuids = this.memberCallMap.get(call.memberSeq);
    if (memberUuids) {
      const updatedUuids = memberUuids.filter((id) => id !== uuid);
      if (updatedUuids.length === 0) {
        this.memberCallMap.delete(call.memberSeq);
      } else {
        this.memberCallMap.set(call.memberSeq, updatedUuids);
      }
    }

    this.logger.log(
      `통화가 취소되었습니다. ID: ${uuid}, 회원: ${call.memberSeq}`,
    );

    return call;
  }

  /**
   * 특정 회원의 예약된 통화 취소
   * @param memberSeq 회원 번호
   * @returns 취소된 통화 정보
   */
  cancelScheduledCallByMemberSeq(memberSeq: number): ScheduledCall {
    const uuids = this.memberCallMap.get(memberSeq);
    if (!uuids || uuids.length === 0) {
      throw new NotFoundException(
        `회원 ${memberSeq}에 해당하는 예약된 통화가 없습니다.`,
      );
    }

    // 첫 번째 통화만 취소 (기존 동작 유지)
    return this.cancelScheduledCall(uuids[0]);
  }

  /**
   * 예약 활성화/비활성화 토글
   * @param toggleCallDto 토글 정보
   * @returns 업데이트된 통화 정보
   */
  toggleScheduledCall(toggleCallDto: ToggleCallDto): ScheduledCall {
    const { memberSeq, uuid, enabled } = toggleCallDto;

    // uuid가 제공된 경우 해당 통화를 직접 찾기
    if (uuid) {
      const call = this.scheduledCalls.get(uuid);
      if (!call) {
        throw new NotFoundException(
          `ID: ${uuid}에 해당하는 예약된 통화가 없습니다.`,
        );
      }

      // 회원 번호 검증
      if (call.memberSeq !== memberSeq) {
        throw new NotFoundException(
          `회원 ${memberSeq}에게 권한이 없는 통화입니다. (통화 ID: ${uuid})`,
        );
      }

      call.enabled = enabled;
      this.scheduledCalls.set(uuid, call);

      this.logger.log(
        `통화 예약이 ${enabled ? '활성화' : '비활성화'}되었습니다. ID: ${uuid}, 회원: ${memberSeq}`,
      );

      return call;
    }

    // uuid가 없는 경우 기존 로직 사용 (하위 호환성)
    const uuids = this.memberCallMap.get(memberSeq);
    if (!uuids || uuids.length === 0) {
      throw new NotFoundException(
        `회원 ${memberSeq}에 해당하는 예약된 통화가 없습니다.`,
      );
    }

    // 첫 번째 통화만 토글 (기존 동작 유지)
    const firstUuid = uuids[0];
    const call = this.scheduledCalls.get(firstUuid);
    call.enabled = enabled;
    this.scheduledCalls.set(firstUuid, call);

    this.logger.log(
      `통화 예약이 ${enabled ? '활성화' : '비활성화'}되었습니다. ID: ${firstUuid}, 회원: ${memberSeq}`,
    );

    return call;
  }

  /**
   * 특정 통화에 대한 매일 반복 크론 작업 스케줄링
   * @param call 예약된 통화 정보
   */
  private scheduleRecurringCallJob(call: ScheduledCall): void {
    const { uuid, scheduledTime } = call;

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

    // 매일 같은 시간에 실행되는 크론 표현식 생성
    const hours = scheduledTime.getHours();
    const minutes = scheduledTime.getMinutes();
    const cronExpression = `0 ${minutes} ${hours} * * *`; // 초 분 시 일 월 요일

    // 크론 작업 생성
    const job = new CronJob(
      cronExpression,
      () => {
        // 활성화된 경우에만 통화 시작
        if (call.enabled) {
          this.initiateCall(call);
        } else {
          this.logger.log(
            `통화 예약이 비활성화되어 있어 통화가 시작되지 않았습니다. ID: ${uuid}, 회원: ${call.memberSeq}`,
          );
        }
      },
      null,
      true,
      'Asia/Seoul',
    ); // 한국 시간대 사용

    // 스케줄러에 작업 등록
    this.schedulerRegistry.addCronJob(`call-${uuid}`, job);

    this.logger.log(
      `매일 반복 통화 작업이 스케줄링되었습니다. ID: ${uuid}, 회원: ${call.memberSeq}, 시간: ${hours}시 ${minutes}분, 크론: ${cronExpression}`,
    );
  }

  /**
   * 즉시 통화 시작 메서드
   * @param scheduleCallDto 통화 정보
   * @returns 시작된 통화 정보
   */
  initiateImmediateCall(scheduleCallDto: ScheduleCallDto): ScheduledCall {
    // UUID 처리: 클라이언트 제공 UUID 검증 또는 서버에서 자동 생성
    let uuid: string;

    if (scheduleCallDto.uuid?.trim()) {
      // 클라이언트에서 UUID를 제공한 경우 유효성 검증
      if (this.isValidUUID(scheduleCallDto.uuid.trim())) {
        uuid = scheduleCallDto.uuid.toLowerCase().trim();
        this.logger.log(`즉시 통화 - 클라이언트 제공 UUID 사용: ${uuid}`);
      } else {
        // 유효하지 않은 UUID인 경우 서버에서 새로 생성
        uuid = this.generateValidUUID();
        this.logger.warn(
          `즉시 통화 - 클라이언트에서 제공한 UUID가 유효하지 않습니다. 자동 생성된 UUID로 대체: ${uuid}`,
        );
      }
    } else {
      // 클라이언트에서 UUID를 제공하지 않은 경우 서버에서 새로 생성
      uuid = this.generateValidUUID();
      this.logger.log(
        `즉시 통화 - UUID가 제공되지 않아 서버에서 자동 생성: ${uuid}`,
      );
    }

    // UUID 중복 검사 및 처리
    if (this.scheduledCalls.has(uuid)) {
      uuid = this.generateValidUUID();
      this.logger.warn(
        `즉시 통화 - UUID 중복 발생, 새로운 UUID로 생성: ${uuid}`,
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
      memberSeq: scheduleCallDto.memberSeq,
      scheduledTime: currentTime,
      deviceToken: scheduleCallDto.deviceToken,
      callerName: scheduleCallDto.callerName,
      callerAvatar: scheduleCallDto.callerAvatar,
      callPurpose: scheduleCallDto.callPurpose,
      platform: scheduleCallDto.platform as 'ios' | 'android',
      status: 'scheduled',
      enabled: true,
    };

    // 통화 저장
    this.scheduledCalls.set(uuid, scheduledCall);

    // 회원의 통화 목록에 추가
    if (!this.memberCallMap.has(scheduleCallDto.memberSeq)) {
      this.memberCallMap.set(scheduleCallDto.memberSeq, []);
    }
    this.memberCallMap.get(scheduleCallDto.memberSeq).push(uuid);

    // 즉시 통화 시작
    this.initiateCall(scheduledCall);

    this.logger.log(
      `즉시 통화가 시작되었습니다. ID: ${uuid}, 회원: ${scheduleCallDto.memberSeq}, 시간: ${currentTime}, 플랫폼: ${scheduleCallDto.platform}`,
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
    return uuid.toLowerCase();
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
          ttl: 30 * 1000, // 30초
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
        call.scheduledTime < twentyFourHoursAgo
      ) {
        this.scheduledCalls.delete(id);
        // 회원 매핑에서도 제거
        const memberUuids = this.memberCallMap.get(call.memberSeq);
        if (memberUuids) {
          const updatedUuids = memberUuids.filter((uuid) => uuid !== id);
          if (updatedUuids.length === 0) {
            this.memberCallMap.delete(call.memberSeq);
          } else {
            this.memberCallMap.set(call.memberSeq, updatedUuids);
          }
        }
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`${cleanedCount}개의 완료된 통화가 정리되었습니다.`);
    }
  }
}
