import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { v4 as uuidv4 } from 'uuid';
import * as admin from 'firebase-admin';
import * as apn from 'apn';
import { ScheduleCallDto } from './dto/schedule-call.dto';
import { ToggleCallDto } from './dto/toggle-call.dto';
import { CallResponseDto, CallResponseStatus } from './dto/call-response.dto';
import { ScheduledCall } from './interfaces/scheduled-call.interface';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);
  private scheduledCalls: Map<string, ScheduledCall> = new Map();
  private memberCallMap: Map<number, string[]> = new Map(); // 회원 번호와 UUID 배열 매핑
  private callTimeouts: Map<string, NodeJS.Timeout> = new Map(); // 통화 타임아웃 관리

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
        this.cancelScheduledCall(scheduleCallDto.uuid);
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

    // 통화 타임아웃 정리
    this.clearCallTimeout(uuid);

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
    this.initiateCall(scheduledCall, true);

    this.logger.log(
      `즉시 통화가 시작되었습니다. ID: ${uuid}, 회원: ${scheduleCallDto.memberSeq}, 시간: ${currentTime}, 플랫폼: ${scheduleCallDto.platform}`,
    );

    return scheduledCall;
  }

  /**
   * 통화 시작 메서드
   * @param call 예약된 통화 정보
   * @param isImmediateCall 즉시 통화 여부 (true인 경우 알림 전송 후 데이터 삭제)
   */
  private async initiateCall(
    call: ScheduledCall,
    isImmediateCall: boolean = false,
  ): Promise<void> {
    try {
      // 통화 상태 업데이트
      call.status = 'completed';
      this.scheduledCalls.set(call.uuid, call);

      // 통화 응답 대기 타임아웃 설정 (60초)
      this.setCallTimeout(call.uuid, 60000); // 60초 후 자동으로 missed 처리

      // Firebase가 초기화되었는지 확인
      if (admin.apps.length === 0) {
        this.logger.warn(
          `Firebase가 초기화되지 않아 푸시 알림을 전송할 수 없습니다. 테스트 모드로 진행합니다.`,
        );
        this.logger.log(
          `[테스트 모드] 통화 알림이 전송되었습니다. ID: ${call.uuid}, 디바이스: ${call.deviceToken}, 플랫폼: ${call.platform}`,
        );

        // 즉시 콜인 경우 데이터 삭제
        if (isImmediateCall) {
          this.removeImmediateCallData(call);
        }
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

      // 즉시 콜인 경우 알림 전송 후 데이터 삭제
      if (isImmediateCall) {
        this.removeImmediateCallData(call);
        this.logger.log(
          `즉시 통화 데이터가 메모리에서 제거되었습니다. ID: ${call.uuid}, 회원: ${call.memberSeq}`,
        );
      }
    } catch (error) {
      this.logger.error(`통화 시작 중 오류 발생: ${error.message}`);

      // 즉시 콜인 경우 오류 발생 시에도 데이터 삭제
      if (isImmediateCall) {
        this.removeImmediateCallData(call);
        this.logger.log(
          `즉시 통화 오류 발생으로 데이터가 메모리에서 제거되었습니다. ID: ${call.uuid}, 회원: ${call.memberSeq}`,
        );
      }
    }
  }

  /**
   * 즉시 통화 데이터를 메모리에서 제거
   * @param call 제거할 통화 정보
   */
  private removeImmediateCallData(call: ScheduledCall): void {
    // 통화 타임아웃 정리
    this.clearCallTimeout(call.uuid);

    // scheduledCalls Map에서 제거
    this.scheduledCalls.delete(call.uuid);

    // memberCallMap에서 제거
    const memberUuids = this.memberCallMap.get(call.memberSeq);
    if (memberUuids) {
      const updatedUuids = memberUuids.filter((uuid) => uuid !== call.uuid);
      if (updatedUuids.length === 0) {
        this.memberCallMap.delete(call.memberSeq);
      } else {
        this.memberCallMap.set(call.memberSeq, updatedUuids);
      }
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
          timestamp: new Date().toISOString(), // 알림 발송 시점의 타임스탬프ß
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
   * 통화 응답 대기 타임아웃 설정
   * @param uuid 통화 UUID
   * @param timeoutMs 타임아웃 시간 (밀리초)
   */
  private setCallTimeout(uuid: string, timeoutMs: number): void {
    // 기존 타임아웃이 있다면 제거
    this.clearCallTimeout(uuid);

    const timeout = setTimeout(() => {
      this.handleCallTimeout(uuid);
    }, timeoutMs);

    this.callTimeouts.set(uuid, timeout);
    this.logger.log(
      `통화 타임아웃 설정됨. ID: ${uuid}, 대기 시간: ${timeoutMs / 1000}초`,
    );
  }

  /**
   * 통화 타임아웃 제거
   * @param uuid 통화 UUID
   */
  private clearCallTimeout(uuid: string): void {
    const timeout = this.callTimeouts.get(uuid);
    if (timeout) {
      clearTimeout(timeout);
      this.callTimeouts.delete(uuid);
      this.logger.debug(`통화 타임아웃 제거됨. ID: ${uuid}`);
    }
  }

  /**
   * 통화 타임아웃 처리 (자동으로 missed 상태로 변경)
   * @param uuid 통화 UUID
   */
  private handleCallTimeout(uuid: string): void {
    const call = this.scheduledCalls.get(uuid);
    if (!call) {
      this.logger.warn(
        `타임아웃 처리 중 통화 정보를 찾을 수 없습니다. ID: ${uuid}`,
      );
      return;
    }

    // 이미 응답이 있는 경우 타임아웃 처리하지 않음
    if (call.responseStatus) {
      this.logger.debug(
        `통화가 이미 응답되어 타임아웃 처리를 건너뜁니다. ID: ${uuid}, 상태: ${call.responseStatus}`,
      );
      return;
    }

    // missed 상태로 자동 처리
    call.responseStatus = 'missed';
    call.responseTime = new Date();
    call.responseAdditionalInfo = '응답 시간 초과 (자동 처리)';
    this.scheduledCalls.set(uuid, call);

    // 타임아웃 정리
    this.callTimeouts.delete(uuid);

    // 로그 기록
    this.logCallResponse(call, CallResponseStatus.MISSED);

    this.logger.warn(
      `통화 응답 시간 초과로 자동으로 놓침 처리되었습니다. ID: ${uuid}, 회원: ${call.memberSeq}`,
    );
  }

  /**
   * 사용자 통화 응답 처리 메서드
   * @param callResponseDto 통화 응답 정보
   * @returns 업데이트된 통화 정보
   */
  handleCallResponse(callResponseDto: CallResponseDto): ScheduledCall {
    const { uuid, status, responseTime, additionalInfo } = callResponseDto;

    // 통화 정보 조회
    const call = this.scheduledCalls.get(uuid);
    if (!call) {
      throw new NotFoundException(`ID: ${uuid}에 해당하는 통화가 없습니다.`);
    }

    // 응답 시간 처리
    const parsedResponseTime = responseTime
      ? new Date(responseTime)
      : new Date();

    // 통화 응답 정보 업데이트
    call.responseStatus = status;
    call.responseTime = parsedResponseTime;
    call.responseAdditionalInfo = additionalInfo;

    // 통화 상태도 완료로 업데이트
    if (call.status === 'scheduled') {
      call.status = 'completed';
    }

    // 업데이트된 정보 저장
    this.scheduledCalls.set(uuid, call);

    // 타임아웃 제거 (사용자가 응답했으므로)
    this.clearCallTimeout(uuid);

    // 상태별 로그 기록
    this.logCallResponse(call, status);

    return call;
  }

  /**
   * 통화 응답 상태에 따른 상세 로그 기록
   * @param call 통화 정보
   * @param status 응답 상태
   */
  private logCallResponse(
    call: ScheduledCall,
    status: CallResponseStatus,
  ): void {
    const logBase = `회원 ${call.memberSeq}, 통화 ID: ${call.uuid}, 플랫폼: ${call.platform}`;
    const responseTimeStr = call.responseTime?.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    switch (status) {
      case CallResponseStatus.ANSWERED:
        this.logger.log(
          `📞 ✅ [통화 수락] ${logBase}, 응답 시간: ${responseTimeStr}${
            call.responseAdditionalInfo
              ? `, 추가 정보: ${call.responseAdditionalInfo}`
              : ''
          }`,
        );
        break;

      case CallResponseStatus.DECLINED:
        this.logger.warn(
          `📞 ❌ [통화 거절] ${logBase}, 응답 시간: ${responseTimeStr}${
            call.responseAdditionalInfo
              ? `, 추가 정보: ${call.responseAdditionalInfo}`
              : ''
          }`,
        );
        break;

      case CallResponseStatus.MISSED:
        this.logger.error(
          `📞 ⏰ [통화 놓침] ${logBase}, 응답 시간: ${responseTimeStr}${
            call.responseAdditionalInfo
              ? `, 추가 정보: ${call.responseAdditionalInfo}`
              : ''
          }`,
        );
        break;

      default:
        this.logger.debug(
          `📞 ❓ [알 수 없는 응답] ${logBase}, 상태: ${status}, 응답 시간: ${responseTimeStr}`,
        );
    }
  }

  /**
   * 통화 응답 통계 조회
   * @param memberSeq 회원 번호 (선택사항)
   * @returns 통화 응답 통계
   */
  getCallResponseStats(memberSeq?: number): {
    totalCalls: number;
    answered: number;
    declined: number;
    missed: number;
    noResponse: number;
    answerRate: string;
  } {
    let calls: ScheduledCall[];

    if (memberSeq) {
      // 특정 회원의 통화만 조회
      const uuids = this.memberCallMap.get(memberSeq) || [];
      calls = uuids
        .map((uuid) => this.scheduledCalls.get(uuid))
        .filter((call) => call !== undefined);
    } else {
      // 전체 통화 조회
      calls = Array.from(this.scheduledCalls.values());
    }

    // 완료된 통화만 필터링
    const completedCalls = calls.filter((call) => call.status === 'completed');

    const stats = {
      totalCalls: completedCalls.length,
      answered: 0,
      declined: 0,
      missed: 0,
      noResponse: 0,
    };

    completedCalls.forEach((call) => {
      switch (call.responseStatus) {
        case 'answered':
          stats.answered++;
          break;
        case 'declined':
          stats.declined++;
          break;
        case 'missed':
          stats.missed++;
          break;
        default:
          stats.noResponse++;
      }
    });

    // 응답률 계산 (수락 + 거절) / 전체
    const responseRate =
      stats.totalCalls > 0
        ? (
            ((stats.answered + stats.declined) / stats.totalCalls) *
            100
          ).toFixed(1)
        : '0.0';

    return {
      ...stats,
      answerRate: `${responseRate}%`,
    };
  }

  /**
   * 통화 응답 이력 조회
   * @param memberSeq 회원 번호
   * @returns 통화 응답 이력 목록
   */
  getCallResponseHistory(memberSeq: number): {
    uuid: string;
    scheduledTime: string;
    responseStatus?: string;
    responseTime?: string;
    callerName: string;
    platform: string;
  }[] {
    const uuids = this.memberCallMap.get(memberSeq) || [];
    const calls = uuids
      .map((uuid) => this.scheduledCalls.get(uuid))
      .filter((call) => call !== undefined && call.status === 'completed');

    return calls.map((call) => ({
      uuid: call.uuid,
      scheduledTime: call.scheduledTime.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
      }),
      responseStatus: call.responseStatus || '응답 없음',
      responseTime: call.responseTime
        ? call.responseTime.toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul',
          })
        : undefined,
      callerName: call.callerName,
      platform: call.platform,
    }));
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
        // 통화 타임아웃 정리
        this.clearCallTimeout(id);

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
