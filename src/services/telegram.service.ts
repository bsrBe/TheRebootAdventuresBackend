import axios from 'axios';
import { IRegistration } from '../interfaces/user.interface';
import { Registration } from '../models/user.model';
import { configDotenv } from 'dotenv';
import FormData from 'form-data';

configDotenv()

export class TelegramService {
  private readonly botToken: string;
  private readonly botApiUrl: string;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment variables');
    }
    this.botToken = token;
    this.botApiUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Send a message to a specific user
   */
  async sendMessage(chatId: string | number, text: string, options: any = {}): Promise<boolean> {
    try {
      await axios.post(`${this.botApiUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...options
      });
      return true;
    } catch (error: any) {
      console.error('Error sending Telegram message:', error.message);
      if (error.response) {
        console.error('Telegram API Error Response:', error.response.data);
      }
      return false;
    }
  }

  /**
   * Send a photo to a specific user
   */
  async sendPhoto(
    chatId: string | number, 
    photo: string | Buffer, 
    caption: string, 
    options: any = {}
  ): Promise<boolean> {
    try {
      if (Buffer.isBuffer(photo)) {
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('photo', photo, 'qr.png');
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');
        
        // Add extra options
        Object.keys(options).forEach(key => {
            if (typeof options[key] === 'object') {
                form.append(key, JSON.stringify(options[key]));
            } else {
                form.append(key, options[key]);
            }
        });

        await axios.post(`${this.botApiUrl}/sendPhoto`, form, {
          headers: form.getHeaders()
        });
      } else {
        await axios.post(`${this.botApiUrl}/sendPhoto`, {
          chat_id: chatId,
          photo: photo,
          caption,
          parse_mode: 'HTML',
          ...options
        });
      }
      return true;
    } catch (error: any) {
      console.error('Error sending Telegram photo:', error.message);
      if (error.response) {
        console.error('Telegram API Error Response:', error.response.data);
      }
      return false;
    }
  }

  /**
   * Send payment method selection keyboard
   */
  async sendPaymentMethodSelection(
    chatId: string | number, 
    amount: number, 
    eventName: string,
    invoiceId: string
  ): Promise<boolean> {
    try {
      const message = `
💰 <b>Payment for ${eventName}</b>

Amount: <b>${amount} ETB</b>

Please select your preferred payment method:
`;

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: 'Telebirr', callback_data: `PMETHOD_telebirr_${invoiceId}` },
            { text: 'CBE', callback_data: `PMETHOD_cbe_${invoiceId}` },
            { text: 'BOA', callback_data: `PMETHOD_boa_${invoiceId}` }
          ]
        ]
      };

      return this.sendMessage(chatId, message, { reply_markup: replyMarkup });
    } catch (error) {
      console.error('Error sending payment method selection:', error);
      return false;
    }
  }

  /**
   * Send specific payment instructions based on method
   */
  async sendSpecificPaymentInstruction(
    chatId: string | number,
    method: string,
    amount: number,
    eventName: string
  ): Promise<boolean> {
      let phoneOrAccount = '';
      let bankName = '';
      
      const methodKey = method.toLowerCase();
      
      if (methodKey === 'telebirr') {
          phoneOrAccount = process.env.TELEBIRR_PHONE_NUMBER || 'Unknown';
          bankName = 'Telebirr';
      } else if (methodKey === 'cbe') {
          phoneOrAccount = process.env.CBE_ACCOUNT_NUMBER || 'Unknown';
          bankName = 'CBE Account';
      } else if (methodKey === 'boa') {
          phoneOrAccount = process.env.BOA_ACCOUNT_NUMBER || 'Unknown';
          bankName = 'BOA Account';
      }

      const message = `
🏦 <b>${bankName} Payment Instructions</b>

Please transfer <b>${amount} ETB</b> to:
<b>${phoneOrAccount}</b>

⚠️ <b>IMPORTANT:</b>
After paying, please reply to this message with your <b>Transaction ID</b>.
<i>Verification method: ${bankName}</i>
`;

      return this.sendMessage(chatId, message, {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: `Enter ${bankName} Transaction ID...`
        }
      });
  }

  /**
   * Send verification success with QR Code
   */
  async sendVerificationSuccess(
    chatId: string | number, 
    invoice: any, 
    qrBuffer: Buffer
  ): Promise<boolean> {
    try {
      const eventName = invoice.metadata?.eventName || 'Event';
      const caption = `
✅ <b>Payment Verified!</b>

You are confirmed for <b>${eventName}</b>.
Here is your ticket QR code. Please show this at the entrance.

See you there! 🚀
`;
      
      return this.sendPhoto(chatId, qrBuffer, caption);
    } catch (error) {
      console.error('Error sending verification success:', error);
      return false;
    }
  }

  /**
   * Send bulk messages to multiple users
   */
  async broadcastMessage(
    userIds: (string | number)[],
    message: string,
    options: any = {}
  ): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(
      userIds.map(userId => this.sendMessage(userId, message, options))
    );

    return {
      success: results.filter(r => r.status === 'fulfilled' && r.value).length,
      failed: results.filter(r => r.status === 'rejected' || !r.value).length
    };
  }

  /**
   * Send payment reminder for an invoice
   */
  async sendPaymentReminder(invoiceId: string): Promise<boolean> {
    try {
      // Import Invoice model
      const { Invoice } = await import('../models/invoice.model');
      
      const invoice = await Invoice.findOne({ invoiceId }).populate('user');
      
      if (!invoice) return false;
      if (invoice.status === 'paid') return false;

      const user = invoice.user as any;
      if (!user || !user.telegramData?.chatId) return false;

      const eventName = invoice.metadata?.eventName || 'Event';
      // Re-send selection flow
      return this.sendPaymentMethodSelection(
          user.telegramData.chatId, 
          invoice.amount, 
          eventName,
          invoiceId
      );
    } catch (error) {
      console.error('Error sending payment reminder:', error);
      return false;
    }
  }

  /**
   * Send event reminder
   */
  async sendEventReminder(eventId: string, message: string): Promise<{ success: number; failed: number }> {
    try {
      // Import Invoice model
      const { Invoice } = await import('../models/invoice.model');
      
      // Find all paid invoices for this event (if we had eventId in invoice, which we added to model)
      // Or find via EventRegistration
      const { EventRegistration } = await import('../models/event-registration.model');
      
      const registrations = await EventRegistration.find({
        event: eventId,
        status: 'confirmed' // or 'paid'
      }).populate('user');

      const userIds = registrations
        .map(reg => (reg.user as any).telegramData?.chatId)
        .filter(chatId => chatId);

      return this.broadcastMessage(userIds, message);
    } catch (error) {
      console.error('Error sending event reminder:', error);
      return { success: 0, failed: 0 };
    }
  }
}
