import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('OPS_ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('events')
  listAllEvents() {
    return this.adminService.listAllEvents();
  }

  @Get('events/:id/rate-log')
  getRateLog(@Param('id') eventId: string) {
    return this.adminService.getRateLog(eventId);
  }

  @Get('kafka-health')
  getKafkaHealth() {
    return this.adminService.getKafkaHealth();
  }

  @Post('kafka-restart')
  restartKafkaConsumer() {
    return this.adminService.restartKafkaConsumer();
  }
}
