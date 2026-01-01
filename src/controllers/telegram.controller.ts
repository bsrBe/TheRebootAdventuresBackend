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
      const update = req.body;
      console.log('--- Telegram Update Received ---');
      console.log(JSON.stringify(update, null, 2));

      // Separate message, callback_query, and photo
      const { message, callback_query } = update;
      const photo = message?.photo;

      // Extract basic info
      let chatId: string | number | undefined;
      let userId: number | undefined;
      let text: string | undefined;

      if (message) {
        chatId = message.chat?.id;
        userId = message.from?.id;
        text = message.text;
      } else if (callback_query) {
        chatId = callback_query.message?.chat?.id;
        userId = callback_query.from?.id;
        text = callback_query.data;
        
        // Acknowledge the callback query immediately to stop the loading spinner
        console.log(`Acknowledging callback query ID: ${callback_query.id}`);
        await this.telegramService.answerCallbackQuery(callback_query.id).catch(err => 
          console.error('Failed to answer callback query:', err.message)
        );
      }

      if (!chatId) {
        console.log('No chat ID found in update, skipping.');
        return res.status(200).json({ success: true, message: 'No chat ID' });
      }

      console.log(`Processing update from chatId: ${chatId}, userId: ${userId}, text: ${text}`);

      // Handle Reply to Message (Transaction ID submission)
      if (message && message.reply_to_message && message.text) {
          let method = 'telebirr';
          const replyText = message.reply_to_message.text || '';
          const transactionId = message.text.trim();
          
          if (replyText.includes('Verification method: CBE')) method = 'cbe';
          else if (replyText.includes('Verification method: BOA')) method = 'boa';
          else if (replyText.includes('Verification method: Telebirr')) method = 'telebirr';

          // Extract event name from payment instruction message (format: "Payment for [EventName]")
          let eventName: string | undefined;
          const paymentForMatch = replyText.match(/Payment for (.+?)(\n|$)/i);
          if (paymentForMatch) {
            eventName = paymentForMatch[1].trim();
          }

          console.log(`Detected transaction submission via reply. Transaction ID: ${transactionId}, Method: ${method}, EventName: ${eventName}, UserId: ${userId}`);
          this.handleTransactionSubmission(chatId, transactionId, userId, method, eventName).catch(err => 
            console.error('Error in async transaction submission:', err)
          );
          return res.status(200).json({ success: true });
      }

      // Handle Photos (Memories)
      if (photo && photo.length > 0) {
          console.log('Detected photo upload. Potentially a memory.');
          const fileId = photo[photo.length - 1].file_id; // Get highest resolution
          const caption = message.caption || '';
          this.handlePhotoUpload(chatId, fileId, caption, userId).catch(err => 
            console.error('Error in async photo upload:', err)
          );
          return res.status(200).json({ success: true });
      }

      // Handle standalone Transaction ID (relaxed: 8-30 chars, alphanumeric + common symbols)
      if (text && !text.startsWith('/') && /^[A-Z0-9&]{8,30}$/i.test(text.trim())) {
          console.log(`Detected potential standalone transaction ID: ${text.trim()}, UserId: ${userId}`);
          this.handleTransactionSubmission(chatId, text.trim(), userId, 'telebirr').catch(err => 
            console.error('Error in async transaction submission:', err)
          );
          return res.status(200).json({ success: true });
      }

      // Handle commands
      if (text && text.startsWith('/')) {
        console.log(`Handling command: ${text}`);
        await this.handleCommand(chatId, text, userId);
      }
      
      // Handle callback queries
      if (callback_query && callback_query.data) {
        await this.handleCallback(chatId, callback_query.data, userId);
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error handling webhook:', error);
      return res.status(200).json({ success: false, message: 'Webhook processing failed' });
    }
  };

  /**
   * Handle transaction ID submission for payment verification
   */
  private handleTransactionSubmission = async (chatId: string | number, transactionId: string, userId?: number, method: string = 'telebirr', eventName?: string) => {
    try {
      if (!userId) {
        return this.telegramService.sendMessage(chatId, '❌ Please register first using our web interface.');
      }

      const user = await Registration.findOne({ 'telegramData.id': userId });
      if (!user) {
        return this.telegramService.sendMessage(chatId, '❌ User not found. Please register first.');
      }

      // 1. Send immediate feedback
      await this.telegramService.sendMessage(chatId, `🔄 <b>Verifying ${method.toUpperCase()} transaction...</b>\n\nPlease wait while we confirm your payment.`);

      // 2. Perform verification
      const result = await paymentService.verifyPayment(transactionId, user._id.toString(), method, eventName);
      
      // If invoice exists in result, the service already sent the QR code message
      if (result.success && result.invoice) {
        return;
      } else if (result.success) {
        await this.telegramService.sendMessage(
          chatId, 
          `✅ <b>Payment Verified!</b>\n\n${result.message}\n\nYour booking has been confirmed.`
        );
      } else {
        await this.telegramService.sendMessage(
          chatId, 
          `❌ <b>Verification Failed</b>\n\n${result.message}\n\nPlease check your transaction ID and try again.`
        );
      }
    } catch (error: any) {
      console.error('Error in handleTransactionSubmission:', error);
      await this.telegramService.sendMessage(chatId, '❌ An error occurred while verifying your payment. Please try again later.');
    }
  };

  /**
   * Handle photo uploads (memories)
   */
  private handlePhotoUpload = async (chatId: string | number, fileId: string, caption: string, userId?: number) => {
    try {
      if (!userId) {
        return this.telegramService.sendMessage(chatId, '❌ Please register first to upload memories.');
      }

      const user = await Registration.findOne({ 'telegramData.id': userId });
      if (!user) {
        return this.telegramService.sendMessage(chatId, '❌ User not found. Please register first.');
      }

      // 1. Find the most recent confirmed event the user attended
      const { EventRegistration } = await import('../models/event-registration.model');
      
      // Heuristic: Confirmed within the last 48 hours, or simply the most recent confirmed
      const recentAttendance = await EventRegistration.findOne({
        user: user._id,
        status: { $in: ['confirmed'] }
      }).populate('event').sort({ updatedAt: -1 });

      if (!recentAttendance) {
        return this.telegramService.sendMessage(
          chatId, 
          "📸 That's a great photo! Once you attend one of our adventures, you can share memories here to be featured on our website!"
        );
      }

      const event = recentAttendance.event as any;
      if (!event) return;

      // 2. Get file URL from Telegram
      const { axios } = await import('axios').then(m => ({ axios: m.default }));
      const fileResponse = await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
      const filePath = (fileResponse.data as any).result.file_path;
      const photoUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;

      // 3. Save as a Memory
      const { Memory } = await import('../models/memory.model');
      
      const memory = new Memory({
        user: user._id,
        event: event._id,
        photoUrl: photoUrl,
        caption: caption,
        telegramFileId: fileId,
        isApproved: false
      });

      await memory.save();

      // 4. Confirm to user
      await this.telegramService.sendMessage(
        chatId, 
        `🖼️ <b>Memory Captured!</b>\n\nI've sent your photo from <b>${event.name}</b> to our team for review. If approved, it will be featured in our trip gallery! ✨`
      );
    } catch (error: any) {
      console.error('Error in handlePhotoUpload:', error);
      await this.telegramService.sendMessage(chatId, '❌ An error occurred while processing your photo. Please try again later.');
    }
  };

  /**
   * Handle command routing
   */
  private handleCommand = async (chatId: string | number, text: string, userId?: number) => {
    const [command, ...args] = text.split(' ');
    
    switch (command) {
      case '/start':
        await this.handleStart(chatId, userId);
        break;
      case '/adventures':
        await this.handleAdventures(chatId);
        break;
      case '/mybookings':
        await this.handleMyBookings(chatId, userId);
        break;
      case '/profile':
        await this.handleProfile(chatId, userId);
        break;
      case '/gallery':
        await this.handleGallery(chatId);
        break;
      case '/support':
        await this.sendSupportMessage(chatId);
        break;
      case '/help':
        await this.sendHelpMessage(chatId);
        break;
      case '/myinvoices':
        await this.handleMyInvoices(chatId, userId);
        break;
      default:
        await this.telegramService.sendMessage(chatId, '❌ Unknown command. Type /help for available commands.');
    }
  };

  /**
   * Handle /adventures command
   */
  private handleAdventures = async (chatId: string | number) => {
    try {
      const { Event } = await import('../models/events.model');
      const events = await Event.find({ isActive: true }).sort({ date: 1 }).limit(5);

      if (events.length === 0) {
        return this.telegramService.sendMessage(chatId, '📭 No upcoming adventures at the moment. Stay tuned!');
      }

      const message = '🌟 <b>Upcoming Adventures</b>\n\n' + 
        events.map(e => `📍 <b>${e.name}</b>\n📅 ${new Date(e.date).toLocaleDateString()}\n💰 ${e.price} ETB\n`).join('\n') +
        '\nTap the button below to book your spot!';

      await this.telegramService.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌐 Browse & Book', web_app: { url: `${process.env.FRONTEND_URL}/events` } }]
          ]
        }
      });
    } catch (error) {
      console.error('Error in handleAdventures:', error);
    }
  };

  /**
   * Handle /mybookings command
   */
  private handleMyBookings = async (chatId: string | number, userId?: number) => {
    try {
      if (!userId) return;
      const user = await Registration.findOne({ 'telegramData.id': userId });
      if (!user) return this.telegramService.sendMessage(chatId, '❌ Please register first.');

      const { EventRegistration } = await import('../models/event-registration.model');
      const bookings = await EventRegistration.find({ user: user._id }).populate('event').sort({ createdAt: -1 });

      if (bookings.length === 0) {
        return this.telegramService.sendMessage(chatId, "📅 You haven't booked any adventures yet! Type /adventures to see what's coming up.");
      }

      const message = '📋 <b>Your Bookings</b>\n\n' + 
        bookings.map((b: any) => {
            const statusEmoji = b.status === 'confirmed' ? '✅' : '⏳';
            return `🏇 <b>${b.event?.name}</b>\nStatus: ${statusEmoji} ${b.status.toUpperCase()}`;
        }).join('\n\n');

      await this.telegramService.sendMessage(chatId, message);
    } catch (error) {
      console.error('Error in handleMyBookings:', error);
    }
  };

  /**
   * Handle /profile command
   */
  private handleProfile = async (chatId: string | number, userId?: number) => {
    try {
      if (!userId) return;
      const user = await Registration.findOne({ 'telegramData.id': userId });
      if (!user) return this.telegramService.sendMessage(chatId, '❌ Profile not found.');

      const message = `👤 <b>Your Profile</b>\n\n` +
        `Name: <b>${user.fullName}</b>\n` +
        `Phone: <b>${user.phoneNumber || 'N/A'}</b>\n` +
        `Experience: <b>${user.horseRidingExperience || 'Beginner'}</b>\n` +
        `Age: <b>${user.age || 'N/A'}</b>`;

      await this.telegramService.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [[{ text: '✏️ Edit Profile', web_app: { url: `${process.env.FRONTEND_URL}/profile` } }]]
        }
      });
    } catch (error) {
      console.error('Error in handleProfile:', error);
    }
  };

  /**
   * Handle /gallery command
   */
  private handleGallery = async (chatId: string | number) => {
    const message = '🖼️ <b>Reboot Adventures Gallery</b>\n\nRelive the best moments from our community trips! Check out our photo gallery below.';
    await this.telegramService.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [[{ text: '📸 Open Gallery', web_app: { url: `${process.env.FRONTEND_URL}/gallery` } }]]
      }
    });
  };

  /**
   * Send support message
   */
  private sendSupportMessage = async (chatId: string | number) => {
    const adminUsername = process.env['Admin_User-Name'] || '@BsreAbrham';
    const message = `🤝 <b>Need Help?</b>\n\nOur team is here to assist you with bookings, payments, or any questions.\n\n📱 <b>Support:</b> ${adminUsername}`;
    await this.telegramService.sendMessage(chatId, message);
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
    // Update user's telegram data if they exist, but don't block the welcome message
    if (userId) {
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
      ).catch(err => console.error('Error updating user on start:', err));
    }

    // Send welcome message with Web App button
    const welcomeMessage = 
      '🌟 <b>Welcome to Reboot Adventures!</b>\n\n' +
      'Join us for exciting horseback riding adventures and create unforgettable memories.\n\n' +
      'Use the button below to browse events, book your spot, and manage your profile.';
    
    const frontendUrl = process.env.FRONTEND_URL;
    await this.telegramService.sendMessage(chatId, welcomeMessage, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🌐 Open Web App',
              web_app: { url: frontendUrl }
            }
          ]
        ]
      }
    });
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
      '*/start* - Start the bot & register\n' +
      '*/adventures* - Browse upcoming trips\n' +
      '*/mybookings* - View your bookings\n' +
      '*/myinvoices* - View your invoices\n' +
      '*/gallery* - View trip photos\n' +
      '*/profile* - View & edit your profile\n' +
      '*/support* - Contact support\n' +
      '*/help* - Show this message\n\n' +
      'For additional help, contact our support team.';

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
