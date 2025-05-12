import {
  IsNotEmpty,
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
  IsNumber,
} from 'class-validator';

/**
 * 통화 예약을 위한 DTO
 */
export class ScheduleCallDto {
  /**
   * 클라이언트에서 생성한 UUID (선택 사항)
   */
  @IsOptional()
  @IsString()
  uuid?: string;

  /**
   * 통화 예약 시간 (ISO 형식)
   * @example "2023-06-01T14:30:00+09:00"
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
  @IsEnum(['ios', 'android'], {
    message: '플랫폼은 ios 또는 android만 가능합니다.',
  })
  platform: 'ios' | 'android';
}
