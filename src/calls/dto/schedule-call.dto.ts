import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

/**
 * 통화 예약을 위한 DTO
 */
export class ScheduleCallDto {
  /**
   * 클라이언트에서 생성한 UUID (선택사항)
   * - 제공하지 않거나 유효하지 않은 경우 서버에서 자동 생성
   * - iOS CallKit 호환 형식 (RFC 4122 표준)
   */
  @IsOptional()
  @IsUUID()
  uuid?: string;

  /**
   * 회원 번호
   */
  @IsNotEmpty()
  @IsNumber()
  memberSeq: number;

  /**
   * 통화 예약 시간 (밀리초 타임스탬프)
   * @example 1685598600000
   */
  @IsNotEmpty()
  @IsNumber()
  scheduledTime: number;

  /**
   * 사용자 디바이스 토큰 (FCM)
   */
  @IsNotEmpty()
  @IsString()
  deviceToken: string;

  /**
   * 발신자 이름
   */
  @IsNotEmpty()
  @IsString()
  callerName: string;

  /**
   * 발신자 아바타 URL (선택 사항)
   */
  @IsOptional()
  @IsString()
  callerAvatar?: string;

  /**
   * 통화 제목 또는 목적
   */
  @IsOptional()
  @IsString()
  callPurpose?: string;

  /**
   * 플랫폼 타입 (iOS는 VoIP, Android는 FCM)
   */
  @IsNotEmpty()
  @IsString()
  @IsIn(['ios', 'android'])
  platform: string;

  /**
   * 통화 상태 (예약됨, 완료됨, 취소됨)
   */
  @IsNotEmpty()
  @IsString()
  @IsIn(['scheduled', 'completed', 'cancelled'])
  status?: string;

  /**
   * 예약 활성화 여부
   */
  @IsNotEmpty()
  @IsBoolean()
  enabled: boolean;
}
