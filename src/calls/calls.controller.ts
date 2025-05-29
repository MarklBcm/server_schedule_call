import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { CallsService } from './calls.service';
import { ScheduleCallDto } from './dto/schedule-call.dto';
import { ToggleCallDto } from './dto/toggle-call.dto';
import { ScheduledCall } from './interfaces/scheduled-call.interface';

@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  /**
   * 통화 예약 API
   * - UUID가 제공되지 않거나 유효하지 않은 경우 서버에서 자동 생성
   * - 기존 예약이 있는 경우 자동으로 취소 후 새로 예약
   * @param scheduleCallDto 통화 예약 정보 (uuid는 선택사항)
   * @returns 예약된 통화 정보 (서버 생성 UUID 포함)
   */
  @Post('schedule')
  scheduleCall(
    @Body(new ValidationPipe()) scheduleCallDto: ScheduleCallDto,
  ): ScheduledCall {
    console.log('scheduleCallDto', scheduleCallDto);
    try {
      return this.callsService.scheduleCall(scheduleCallDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 즉시 통화 시작 API
   * - UUID가 제공되지 않거나 유효하지 않은 경우 서버에서 자동 생성
   * - 즉시 VoIP/FCM 푸시 알림을 전송하여 통화 시작
   * @param scheduleCallDto 통화 정보 (uuid는 선택사항)
   * @returns 시작된 통화 정보 (서버 생성 UUID 포함)
   */
  @Post('immediate')
  initiateImmediateCall(
    @Body(new ValidationPipe()) scheduleCallDto: ScheduleCallDto,
  ): ScheduledCall {
    console.log('initiateImmediateCall', scheduleCallDto);
    try {
      return this.callsService.initiateImmediateCall(scheduleCallDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 통화 예약 토글 (활성화/비활성화) API
   * @param toggleCallDto 통화 토글 정보
   * @returns 토글된 통화 정보
   */
  @Post('toggle')
  toggleScheduledCall(
    @Body(new ValidationPipe()) toggleCallDto: ToggleCallDto,
  ): ScheduledCall {
    console.log('toggleScheduledCall', toggleCallDto);
    try {
      return this.callsService.toggleScheduledCall(toggleCallDto);
    } catch (error) {
      if (
        error.message.includes('없습니다') ||
        error.message.includes('권한이 없는')
      ) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 예약된 통화 목록 조회 API
   * @returns 예약된 통화 목록
   */
  @Get()
  getAllScheduledCalls(): ScheduledCall[] {
    console.log('getAllScheduledCalls');
    return this.callsService.getAllScheduledCalls();
  }

  /**
   * 특정 회원의 예약된 통화 목록 조회 API
   * @param memberSeq 회원 번호
   * @returns 해당 회원의 예약된 통화 목록
   */
  @Get('member/:memberSeq')
  getScheduledCallsByMemberSeq(
    @Param('memberSeq') memberSeq: string,
    @Query('memberSeq') queryMemberSeq?: string,
  ): ScheduledCall[] {
    const targetMemberSeq = Number(queryMemberSeq || memberSeq);
    console.log('getScheduledCallsByMemberSeq', targetMemberSeq);

    if (isNaN(targetMemberSeq)) {
      throw new HttpException(
        '유효하지 않은 회원 번호입니다.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return this.callsService.getScheduledCallsByMemberSeq(targetMemberSeq);
    } catch (error) {
      if (error.message.includes('없습니다')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 특정 UUID의 예약된 통화 취소 API
   * @param uuid 통화 UUID (고유 식별자)
   * @returns 취소된 통화 정보
   */
  @Delete('schedule/:uuid')
  cancelScheduledCall(@Param('uuid') uuid: string): ScheduledCall {
    console.log('cancelScheduledCall', uuid);

    try {
      return this.callsService.cancelScheduledCall(uuid);
    } catch (error) {
      if (error.message.includes('존재하지 않는')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
