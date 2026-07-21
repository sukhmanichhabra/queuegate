import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { MerchantService } from './merchant.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RateLimitGuard } from '../fraud/rate-limit.guard';
import { RateLimit } from '../fraud/rate-limit.decorator';

/**
 * Shared rate-limit config for all merchant write operations.
 * Keyed by authenticated user ID (not IP) — each merchant has their own quota.
 * AuthGuard('jwt') always runs before RateLimitGuard so req.user.id is guaranteed.
 */
const MERCHANT_WRITE_RATE_LIMIT = { limit: 30, windowSec: 60, keyStrategy: 'userId' as const, keyPrefix: 'merchant-write' };

@Controller('merchants/events')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('MERCHANT_ADMIN')
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  private getMerchantId(req: any): string {
    const role = req.user.roles.find((r: any) => r.role === 'MERCHANT_ADMIN');
    return role.merchant_id;
  }

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit(MERCHANT_WRITE_RATE_LIMIT)
  createEvent(@Req() req: any, @Body() dto: CreateEventDto) {
    const merchantId = this.getMerchantId(req);
    return this.merchantService.createEvent(merchantId, dto);
  }

  // Read routes — NOT rate-limited (access-controlled by AuthGuard + MERCHANT_ADMIN role)
  @Get()
  listEvents(@Req() req: any) {
    const merchantId = this.getMerchantId(req);
    return this.merchantService.listEvents(merchantId);
  }

  @Get(':id')
  getEvent(@Req() req: any, @Param('id') eventId: string) {
    const merchantId = this.getMerchantId(req);
    return this.merchantService.getEvent(merchantId, eventId);
  }

  @Patch(':id')
  @UseGuards(RateLimitGuard)
  @RateLimit(MERCHANT_WRITE_RATE_LIMIT)
  updateEvent(@Req() req: any, @Param('id') eventId: string, @Body() dto: UpdateEventDto) {
    const merchantId = this.getMerchantId(req);
    return this.merchantService.updateEvent(merchantId, eventId, dto);
  }

  @Post(':id/pause')
  @UseGuards(RateLimitGuard)
  @RateLimit(MERCHANT_WRITE_RATE_LIMIT)
  pauseEvent(@Req() req: any, @Param('id') eventId: string) {
    const merchantId = this.getMerchantId(req);
    return this.merchantService.pauseEvent(merchantId, eventId);
  }

  @Post(':id/resume')
  @UseGuards(RateLimitGuard)
  @RateLimit(MERCHANT_WRITE_RATE_LIMIT)
  resumeEvent(@Req() req: any, @Param('id') eventId: string) {
    const merchantId = this.getMerchantId(req);
    return this.merchantService.resumeEvent(merchantId, eventId);
  }

  // Read-only stats — NOT rate-limited
  @Get(':id/stats')
  getEventStats(@Req() req: any, @Param('id') eventId: string) {
    const merchantId = this.getMerchantId(req);
    return this.merchantService.getEventStats(merchantId, eventId);
  }

  @Post(':id/vip-whitelist')
  @UseGuards(RateLimitGuard)
  @RateLimit(MERCHANT_WRITE_RATE_LIMIT)
  vipWhitelist(@Req() req: any, @Param('id') eventId: string, @Body() emails: string[]) {
    const merchantId = this.getMerchantId(req);
    return this.merchantService.vipWhitelist(merchantId, eventId, emails);
  }

  // ── Ticket category management ────────────────────────────────────────────

  /** Replace all categories for an event (idempotent) */
  @Post(':id/categories')
  @UseGuards(RateLimitGuard)
  @RateLimit(MERCHANT_WRITE_RATE_LIMIT)
  setCategories(@Req() req: any, @Param('id') eventId: string, @Body() categories: any[]) {
    const merchantId = this.getMerchantId(req);
    return this.merchantService.setCategories(merchantId, eventId, categories);
  }

  @Get(':id/categories')
  getCategories(@Param('id') eventId: string) {
    return this.merchantService.getCategories(eventId);
  }

  // ── Delete event ───────────────────────────────────────────────────────────
  /** DELETE /merchants/events/:id — permanently removes a DRAFT or merchant-owned event */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RateLimitGuard)
  @RateLimit(MERCHANT_WRITE_RATE_LIMIT)
  deleteEvent(@Req() req: any, @Param('id') eventId: string) {
    const merchantId = this.getMerchantId(req);
    return this.merchantService.deleteEvent(merchantId, eventId);
  }

  // Read-only export — NOT rate-limited
  @Get(':id/rate-log/export')
  exportRateLog(@Req() req: any, @Param('id') eventId: string, @Res() res: Response) {
    const merchantId = this.getMerchantId(req);
    return this.merchantService.exportRateLog(merchantId, eventId, res);
  }
}
