import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MockCheckoutService } from './mock-checkout.service';
import { MockCheckoutController } from './mock-checkout.controller';
import { FraudModule } from '../fraud/fraud.module';
import { MerchantModule } from '../merchant/merchant.module';

@Module({
  imports: [JwtModule.register({}), FraudModule, MerchantModule],
  controllers: [MockCheckoutController],
  providers: [MockCheckoutService],
})
export class MockCheckoutModule {}
