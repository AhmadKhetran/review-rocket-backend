import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import sgMail from '@sendgrid/mail';
import timezone from 'dayjs/plugin/timezone';
import { ConfigService } from '@nestjs/config';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class AppService {
  private supabase: SupabaseClient;
  private readonly logger = new Logger(AppService.name);

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SB');
    const supabaseKey = this.configService.get<string>('SBB');
    const sendgrid = this.configService.get<string>('SEND_G');


    this.supabase = createClient(supabaseUrl, supabaseKey);

    sgMail.setApiKey(sendgrid);
  }

  /**
   * Sends first email 5 min after appointment
   */

  ConfigService;
  async checkScheduledAppointments() {
    this.logger.log('Checking appointments for initial emails...');

    const now = dayjs().tz('Asia/Karachi');

    const { data: appointments, error } = await this.supabase
      .from('Appointment')
      .select(
        `
        *,
        merchant:Merchant (
          email
        )
        `,
      )
      .is('smsSendAt', null);

    if (error) {
      this.logger.error(`Supabase error: ${error.message}`);
      return;
    }

    for (const appt of appointments) {
      const appointmentDateTime = dayjs(appt.appointmentDate).tz(
        'Asia/Karachi',
      );
      const sendTime = appointmentDateTime.add(2, 'hours');

      if (now.isAfter(sendTime)) {
        await this.sendEmail(appt, 'initial');
        await this.supabase
          .from('Appointment')
          .update({ smsSendAt: now.toISOString() })
          .eq('id', appt.id);
      } else {
        this.logTimeRemaining('initial', appt.id, sendTime, now);
      }
    }
  }

  /**
   * Sends follow-up email 10 min after first email if not opened
   */
  async checkFollowUpEmails() {
    this.logger.log('Checking appointments for follow-up emails...');

    const now = dayjs().tz('Asia/Karachi');

    const { data: followUps, error } = await this.supabase
      .from('Appointment')
      .select(
        `
        *,
        merchant:Merchant (
          email
        )
        `,
      )
      .not('smsSendAt', 'is', null) // first email sent
      .is('smsOpenedAt', null) // not opened
      .is('followUpSent', null); // follow-up not sent yet

    if (error) {
      this.logger.error(`Supabase error: ${error.message}`);
      return;
    }

    console.log(followUps);

    for (const appt of followUps) {
      const followUpTime = dayjs(appt.appointmentDate).tz('Asia/Karachi');

      const sendtime = followUpTime.add(24, 'hours');

      console.log(appt.smsSendAt);
      console.log('follow up time', followUpTime);
      console.log(now);

      if (now.isAfter(sendtime)) {
        await this.sendEmail(appt, 'follow-up');
        await this.supabase
          .from('Appointment')
          .update({ followUpSent: now.toISOString() })
          .eq('id', appt.id);
      } else {
        this.logTimeRemaining('follow-up', appt.id, sendtime, now);
      }
    }
  }

  private async sendEmail(appt: any, type: 'initial' | 'follow-up') {
    const fe_url = this.configService.get<string>('FE_URL');
    this.logger.log(
      `📧 Sending ${type} email for appointment ${appt.id} to ${appt.merchant.email}...`,
    );

    try {
      const msg = {
        to: appt.merchant.email,
        from: 'ahmadnaeem@tensorlabs.io',
        templateId: 'd-d36ac4e1f9d6437b81627e727f75355d',
        dynamicTemplateData: {
          reviewUrl: `${fe_url}/review?appointmentId=${appt.id}`,
          name: appt.customerName,
        },
      };

      const response = await sgMail.send(msg);
      this.logger.log(`✅ ${type} email sent: ${response[0].statusCode}`);
    } catch (err) {
      console.error(err);
      this.logger.error(
        `❌ Failed to send ${type} email for ${appt.id}: ${
          err.response?.body || err.message
        }`,
      );
    }
  }

  private logTimeRemaining(
    type: string,
    id: string,
    targetTime: dayjs.Dayjs,
    now: dayjs.Dayjs,
  ) {
    const diffMs = targetTime.diff(now);
    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);

    this.logger.log(
      `⏳ ${type} email for appointment ${id} will be sent in ${minutes} min ${seconds} sec.`,
    );
  }
}
