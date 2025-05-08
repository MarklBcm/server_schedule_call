import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Delete,
  HttpException,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { CallsService } from './calls.service';
import { ScheduleCallDto } from './dto/schedule-call.dto';
import { ScheduledCall } from './interfaces/scheduled-call.interface';

@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  /**
   * 통화 예약 API
   * @param scheduleCallDto 통화 예약 정보
   * @returns 예약된 통화 정보
   */
  @Post('schedule')
  scheduleCall(
    @Body(new ValidationPipe()) scheduleCallDto: ScheduleCallDto,
  ): ScheduledCall {
    try {
      return this.callsService.scheduleCall(scheduleCallDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 예약된 통화 목록 조회 API
   * @returns 예약된 통화 목록
   */
  @Get()
  getAllScheduledCalls(): ScheduledCall[] {
    return this.callsService.getAllScheduledCalls();
  }

  /**
   * 특정 ID의 예약된 통화 조회 API
   * @param id 통화 ID
   * @returns 예약된 통화 정보
   */
  @Get(':id')
  getScheduledCallById(@Param('id') id: string): ScheduledCall {
    try {
      return this.callsService.getScheduledCallById(id);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  /**
   * 특정 ID의 예약된 통화 취소 API
   * @param id 통화 ID
   * @returns 취소된 통화 정보
   */
  @Delete(':id')
  cancelScheduledCall(@Param('id') id: string): ScheduledCall {
    try {
      return this.callsService.cancelScheduledCall(id);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }
}
