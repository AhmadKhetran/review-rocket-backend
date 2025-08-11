import { Controller } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { AppService } from './app.service';
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Cron('*/10 * * * * *') // every 3 seconds
  async embedJobs() {
    return this.appService.checkScheduledAppointments();
  }


  @Cron('*/20 * * * * *') // every 3 seconds
  async followUpEmails() {
    return this.appService.checkFollowUpEmails();
  }
}
