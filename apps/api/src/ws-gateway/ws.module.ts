import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { QueueGateway } from './queue.gateway';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [JwtModule.register({}), AuthModule],
  providers: [QueueGateway],
  exports: [QueueGateway],
})
export class WsModule {}
