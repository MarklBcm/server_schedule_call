import {
  IsNotEmpty,
  IsString,
  IsDateString,
  IsOptional,
} from 'class-validator';

/**
 * 통화 예약을 위한 DTO
 */
export class ScheduleCallDto {
  /**
   * 통화 예약 시간 (ISO 형식)
   * @example "2023-06-01T14:30:00+09:00"
   */
  @IsNotEmpty()
  @IsDateString()
  scheduledTime: string;

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
}
