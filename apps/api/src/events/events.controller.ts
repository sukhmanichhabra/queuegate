import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { EventsService } from './events.service';
import { RateLimitGuard } from '../fraud/rate-limit.guard';
import { RateLimit } from '../fraud/rate-limit.decorator';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 60, windowSec: 60, keyStrategy: 'ip', keyPrefix: 'events-read' })
  listEvents(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.eventsService.listEvents(status, pageNum, limitNum);
  }

  @Get('my-tickets')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 60, windowSec: 60, keyStrategy: 'ip', keyPrefix: 'my-tickets' })
  getMyTickets(@Query('sessionId') sessionId: string, @Req() req: any) {
    const userId = req.user?.id;
    return this.eventsService.getMyTickets(userId, sessionId);
  }

  @Get(':id')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 60, windowSec: 60, keyStrategy: 'ip', keyPrefix: 'events-read' })
  getEvent(@Param('id') id: string) {
    return this.eventsService.getEvent(id);
  }

  @Get(':id/rate-logs')
  getRateLogs(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.eventsService.getRateLogs(id, limit ? parseInt(limit, 10) : 20);
  }
}
