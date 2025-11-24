import axios from 'axios';
import { IInvoice, IRegistration } from '../interfaces/user.interface';
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
   * Send an invoice to a user
   */
  async sendInvoice(chatId: string | number, invoice: IInvoice): Promise<boolean> {
    try {
      const { amount, eventName, chapaLink } = invoice;
      
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
💰 <b>Invoice for {eventName}</b>

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
      const user = await Registration.findOne({ 'invoices.invoiceId': invoiceId });
      if (!user || !user.telegramData?.chatId) return false;

      const invoice = user.invoices.find(inv => inv.invoiceId === invoiceId);
      if (!invoice || invoice.status === 'paid') return false;

      const message = `
⏰ <b>Payment Reminder</b>\n\n` +
        `Your invoice for ${invoice.eventName} is still pending.\n` +
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
  async sendPaymentConfirmation(invoice: IInvoice, userId: string): Promise<boolean> {
    try {
      const user = await Registration.findById(userId);
      if (!user || !user.telegramData?.chatId) return false;

      const message = `
✅ <b>Payment Confirmed!</b>\n\n` +
        `Thank you for your payment for ${invoice.eventName}.\n` +
        `Amount: ${invoice.amount} ETB\n` +
        `Transaction ID: ${invoice.chapaReference}\n\n` +
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
      // Find all users who have paid for this event
      const users = await Registration.find({
        'invoices.eventId': eventId,
        'invoices.status': 'paid'
      });

      const userIds = users
        .filter(user => user.telegramData?.chatId)
        .map(user => user.telegramData!.chatId!);

      return this.broadcastMessage(userIds, message);
    } catch (error) {
      console.error('Error sending event reminder:', error);
      return { success: 0, failed: 0 };
    }
  }
}
