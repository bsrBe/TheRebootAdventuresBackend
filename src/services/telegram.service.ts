import axios from 'axios';
import { IRegistration } from '../interfaces/user.interface';
import { Registration } from '../models/user.model';
import { configDotenv } from 'dotenv';
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
    photoUrl: string, 
    caption: string, 
    options: any = {}
  ): Promise<boolean> {
    try {
      await axios.post(`${this.botApiUrl}/sendPhoto`, {
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: 'HTML',
        ...options
      });
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
   * Send an invoice to a user
   */
  async sendInvoice(chatId: string | number, invoice: any): Promise<boolean> {
    try {
      const { amount, chapaLink, metadata } = invoice;
      const eventName = metadata?.eventName || 'Event';
      
      // Create a payment button
      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '💳 Pay Now',
              url: chapaLink
            }
          ]
        ]
      };

      const message = `
💰 <b>Invoice for ${eventName}</b>

` +
        `Amount: ${amount} ETB\n` +
        `Status: Pending\n\n` +
        `Click the button below to complete your payment.`;

      return this.sendMessage(chatId, message, { reply_markup: replyMarkup });
    } catch (error) {
      console.error('Error sending invoice:', error);
      return false;
    }
  }

  /**
   * Send bulk messages to multiple users
   */
  async broadcastMessage(userIds: (string | number)[], message: string): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(
      userIds.map(userId => this.sendMessage(userId, message))
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

      const message = `
⏰ <b>Payment Reminder</b>\n\n` +
        `Your invoice for ${eventName} is still pending.\n` +
        `Amount: ${invoice.amount} ETB\n` +
        `Due: ${invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : 'N/A'}\n\n` +
        `Please complete your payment to secure your spot!`;

      return this.sendInvoice(user.telegramData.chatId, invoice);
    } catch (error) {
      console.error('Error sending payment reminder:', error);
      return false;
    }
  }

  /**
   * Send payment confirmation
   */
  async sendPaymentConfirmation(invoice: any, userId: string): Promise<boolean> {
    try {
      const user = await Registration.findById(userId);
      if (!user || !user.telegramData?.chatId) return false;

      const eventName = invoice.metadata?.eventName || 'Event';

      const message = `
✅ <b>Payment Confirmed!</b>\n\n` +
        `Thank you for your payment for ${eventName}.\n` +
        `Amount: ${invoice.amount} ETB\n` +
        `Transaction ID: ${invoice.chapaReference || invoice.tx_ref}\n\n` +
        `We look forward to seeing you at the event!`;

      return this.sendMessage(user.telegramData.chatId, message);
    } catch (error) {
      console.error('Error sending payment confirmation:', error);
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
