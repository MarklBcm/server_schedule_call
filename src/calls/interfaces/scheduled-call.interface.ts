/**
 * 예약된 통화 정보를 위한 인터페이스
 */
export interface ScheduledCall {
  /**
   * 고유 식별자
   */
  uuid: string;

  /**
   * 회원 번호
   */
  memberSeq: number;

  /**
   * 통화 예약 시간 (ISO 형식)
   */
  scheduledTime: Date;

  /**
   * 사용자 디바이스 토큰 (FCM)
   */
  deviceToken: string;

  /**
   * 발신자 이름
   */
  callerName: string;

  /**
   * 발신자 아바타 URL (선택 사항)
   */
  callerAvatar?: string;

  /**
   * 통화 제목 또는 목적
   */
  callPurpose?: string;

  /**
   * 플랫폼 타입 (iOS는 VoIP, Android는 FCM)
   */
  platform: 'ios' | 'android';

  /**
   * 통화 상태 (예약됨, 완료됨, 취소됨)
   */
  status: 'scheduled' | 'completed' | 'cancelled';

  /**
   * 예약 활성화 여부
   */
  enabled: boolean;

  /**
   * 사용자 응답 상태 (통화 수락, 거절, 놓침)
   */
  responseStatus?: 'answered' | 'declined' | 'missed';

  /**
   * 사용자 응답 시간
   */
  responseTime?: Date;

  /**
   * 추가 정보 (응답 관련)
   */
  responseAdditionalInfo?: string;
}
