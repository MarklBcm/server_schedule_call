import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [CallsService],
  controllers: [CallsController],
})
export class CallsModule {}
