import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdmissionService } from './admission.service';
import { AdmissionController } from './admission.controller';
import { EtaService } from './eta.service';
import { KafkaHealthConsumer } from './kafka-health.consumer';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [JwtModule.register({}), FraudModule],
  controllers: [AdmissionController],
  providers: [AdmissionService, EtaService, KafkaHealthConsumer],
  exports: [AdmissionService, KafkaHealthConsumer],
})
export class AdmissionModule {}
