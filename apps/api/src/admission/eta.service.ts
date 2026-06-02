import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EtaService {
  constructor(private redis: RedisService, private prisma: PrismaService) {}

  async computeETA(eventId: string, sessionId: string) {
    const rank = await this.redis.client.zrank(`event:${eventId}:queue`, sessionId);
    if (rank === null) return null;

    const position = rank + 1;
    const rateStr = await this.redis.client.get(`event:${eventId}:rate`);
    let rate = parseInt(rateStr || '', 10);
    
    if (isNaN(rate)) {
      const event = await this.prisma.event.findUnique({ where: { id: eventId } });
      rate = event?.admission_rate_per_min || 60;
      await this.redis.client.setex(`event:${eventId}:rate`, 60, rate);
    }

    const etaSeconds = Math.ceil((position / rate) * 60);
    
    // Cache the ETA calculation for this session specifically
    await this.redis.client.setex(`event:${eventId}:eta:${sessionId}`, 5, etaSeconds);

    return etaSeconds;
  }
}
