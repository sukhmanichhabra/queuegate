import { Controller, Post, Body, Param, UseGuards, Get, Query } from '@nestjs/common';
import { MockCheckoutService } from './mock-checkout.service';
import { CompleteCheckoutDto } from './dto/complete-checkout.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RateLimitGuard } from '../fraud/rate-limit.guard';
import { RateLimit } from '../fraud/rate-limit.decorator';

@Controller('mock-checkout')
export class MockCheckoutController {
  constructor(private readonly checkoutService: MockCheckoutService) {}

  @Post('inject-failure')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('OPS_ADMIN')
  injectFailure(@Body() body: { eventId: string }) {
    return this.checkoutService.injectFailure(body.eventId);
  }

  @Post('clear-failure')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('OPS_ADMIN')
  clearFailure(@Body() body: { eventId: string }) {
    return this.checkoutService.clearFailure(body.eventId);
  }

  /**
   * Complete a shopper's checkout after being admitted from the queue.
   *
   * Ownership proof: the caller must present the checkoutToken issued at
   * admission time (signed JWT delivered via WebSocket 'admitted' event).
   * The service verifies the token signature and matches its JTI against the
   * checkout_token_jti stored in the QueueEntry — no user account needed.
   *
   * Rate-limited: 20/min per IP (existing stopgap, now supplemented by the
   * above ownership check which is the real fix for the Phase 13 audit finding).
   */
  @Post('complete/:entryId')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowSec: 60, keyStrategy: 'ip', keyPrefix: 'checkout' })
  completeCheckout(
    @Param('entryId') entryId: string,
    @Body() dto: CompleteCheckoutDto,
  ) {
    return this.checkoutService.completeCheckout(entryId, dto.eventId, dto.checkoutToken);
  }

  @Get('health')
  getHealth(@Query('eventId') eventId: string) {
    return this.checkoutService.getHealth(eventId);
  }
}
