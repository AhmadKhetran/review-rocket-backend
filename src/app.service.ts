import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import sgMail from '@sendgrid/mail';
import timezone from 'dayjs/plugin/timezone';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class AppService {
  private supabase: SupabaseClient;
  private readonly logger = new Logger(AppService.name);
  private twilioClient: Twilio;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SB');
    const supabaseKey = this.configService.get<string>('SBB');
    this.twilioClient = new Twilio(
      this.configService.get('TWILIO_ACCOUNT_SID'),
      this.configService.get('TWILIO_AUTH_TOKEN'),
    );
    const sendgrid = this.configService.get<string>('SEND_G');

    this.supabase = createClient(supabaseUrl, supabaseKey);

    sgMail.setApiKey(sendgrid);
  }
  async checkScheduledAppointments() {
    this.logger.log('Checking appointments for initial sms...');

    const now = dayjs().tz('Europe/Brussels');

    const { data: appointments, error } = await this.supabase
      .from('Appointment')
      .select(
        `
        *,
        merchant:Merchant (
          email,
          merchantName
        )
        `,
      )
      .is('smsSendAt', null);

    if (error) {
      this.logger.error(`SupaBase error: ${error.message}`);
      return;
    }

    for (const appt of appointments) {
      console.log("now--------------> ", now)
      console.log("db -----------> ",appt.appointmentDate)
      const appointmentDateTime = dayjs(appt.appointmentDate)

      console.log("appointment date and time ", appointmentDateTime)
      const sendTime = appointmentDateTime.add(2, 'hours');

      console.log("send-----------------------> time",sendTime)

      if (now.isAfter(sendTime)) {
        await this.sendSMS(appt, 'initial');
        await this.supabase
          .from('Appointment')
          .update({ smsSendAt: now.toISOString() })
          .eq('id', appt.id);
      } else {
        this.logTimeRemaining('initial', appt.id, sendTime, now);
      }
    }
  }

  async checkFollowUpEmails() {
    this.logger.log('Checking appointments for follow-up sms...');
    const now = dayjs().tz('Europe/Brussels');
    const { data: followUps, error } = await this.supabase
      .from('Appointment')
      .select(
        `
        *,
        merchant:Merchant (
          email,
          merchantName
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

    for (const appt of followUps) {
      const followUpTime = dayjs(appt.appointmentDate);

      const sendtime = followUpTime.add(24, 'hours');

      if (now.isAfter(sendtime)) {
        console.log("EMAIL SENT ------------------------->  >> > > > > > > >")
        await this.sendSMS(appt, 'follow-up');
        await this.supabase
          .from('Appointment')
          .update({ followUpSent: now.toISOString() })
          .eq('id', appt.id);
      } else {
        this.logTimeRemaining('follow-up', appt.id, sendtime, now);
      }
    }
  }

  private logTimeRemaining(
    type: string,
    id: string,
    targetTime: dayjs.Dayjs,
    now: dayjs.Dayjs,
  ) {
    console.log(targetTime)
    const diffMs = targetTime.diff(now);
    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);

    this.logger.log(
      `⏳ ${type} sms for appointment ${id} will be sent in ${minutes} min ${seconds} sec.`,
    );
  }

  async sendSMS(appt: any, type: 'initial' | 'follow-up') {
    console.log('appt', appt);
    console.log('R', this.configService.get<string>('TWILIO_PHONE_NUMBER'));
    this.logger.log(
      `📧 Sending ${type} email for appointment ${appt.id} to ${appt.phoneNumber}...`,
    );

    try {
      let body;
      if (type === 'initial') {
        body = `Hi ${appt.customerName},
Thanks for visiting ${appt.merchant.merchantName} today!
We’d love your quick feedback, it only takes a tap:
https://reviewrockets.co.uk/review?id=${appt.id}`;
      } else {
        body = `Hi ${appt.customerName},
Just a gentle nudge from ${appt.merchant.merchantName},
if you’ve got a second, we’d really value your feedback:
https://reviewrockets.co.uk/review?id=${appt.id}
Thank you.`;
      }
      return this.twilioClient.messages.create({
        body,
        from: this.configService.get<string>('TWILIO_PHONE_NUMBER'),
        to: appt.phoneNumber,
      });
    } catch (err) {
      console.error(err);
      this.logger.error(
        `❌ Failed to send ${type} sms for ${appt.id}: ${
          err.response?.body || err.message
        }`,
      );
    }
  }

  //  -----------------------------------------

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
}
