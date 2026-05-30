import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import { requireEnv } from '../env';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client: Redis;
  public admitLuaSha: string;

  async onModuleInit() {
    this.client = new Redis(requireEnv('REDIS_URL'));
    
    try {
      const luaPath = path.join(process.cwd(), 'src', 'admission', 'lua', 'admit.lua');
      const luaScript = fs.readFileSync(luaPath, 'utf8');
      this.admitLuaSha = await this.client.script('LOAD', luaScript) as string;
      this.logger.log(`Loaded admit.lua with SHA: ${this.admitLuaSha}`);
    } catch (e) {
      this.logger.error('Failed to load admit.lua', e);
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
