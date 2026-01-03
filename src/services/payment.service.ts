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
   * Detect payment method based on transaction ID prefix
   */
  public static detectPaymentMethod(transactionId: string): string {
    const tid = transactionId.trim().toUpperCase();
    if (tid.startsWith('FT')) {
      return 'cbe';
    } else if (tid.startsWith('CFT') || tid.startsWith('DFT')) {
      return 'boa';
    }
    return 'telebirr';
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
      eventId?: string;
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
        event: invoiceData.eventId,
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
          await telegramService.sendPaymentMethodSelection(
            telegramId, 
            invoiceData.amount, 
            invoiceData.eventName,
            invoiceId
          );
          message = 'Invoice created and payment method selection sent';
        } catch (telegramError) {
          console.error('Failed to send Telegram message:', telegramError);
          message = 'Invoice created but failed to send payment methods';
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
   * Verify payment manually via various payment methods (Telebirr, CBE, BOA)
   */
  async verifyPayment(transactionId: string, userId: string, method: string = 'telebirr', eventName?: string): Promise<{ success: boolean; message: string; invoice?: any }> {
    try {
      console.log(`Verifying ${method} transaction: ${transactionId} for user ${userId}`);
      
      let receipt;
      
      // 1. Verify with appropriate service
      if (method?.toLowerCase() === 'cbe') {
          const { bankVerifierService } = await import('./bank-verifier.service');
          receipt = await bankVerifierService.verifyCBE(transactionId);
      } else if (method?.toLowerCase() === 'boa') {
          const { bankVerifierService } = await import('./bank-verifier.service');
          receipt = await bankVerifierService.verifyBOA(transactionId);
      } else {
          // Default to Telebirr
          receipt = await telebirrService.verifyTransaction(transactionId);
      }
      
      if (receipt.status !== 'valid') {
        return { success: false, message: 'Invalid transaction receipt' };
      }

      // 2. Check if this transaction ID was already used
      const { Invoice } = await import('../models/invoice.model');
      
      // Check if this transaction ID was already used (to prevent duplicate verification)
      const existingPaidInvoice = await Invoice.findOne({
        transactionId: transactionId,
        status: 'paid'
      });
      
      if (existingPaidInvoice && existingPaidInvoice.user.toString() === userId) {
        // Resend QR code for existing payment
        try {
          const { Registration } = await import('../models/user.model');
          const user = await Registration.findById(userId);
          
          console.log('Found user for QR resend:', {
            userId,
            telegramUsername: user?.telegramData?.username,
            telegramId: user?.telegramData?.id,
            chatId: user?.telegramData?.chatId,
            hasTelegramData: !!user?.telegramData
          });
          
          if (user && user.telegramData) {
            const telegramService = new TelegramService();
            
            // Use chatId if available, otherwise use telegramId
            const chatId = user.telegramData.chatId || user.telegramData.id;
            
            if (chatId) {
              console.log('Generating QR code for existing payment...');
              const qrBuffer = await qrService.generateTicketQR(existingPaidInvoice);
              
              console.log('Sending QR code to Telegram chat ID:', chatId);
              const telegramResult = await telegramService.sendVerificationSuccess(
                chatId,
                existingPaidInvoice,
                qrBuffer
              );
              
              console.log('Telegram send result:', telegramResult);
              console.log('QR code resent for existing payment to user:', user.telegramData.username);
            } else {
              console.log('No chat ID or Telegram ID found for user');
            }
          } else {
            console.log('User or Telegram data not found:', {
              userExists: !!user,
              hasTelegramData: !!user?.telegramData
            });
          }
        } catch (qrError: any) {
          console.error('Failed to resend QR code:', qrError.message);
          console.error('Full QR error:', qrError);
          // If QR resend fails, return error
          return { 
            success: false, 
            message: `Already paid for event: ${existingPaidInvoice.metadata?.eventName || 'Event'}. Your payment was verified on ${existingPaidInvoice.paidAt?.toLocaleDateString()}. Failed to resend QR code.`,
            invoice: existingPaidInvoice
          };
        }
        
        // QR code was successfully sent, return success
        return { 
          success: true, 
          message: `QR code resent for ${existingPaidInvoice.metadata?.eventName || 'Event'}. Your payment was verified on ${existingPaidInvoice.paidAt?.toLocaleDateString()}.`,
          invoice: existingPaidInvoice
        };
      }
      
      // Find pending invoice for this user
      // If eventName is provided, prioritize matching by event name, then by amount
      let pendingInvoice;
      
      if (eventName) {
        // First try to find invoice matching event name exactly
        pendingInvoice = await Invoice.findOne({ 
          user: userId,
          'metadata.eventName': eventName,
          amount: { $lte: receipt.amount },
          status: 'pending'
        }).sort({ createdAt: -1 });
      }
      
      // If not found and eventName was provided, or if eventName wasn't provided, try without event name
      if (!pendingInvoice) {
        pendingInvoice = await Invoice.findOne({ 
          user: userId,
          amount: { $lte: receipt.amount }, // Invoice amount should be less than or equal to paid amount
          status: 'pending'
        }).sort({ createdAt: -1 });
      }

      if (!pendingInvoice) {
        return { success: false, message: `No pending invoice found for amount ${receipt.amount} ETB. Looking for invoice <= ${receipt.amount} ETB` };
      }

      // 3. Update Invoice
      pendingInvoice.status = 'paid';
      pendingInvoice.transactionId = transactionId;
      pendingInvoice.paidAt = new Date(receipt.date);
      pendingInvoice.receiptData = {
        senderName: receipt.senderName,
        confirmedAmount: receipt.amount,
        date: receipt.date,
        receiver: (receipt.receiverName && receipt.receiverName !== 'Unknown') 
          ? receipt.receiverName 
          : 'Reboot Adventures'
      };
      
      await pendingInvoice.save();

      // 4. Update EventRegistration status if linked
      if (pendingInvoice.metadata && pendingInvoice.metadata.eventName) {
         const { EventRegistration } = await import('../models/event-registration.model');
         const { Event } = await import('../models/events.model');
         
         const event = await Event.findOne({ name: pendingInvoice.metadata.eventName });
         
         if (event) {
            const registration = await EventRegistration.findOne({
              user: pendingInvoice.user,
              event: event._id
            });

            if (registration) {
              registration.status = 'confirmed';
              await registration.save();
            }
         }
      }

      // 5. Send Success Message with QR Code
      const { Registration } = await import('../models/user.model');
      const user = await Registration.findById(pendingInvoice.user);

      if (user && user.telegramData) {
          const telegramService = new TelegramService();
          
          // Use chatId if available, otherwise use telegramId
          const chatId = user.telegramData.chatId || user.telegramData.id;
          
          if (chatId) {
            // 6. Send Telegram notification with QR code (optional)
            try {
              console.log('Generating QR code for new payment...');
              const qrBuffer = await qrService.generateTicketQR(pendingInvoice);
              
              console.log('Sending QR code to Telegram chat ID:', chatId);
              const telegramResult = await telegramService.sendVerificationSuccess(
                chatId,
                pendingInvoice,
                qrBuffer
              );
              
              console.log('Telegram send result for new payment:', telegramResult);
              console.log('QR code sent for new payment to user:', user.telegramData.username);
            } catch (qrError: any) {
              console.error('QR code generation or Telegram notification failed for new payment:', qrError.message);
              console.error('Full QR error details:', qrError);
              // Continue without QR code - payment is still verified
            }
          } else {
            console.log('No chat ID or Telegram ID found for user during new payment');
          }
      } else {
        console.log('User or Telegram data not found for new payment:', {
          userExists: !!user,
          hasTelegramData: !!user?.telegramData
        });
      }

      return { 
        success: true, 
        message: 'Payment verified successfully', 
        invoice: pendingInvoice
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
      const event = await Event.findById(eventId) as any;

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
            time: event.date,
            eventId: event._id.toString()
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
