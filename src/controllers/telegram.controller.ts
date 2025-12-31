import { Request, Response } from 'express';
import { TelegramService } from '../services/telegram.service';
import { Registration } from '../models/user.model';
import { paymentService } from '../services/payment.service';

export class TelegramController {
  private telegramService: TelegramService;

  constructor() {
    this.telegramService = new TelegramService();
  }

  /**
   * Broadcast a custom announcement to all subscribed Telegram users
   * Admin-only route (protected at router level)
   */
  public broadcastAnnouncement = async (req: Request, res: Response) => {
    try {
      const { title, message, location, time } = req.body as {
        title?: string;
        message?: string;
        location?: string;
        time?: string;
      };

      if (!title && !message && !location && !time) {
        return res.status(400).json({ success: false, message: 'At least one field (title, message, location, time) is required' });
      }

      // Load all users who have interacted with the bot and stayed subscribed
      const users = await Registration.find({
        $or: [
          { 'telegramData.chatId': { $ne: null } },
          { 'telegramData.id': { $ne: null } }
        ],
        'telegramData.is_subscribed': true,
      });

      const chatIds = users
        .map((u) => {
          const tData = (u as any).telegramData;
          return tData?.chatId || tData?.id;
        })
        .filter((id) => id !== null && id !== undefined);

      if (chatIds.length === 0) {
        return res.status(200).json({ success: true, message: 'No subscribed Telegram users to notify', data: { success: 0, failed: 0 } });
      }

      const parts: string[] = [];
      if (title) {
        parts.push(`📢 <b>${title}</b>`);
      }
      if (message) {
        parts.push('', message);
      }
      if (location) {
        parts.push('', `📍 <b>Location:</b> ${location}`);
      }
      if (time) {
        const formatted = new Date(time).toLocaleString();
        parts.push('', `🕒 <b>Time:</b> ${formatted}`);
      }

      parts.push('', 'Tap the button below to open the web app.');

      const text = parts.join('\n');

      const frontendUrl = process.env.FRONTEND_URL ;
      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '🌐 Open Web App',
              web_app: { url: frontendUrl },
            },
          ],
        ],
      };

      const result = await this.telegramService.broadcastMessage(chatIds, text, { reply_markup: replyMarkup });

      return res.status(200).json({ success: true, message: 'Broadcast sent', data: result });
    } catch (error) {
      console.error('Error sending broadcast announcement:', error);
      return res.status(500).json({ success: false, message: 'Failed to send broadcast' });
    }
  };

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

      // Handle Reply to Message (Transaction ID submission)
      if (message && message.reply_to_message && message.text) {
          let method = 'telebirr';
          const replyText = message.reply_to_message.text || '';
          
          if (replyText.includes('Verification method: CBE')) method = 'cbe';
          else if (replyText.includes('Verification method: BOA')) method = 'boa';
          else if (replyText.includes('Verification method: Telebirr')) method = 'telebirr';

          // Process asynchronously to prevent webhook timeout
          this.handleTransactionSubmission(chatId, message.text, userId, method).catch(err => 
            console.error('Error in async transaction submission:', err)
          );
          return res.status(200).json({ success: true });
      }

      // Handle standalone Transaction ID (10 chars, alphanumeric, starts with letter)
      // This is a heuristic to improve UX so users don't HAVE to reply
      if (text && !text.startsWith('/') && /^[A-Z0-9]{10}$/i.test(text.trim())) {
          // For standalone, we might not know the method, fallback to telebirr or try to guess
          // For now, let's keep it telebirr for standalone to avoid complexity, 
          // or assume most recent method selection if we had state.
          this.handleTransactionSubmission(chatId, text, userId, 'telebirr').catch(err => 
            console.error('Error in async transaction submission:', err)
          );
          return res.status(200).json({ success: true });
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
   * Handle Transaction ID Submission
   */
  private handleTransactionSubmission = async (chatId: string | number, transactionId: string, userId?: number, method: string = 'telebirr') => {
      // Basic validation of transaction ID format (e.g., alphanumeric, length)
      const cleanId = transactionId.trim().toUpperCase();
      
      if (cleanId.length < 8) {
          return this.telegramService.sendMessage(chatId, '❌ Invalid Transaction ID format. Please check and try again.');
      }

      await this.telegramService.sendMessage(chatId, `🔄 Verifying ${method.toUpperCase()} transaction... Please wait.`);

      // Find user by Telegram ID
      const user = await Registration.findOne({ 'telegramData.id': userId });
      if (!user) {
          return this.telegramService.sendMessage(chatId, '❌ User not found. Please register first.');
      }

      // Call PaymentService to verify
      const result = await paymentService.verifyPayment(cleanId, user._id.toString(), method);

      if (!result.success) {
          return this.telegramService.sendMessage(chatId, `❌ Verification Failed: ${result.message}`);
      }
      
      // Success message is handled inside verifyPayment (sends QR code)
      // But we can send a small confirmation text here if needed, or rely on the service.
      // Service sends "Payment Verified" with QR.
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
        const invId = params[0];
        await this.handlePayInvoice(chatId, invId, userId);
        break;
      case 'PMETHOD':
        const method = params[0];
        const invoiceId = params[1];
        await this.handleMethodSelection(chatId, method, invoiceId, userId);
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

    // Send the payment method selection
    await this.telegramService.sendPaymentMethodSelection(
        chatId,
        invoice.amount,
        eventName,
        invoiceId
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

  /**
   * Handle payment method selection
   */
  private handleMethodSelection = async (chatId: string | number, method: string, invoiceId: string, userId?: number) => {
    try {
      // Import Invoice model
      const { Invoice } = await import('../models/invoice.model');
      
      const invoice = await Invoice.findOne({ invoiceId });
      
      if (!invoice) {
        return this.telegramService.sendMessage(chatId, '❌ Invoice not found.');
      }

      const eventName = invoice.metadata?.eventName || 'Event';
      
      await this.telegramService.sendSpecificPaymentInstruction(
        chatId,
        method,
        invoice.amount,
        eventName
      );
    } catch (error) {
      console.error('Error in handleMethodSelection:', error);
      await this.telegramService.sendMessage(chatId, '❌ Failed to process payment method selection.');
    }
  };
}

export const telegramController = new TelegramController();
