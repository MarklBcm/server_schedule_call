import {
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsString,
  IsOptional,
} from 'class-validator';

export class ToggleCallDto {
  @IsNotEmpty()
  @IsNumber()
  memberSeq: number;

  @IsOptional()
  @IsString()
  uuid?: string;

  @IsNotEmpty()
  @IsBoolean()
  enabled: boolean;
}
