import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { AdmissionTickProcessor } from './admission-tick.processor';
import { SlotReclaimProcessor } from './slot-reclaim.processor';
import { requireEnv } from '../env';

const redisUrl = new URL(requireEnv('REDIS_URL'));

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port || '6379', 10),
      },
    }),
    BullModule.registerQueue({
      name: 'admission_tick',
    }),
    BullModule.registerQueue({
      name: 'slot_reclaim',
    }),
    JwtModule.register({}),
  ],
  providers: [AdmissionTickProcessor, SlotReclaimProcessor],
  exports: [AdmissionTickProcessor],
})
export class WorkersModule {}
