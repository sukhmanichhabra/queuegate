import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { AdmissionTickProcessor } from '../workers/admission-tick.processor';
import { RedisService } from '../redis/redis.service';
import { Response } from 'express';

@Injectable()
export class MerchantService {
  constructor(
    private prisma: PrismaService,
    private tickProcessor: AdmissionTickProcessor,
    private redis: RedisService,
  ) {}

  async createEvent(merchantId: string, dto: CreateEventDto) {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          merchant_id:             merchantId,
          title:                   dto.title,
          artist:                  dto.artist,
          venue:                   dto.venue,
          show_date:               new Date(dto.showDate),
          ticket_price:            dto.ticketPrice,
          image_url:               dto.imageUrl ?? null,
          series_id:               dto.seriesId,
          capacity:                dto.capacity,
          admission_rate_per_min:  dto.admissionRatePerMin || 60,
          baseline_admission_rate: dto.admissionRatePerMin || 60,
          status:                  'DRAFT',
        },
      });

      // If categories are provided, create them within the same transaction
      if (dto.categories && dto.categories.length > 0) {
        await tx.ticketCategory.createMany({
          data: dto.categories.map((cat, i) => ({
            event_id:   event.id,
            name:       cat.name,
            description: cat.description,
            price:      cat.price,
            capacity:   cat.capacity,
            color:      cat.color ?? '#e11d48',
            sort_order: cat.sortOrder ?? i,
          })),
        });
      }

      return tx.event.findUnique({
        where: { id: event.id },
        include: { ticket_categories: { orderBy: { sort_order: 'asc' } } },
      });
    });
  }

  async listEvents(merchantId: string) {
    return this.prisma.event.findMany({
      where:   { merchant_id: merchantId },
      orderBy: { created_at: 'desc' },
      include: { ticket_categories: { orderBy: { sort_order: 'asc' } } },
    });
  }

  async getEvent(merchantId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where:   { id: eventId },
      include: { ticket_categories: { orderBy: { sort_order: 'asc' } } },
    });

    if (!event || event.merchant_id !== merchantId) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async deleteEvent(merchantId: string, eventId: string): Promise<void> {
    // Verify ownership (throws NotFoundException if not owner)
    await this.getEvent(merchantId, eventId);

    // Stop any running admission tick job for this event
    await this.tickProcessor.removeEventJob(eventId);

    // Cascade-delete all related rows then the event itself
    await this.prisma.$transaction(async (tx) => {
      await tx.ticketCategory.deleteMany({ where: { event_id: eventId } });
      await tx.admissionRateLog.deleteMany({ where: { event_id: eventId } });
      await tx.queueEntry.deleteMany({ where: { event_id: eventId } });
      await tx.event.delete({ where: { id: eventId } });
    });
  }

  async updateEvent(merchantId: string, eventId: string, dto: UpdateEventDto) {
    await this.getEvent(merchantId, eventId); // verify ownership

    return this.prisma.event.update({
      where: { id: eventId },
      data: {
        title:                   dto.title,
        artist:                  dto.artist,
        venue:                   dto.venue,
        show_date:               dto.showDate ? new Date(dto.showDate) : undefined,
        ticket_price:            dto.ticketPrice,
        series_id:               dto.seriesId,
        capacity:                dto.capacity,
        admission_rate_per_min:  dto.admissionRatePerMin,
        baseline_admission_rate: dto.admissionRatePerMin,
      },
    });
  }

  async pauseEvent(merchantId: string, eventId: string) {
    await this.getEvent(merchantId, eventId);
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data:  { status: 'PAUSED' },
    });
    await this.tickProcessor.removeEventJob(eventId);
    return updated;
  }

  async resumeEvent(merchantId: string, eventId: string) {
    await this.getEvent(merchantId, eventId);
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data:  { status: 'ON_SALE' },
    });
    await this.tickProcessor.registerEventJob(eventId);
    return updated;
  }

  // ── Ticket category management ─────────────────────────────────────────────

  async setCategories(merchantId: string, eventId: string, categories: any[]) {
    await this.getEvent(merchantId, eventId); // verify ownership

    return this.prisma.$transaction(async (tx) => {
      // Replace all categories
      await tx.ticketCategory.deleteMany({ where: { event_id: eventId } });
      await tx.ticketCategory.createMany({
        data: categories.map((cat, i) => ({
          event_id:   eventId,
          name:       cat.name,
          description: cat.description,
          price:      cat.price,
          capacity:   cat.capacity,
          color:      cat.color ?? '#e11d48',
          sort_order: cat.sortOrder ?? i,
        })),
      });
      return tx.ticketCategory.findMany({
        where:   { event_id: eventId },
        orderBy: { sort_order: 'asc' },
      });
    });
  }

  async getCategories(eventId: string) {
    // For each category, compute available capacity = category.capacity - sold/admitted
    const categories = await this.prisma.ticketCategory.findMany({
      where:   { event_id: eventId },
      orderBy: { sort_order: 'asc' },
    });

    const result = await Promise.all(
      categories.map(async (cat) => {
        const consumed = await this.prisma.queueEntry.count({
          where: {
            ticket_category_id: cat.id,
            status: { in: ['WAITING', 'ADMITTED', 'COMPLETED'] },
          },
        });
        return {
          ...cat,
          availableCapacity: Math.max(0, cat.capacity - consumed),
          soldOut: consumed >= cat.capacity,
        };
      }),
    );

    return result;
  }

  // ── Stats (internal + guarded) ──────────────────────────────────────────────

  async getEventStatsInternal(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where:   { id: eventId },
      include: { ticket_categories: true },
    });

    if (!event) throw new NotFoundException('Event not found');

    const queueDepth = await this.prisma.queueEntry.count({
      where: { event_id: eventId, status: 'WAITING' },
    });

    const ticketsSold = await this.prisma.queueEntry.count({
      where: { event_id: eventId, status: 'COMPLETED' },
    });

    const admittedNow = await this.prisma.queueEntry.count({
      where: {
        event_id: eventId,
        status:   'ADMITTED',
        expires_at: { gt: new Date() },
      },
    });

    const totalProcessed = ticketsSold + admittedNow;

    // Per-category revenue: sum COMPLETED entries × their category price
    let revenue = 0;
    if (event.ticket_categories.length > 0) {
      const completedEntries = await this.prisma.queueEntry.findMany({
        where:   { event_id: eventId, status: 'COMPLETED' },
        include: { ticket_category: true },
      });
      revenue = completedEntries.reduce((sum, e) => {
        const price = e.ticket_category?.price ?? event.ticket_price;
        return sum + price;
      }, 0);
    } else {
      revenue = ticketsSold * (event.ticket_price || 0);
    }

    const capacityRemaining = Math.max(0, event.capacity - totalProcessed);

    return {
      eventId:           event.id,
      capacity:          event.capacity,
      admissionRatePerMin: event.admission_rate_per_min,
      ticketPrice:       event.ticket_price,
      status:            event.status,
      queueDepth,
      ticketsSold,
      admittedNow,
      totalProcessed,
      revenue,
      capacityRemaining,
      throttleActive: false,
    };
  }

  async getEventStats(merchantId: string, eventId: string) {
    await this.getEvent(merchantId, eventId);
    return this.getEventStatsInternal(eventId);
  }

  async vipWhitelist(merchantId: string, eventId: string, emails: string[]) {
    await this.getEvent(merchantId, eventId);
    const pipeline = this.redis.client.pipeline();
    const queueKey = `event:${eventId}:queue`;
    for (const email of emails) {
      pipeline.zadd(queueKey, 0, email);
    }
    await pipeline.exec();
    return { success: true, count: emails.length };
  }

  async exportRateLog(merchantId: string, eventId: string, res: Response) {
    await this.getEvent(merchantId, eventId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="rate_log_${eventId}.csv"`);
    res.write('id,event_id,rate,reason,changed_at\n');

    let skip = 0;
    const take = 1000;
    let logs = await this.prisma.admissionRateLog.findMany({
      where:   { event_id: eventId },
      orderBy: { changed_at: 'asc' },
      skip,
      take,
    });
    while (logs.length > 0) {
      for (const log of logs) {
        res.write(`${log.id},${log.event_id},${log.rate},${log.reason},${log.changed_at?.toISOString() ?? ''}\n`);
      }
      skip += take;
      logs = await this.prisma.admissionRateLog.findMany({
        where:   { event_id: eventId },
        orderBy: { changed_at: 'asc' },
        skip,
        take,
      });
    }
    res.end();
  }
}
