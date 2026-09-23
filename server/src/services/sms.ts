import { config } from '../config';

/*
 * SMS abstraction. "console" prints messages to the log for development.
 * For production connect an Israeli SMS gateway (019, InforU, Twilio...) here.
 */
export async function sendSms(phone: string, message: string): Promise<void> {
  switch (config.smsProvider) {
    case 'console':
      console.log(`[sms] -> ${phone}: ${message}`);
      return;
    default:
      throw new Error(`SMS provider "${config.smsProvider}" is not implemented yet`);
  }
}
