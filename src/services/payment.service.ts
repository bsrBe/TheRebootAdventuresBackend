import { IRegistration } from '../interfaces/user.interface';
import { Registration } from '../models/user.model';
import { TelegramService } from './telegram.service';
import { telebirrService } from './telebirr.service';
import { qrService } from './qr.service';

export class PaymentService {
  
  /**
   * Generate a unique invoice ID
   */
  private generateInvoiceId(prefix = 'INV'): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Initialize a payment (Manual Telebirr Flow)
   */
  async initializePayment(
    user: IRegistration,
    invoiceData: {
      eventName: string;
      amount: number;
      place: string;
      time: Date;
    }
  ): Promise<{ invoiceId: string; message: string }> {
    try {
      const invoiceId = this.generateInvoiceId();
      
      // Import Invoice model
      const { Invoice } = await import('../models/invoice.model');
      
      // Save invoice to database
      const invoice = new Invoice({
        invoiceId: invoiceId,
        user: user._id,
        amount: invoiceData.amount,
        status: 'pending',
        metadata: {
          eventName: invoiceData.eventName,
          place: invoiceData.place,
          time: invoiceData.time
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await invoice.save();

      // Send Telegram message if user has telegram data
      const telegramId = user.telegramData?.chatId || user.telegramData?.id;
      let message = 'Invoice created';
      
      if (telegramId) {
        try {
          const telegramService = new TelegramService();
          const phone = process.env.TELEBIRR_PHONE_NUMBER || 'Unknown';
          
          await telegramService.sendPaymentInstruction(
            telegramId, 
            invoiceData.amount, 
            phone,
            invoiceData.eventName
          );
          message = 'Invoice created and Telegram instruction sent';
        } catch (telegramError) {
          console.error('Failed to send Telegram message:', telegramError);
          message = 'Invoice created but failed to send Telegram instruction';
        }
      } else {
        message = 'Invoice created but user has no Telegram linked';
      }

      return {
        invoiceId,
        message
      };
    } catch (error: any) {
      console.error('Error in initializePayment:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to initialize payment');
    }
  }

  /**
   * Verify payment manually via Telebirr Receipt
   */
  async verifyPayment(transactionId: string, userId: string): Promise<{ success: boolean; message: string; invoice?: any }> {
    try {
      console.log(`Verifying transaction: ${transactionId} for user ${userId}`);
      
      // 1. Verify with Telebirr Scraper
      const receipt = await telebirrService.verifyTransaction(transactionId);
      
      if (receipt.status !== 'valid') {
        return { success: false, message: 'Invalid transaction receipt' };
      }

      // 2. Find pending invoice for this user matching the amount
      // We look for the most recent pending invoice with matching amount
      const { Invoice } = await import('../models/invoice.model');
      
      const invoice = await Invoice.findOne({ 
        user: userId,
        amount: receipt.amount,
        status: 'pending'
      }).sort({ createdAt: -1 });

      if (!invoice) {
        return { success: false, message: `No pending invoice found for amount ${receipt.amount} ETB` };
      }

      // 3. Update Invoice
      invoice.status = 'paid';
      invoice.transactionId = transactionId;
      invoice.paidAt = new Date(receipt.date);
      invoice.receiptData = {
        senderName: receipt.senderName,
        confirmedAmount: receipt.amount,
        date: receipt.date,
        receiver: receipt.receiverName
      };
      
      await invoice.save();

      // 4. Update EventRegistration status if linked
      if (invoice.metadata && invoice.metadata.eventName) {
         const { EventRegistration } = await import('../models/event-registration.model');
         const { Event } = await import('../models/events.model');
         
         const event = await Event.findOne({ name: invoice.metadata.eventName });
         
         if (event) {
            const registration = await EventRegistration.findOne({
              user: invoice.user,
              event: event._id
            });

            if (registration) {
              registration.status = 'confirmed';
              await registration.save();
            }
         }
      }

      // 5. Send Success Message with QR Code
      const telegramId = (invoice.user as any).telegramData?.chatId; // Assuming user is populated or we fetch it
      // Actually invoice.user is ObjectId, we need to fetch user or rely on caller passing userId which might be from telegram context
      
      // Let's fetch the user to be sure
      const { Registration } = await import('../models/user.model');
      const user = await Registration.findById(invoice.user);

      if (user && user.telegramData?.chatId) {
          const telegramService = new TelegramService();
          
          // Generate QR
          const qrBuffer = await qrService.generateReceiptQR({
              eventName: invoice.metadata?.eventName || 'Event',
              amount: invoice.amount,
              payerName: receipt.senderName,
              date: receipt.date,
              transactionId: transactionId
          });

          await telegramService.sendVerificationSuccess(
              user.telegramData.chatId,
              invoice,
              qrBuffer
          );
      }

      return { 
        success: true, 
        message: 'Payment verified successfully', 
        invoice 
      };

    } catch (error: any) {
      console.error('Verify payment error:', error);
      return { success: false, message: error.message || 'Payment verification failed' };
    }
  }

  /**
   * Bulk initialize payment for an event
   */
  async bulkInitializePayment(eventId: string): Promise<{ success: number; failed: number; skipped: number; total: number }> {
    try {
      // Import EventRegistration model
      const { EventRegistration } = await import('../models/event-registration.model');
      const { Invoice } = await import('../models/invoice.model');
      
      // Find users registered for this event
      const registrations = await EventRegistration.find({
        event: eventId,
        status: { $in: ['registered', 'payment_initiated'] }
      }).populate('user');

      let successCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      // Import Event model to get event details
      const { Event } = await import('../models/events.model');
      const event = await Event.findById(eventId);

      if (!event) {
        throw new Error('Event not found');
      }

      console.log(`Found ${registrations.length} users to process for event ${event.name}`);

      for (const reg of registrations) {
        try {
          const user = reg.user as any;
          
          // CHECK: Does this user already have a pending or paid invoice for this event?
          // We check by metadata.eventName (legacy) or we should check by event ID if we added it to invoice
          // The new Invoice model has 'event' field, but we need to ensure we populate it.
          // For now, checking by metadata.eventName is safer for backward compatibility or current logic
          
          const existingInvoice = await Invoice.findOne({
            user: user._id,
            'metadata.eventName': event.name,
            status: { $in: ['pending', 'paid'] }
          });

          if (existingInvoice) {
              console.log(`Skipping user ${user.email} - Invoice already exists`);
              skippedCount++;
              continue;
          }
          
          // Initialize payment
          await this.initializePayment(user, {
            eventName: event.name,
            amount: event.price,
            place: event.location,
            time: event.date
          });

          // Update status in EventRegistration
          reg.status = 'payment_initiated';
          await reg.save();

          successCount++;
        } catch (error) {
          console.error(`Failed to initialize payment for registration ${reg._id}:`, error);
          failedCount++;
        }
      }

      return {
        success: successCount,
        failed: failedCount,
        skipped: skippedCount,
        total: registrations.length
      };
    } catch (error) {
      console.error('Error in bulkInitializePayment:', error);
      throw error;
    }
  }
  
  // Keep getPaymentStatus and getUserInvoices as they are mostly read operations
  // but verifyPayment (Chapa webhook) is removed/replaced.
  
  /**
   * Get payment status
   */
  async getPaymentStatus(invoiceId: string): Promise<{ status: string }> {
    try {
      const { Invoice } = await import('../models/invoice.model');
      const invoice = await Invoice.findOne({ invoiceId });
      
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return { status: invoice.status };
    } catch (error) {
      console.error('Get payment status error:', error);
      throw error;
    }
  }
}

export const paymentService = new PaymentService();
