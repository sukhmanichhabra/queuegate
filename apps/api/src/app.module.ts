import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MerchantModule } from './merchant/merchant.module';
import { AdmissionModule } from './admission/admission.module';
import { RedisModule } from './redis/redis.module';
import { KafkaModule } from './kafka/kafka.module';
import { MetricsModule } from './metrics/metrics.module';
import { WsModule } from './ws-gateway/ws.module';
import { WorkersModule } from './workers/workers.module';
import { MockCheckoutModule } from './mock-checkout/mock-checkout.module';
import { EventsModule } from './events/events.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [PrismaModule, AuthModule, MerchantModule, RedisModule, KafkaModule, AdmissionModule, MetricsModule, WsModule, WorkersModule, MockCheckoutModule, EventsModule, AdminModule, HealthModule],
})
export class AppModule {}
