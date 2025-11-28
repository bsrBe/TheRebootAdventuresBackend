import { Request, Response } from 'express';
import { TelegramService } from '../services/telegram.service';
import { Registration } from '../models/user.model';

export class TelegramController {
  private telegramService: TelegramService;

  constructor() {
    this.telegramService = new TelegramService();
  }

  /**
   * Handle Telegram webhook updates
   */
  public handleWebhook = async (req: Request, res: Response) => {
    try {
      const { message, callback_query } = req.body;
      const update = message || callback_query;
      
      if (!update) {
        return res.status(400).json({ success: false, message: 'Invalid update' });
      }

      const chatId = update.chat?.id || update.message?.chat?.id;
      const text = update.text || update.data;
      const userId = update.from?.id;

      if (!chatId) {
        return res.status(400).json({ success: false, message: 'No chat ID provided' });
      }

      // Handle commands
      if (text && text.startsWith('/')) {
        await this.handleCommand(chatId, text, userId);
      }
      
      // Handle callbacks
      if (update.data) {
        await this.handleCallback(chatId, update.data, userId);
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error handling Telegram webhook:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };

  /**
   * Handle bot commands
   */
  private handleCommand = async (chatId: string | number, command: string, userId?: number) => {
    const [cmd, ...args] = command.split(' ');

    switch (cmd.toLowerCase()) {
      case '/start':
        await this.handleStart(chatId, userId);
        break;
      case '/myinvoices':
        await this.handleMyInvoices(chatId, userId);
        break;
      case '/help':
        await this.sendHelpMessage(chatId);
        break;
      default:
        await this.telegramService.sendMessage(chatId, '❌ Unknown command. Type /help for available commands.');
    }
  };

  /**
   * Handle callback queries
   */
  private handleCallback = async (chatId: string | number, data: string, userId?: number) => {
    const [action, ...params] = data.split('_');
    
    switch (action) {
      case 'PAY':
        const invoiceId = params[0];
        await this.handlePayInvoice(chatId, invoiceId, userId);
        break;
      case 'myinvoices':
        await this.handleMyInvoices(chatId, userId);
        break;
      // Add more callback handlers as needed
    }
  };

  /**
   * Handle /start command
   */
  private handleStart = async (chatId: string | number, userId?: number) => {
    if (!userId) {
      return this.telegramService.sendMessage(chatId, 'Welcome! Please use our web interface to register first.');
    }

    // Update user's telegram data if they exist
    await Registration.findOneAndUpdate(
      { 'telegramData.id': userId },
      {
        $set: {
          'telegramData.chatId': chatId,
          'telegramData.last_activity': new Date(),
          'telegramData.is_subscribed': true
        }
      },
      { new: true }
    );

    // Send welcome photo with Web App button
    const welcomeCaption = 
      '🐴 <b>Welcome to Reboot Adventures!</b>\n\n' +
      'Experience the thrill of horseback riding through Ethiopia\'s stunning landscapes.\n\n' +
      '📅 Upcoming events and adventures\n' +
      '💰 Easy online payment\n' +
      '📱 Manage your bookings\n\n' +
      'Tap the button below to get started!';

    const photoUrl = `${process.env.APP_URL}/images/welcome.jpg`;
    
    try {
      const sent = await this.telegramService.sendPhoto(
        chatId,
        photoUrl,
        welcomeCaption,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🌐 Open Web App',
                  web_app: { url: process.env.FRONTEND_URL || 'https://your-frontend-url.com' }
                }
              ],
              [
                {
                  text: '📋 My Invoices',
                  callback_data: 'myinvoices'
                }
              ]
            ]
          }
        }
      );

      if (!sent) {
        throw new Error('Failed to send photo');
      }
    } catch (error) {
      console.error('Failed to send welcome photo, falling back to text message:', error);
      // Fallback to text message
      await this.telegramService.sendMessage(
        chatId,
        welcomeCaption,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🌐 Open Web App',
                  web_app: { url: process.env.FRONTEND_URL || 'https://your-frontend-url.com' }
                }
              ],
              [
                {
                  text: '📋 My Invoices',
                  callback_data: 'myinvoices'
                }
              ]
            ]
          }
        }
      );
    }
  };

  /**
   * Handle /myinvoices command
   */
  private handleMyInvoices = async (chatId: string | number, userId?: number) => {
    if (!userId) {
      return this.telegramService.sendMessage(chatId, '❌ Please use our web interface to register first.');
    }

    const user = await Registration.findOne({ 'telegramData.id': userId });
    if (!user) {
      return this.telegramService.sendMessage(chatId, '❌ User not found. Please register first.');
    }

    // Import Invoice model
    const { Invoice } = await import('../models/invoice.model');
    
    const invoices = await Invoice.find({ user: user._id }).sort({ createdAt: -1 });
    
    if (invoices.length === 0) {
      return this.telegramService.sendMessage(chatId, 'You have no invoices yet.');
    }

    // Send each invoice as a separate message
    for (const invoice of invoices) {
      await this.sendInvoiceMessage(chatId, invoice);
    }
  };

  /**
   * Handle invoice payment
   */
  private handlePayInvoice = async (chatId: string | number, invoiceId: string, userId?: number) => {
    if (!userId) {
      return this.telegramService.sendMessage(chatId, '❌ Please use our web interface to register first.');
    }

    const user = await Registration.findOne({ 'telegramData.id': userId });
    if (!user) {
      return this.telegramService.sendMessage(chatId, '❌ User not found.');
    }

    // Import Invoice model
    const { Invoice } = await import('../models/invoice.model');
    
    const invoice = await Invoice.findOne({ 
      invoiceId: invoiceId,
      user: user._id
    });

    if (!invoice) {
      return this.telegramService.sendMessage(chatId, '❌ Invoice not found.');
    }

    if (invoice.status === 'paid') {
      return this.telegramService.sendMessage(chatId, '✅ This invoice has already been paid.');
    }

    const eventName = invoice.metadata?.eventName || 'Event';

    // Send the payment link
    await this.telegramService.sendMessage(
      chatId,
      `💳 Please complete your payment for ${eventName} by clicking the button below.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Pay Now',
                url: invoice.chapaLink
              }
            ]
          ]
        }
      }
    );
  };

  /**
   * Send help message
   */
  private sendHelpMessage = async (chatId: string | number) => {
    const helpText = `
🤖 *Bot Commands* \n\n` +
      '*/start* - Start the bot and register your account\n' +
      '*/myinvoices* - View your invoices\n' +
      '*/help* - Show this help message\n\n' +
      'For any questions, please contact our support team.';

    await this.telegramService.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
  };

  /**
   * Send an invoice message
   */
  private sendInvoiceMessage = async (chatId: string | number, invoice: any) => {
    const statusEmoji = invoice.status === 'paid' ? '✅' : '⏳';
    const statusText = invoice.status === 'paid' 
      ? `Paid on ${new Date(invoice.paidAt!).toLocaleDateString()}` 
      : 'Pending payment';

    const eventName = invoice.metadata?.eventName || 'Event';
    const place = invoice.metadata?.place || 'Unknown Location';
    const time = invoice.metadata?.time ? new Date(invoice.metadata.time).toLocaleString() : 'Unknown Time';

    const message = `
📋 *Invoice #${invoice.invoiceId}* ${statusEmoji}\n\n` +
      `🔹 *Event:* ${eventName}\n` +
      `💵 *Amount:* ${invoice.amount} ETB\n` +
      `📍 *Location:* ${place}\n` +
      `📅 *Date & Time:* ${time}\n` +
      `📌 *Status:* ${statusText}\n\n`;

    const options: any = {
      parse_mode: 'Markdown',
    };

    if (invoice.status !== 'paid') {
      options.reply_markup = {
        inline_keyboard: [
          [
            {
              text: '💳 Pay Now',
              callback_data: `PAY_${invoice.invoiceId}`
            }
          ]
        ]
      };
    }

    await this.telegramService.sendMessage(chatId, message, options);
  };
}

export const telegramController = new TelegramController();
