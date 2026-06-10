import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [FraudModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
