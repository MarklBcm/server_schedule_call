import { IsString, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';

export enum CallResponseStatus {
  ANSWERED = 'answered',
  DECLINED = 'declined',
  MISSED = 'missed',
}

export class CallResponseDto {
  @IsString()
  @IsNotEmpty()
  uuid: string;

  @IsEnum(CallResponseStatus)
  status: CallResponseStatus;

  @IsOptional()
  @IsString()
  responseTime?: string; // ISO 8601 형식의 응답 시간

  @IsOptional()
  @IsString()
  additionalInfo?: string; // 추가 정보 (선택사항)
}
