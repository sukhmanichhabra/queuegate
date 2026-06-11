import { Module } from '@nestjs/common';
import { MerchantService } from './merchant.service';
import { MerchantController } from './merchant.controller';
import { WorkersModule } from '../workers/workers.module';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [WorkersModule, FraudModule],
  controllers: [MerchantController],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
