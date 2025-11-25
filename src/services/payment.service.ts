import axios from 'axios';
import { IRegistration } from '../interfaces/user.interface';
import { Registration } from '../models/user.model';
import { TelegramService } from './telegram.service';

interface ChapaInitiateResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    checkout_url: string;
  };
}

interface ChapaVerificationResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    status: 'success' | 'failed';
    tx_ref: string;
    transaction_id: string;
    amount: number;
    currency: string;
    [key: string]: any;
  };
}

export class PaymentService {
  private readonly chapaBaseUrl = 'https://api.chapa.co/v1';
  
  private readonly chapaSecretKey: string;

  constructor() {
    const chapaKey = process.env.CHAPA_SECRET_KEY;
    if (!chapaKey) {
      throw new Error('CHAPA_SECRET_KEY is not defined in environment variables');
    }
    this.chapaSecretKey = chapaKey;
  }

  /**
   * Generate a unique reference for Chapa payment
   */
  private generateReference(prefix = 'CHAPA'): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Initialize a payment with Chapa
   */
  async initializePayment(
    user: IRegistration,
    invoiceData: {
      eventName: string;
      amount: number;
      place: string;
      time: Date;
    }
  ): Promise<{ paymentLink: string; invoiceId: string }> {
    try {
      const reference = this.generateReference();
      const invoiceId = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      const chapaPayload = {
        amount: invoiceData.amount.toString(),
        currency: 'ETB',
        email: user.email,
        first_name: user.fullName?.split(' ')[0] || 'Customer',
        last_name: user.fullName?.split(' ').slice(1).join(' ') || '.',
        tx_ref: reference,
        callback_url: `${process.env.APP_URL}/api/payments/verify/${reference}`,
        return_url: `${process.env.APP_URL}/api/payments/success?tx_ref=${reference}`,
        'customization[title]': 'Rebbot Adventures',
        'customization[description]': `Payment for ${invoiceData.eventName}`,
        metadata: {
          userId: user._id?.toString(),
          invoiceId,
          eventName: invoiceData.eventName,
          place: invoiceData.place,
          time: invoiceData.time.toISOString()
        }
      };

      const response = await axios.post<ChapaInitiateResponse>(
        `${this.chapaBaseUrl}/transaction/initialize`,
        chapaPayload,
        {
          headers: {
            Authorization: `Bearer ${this.chapaSecretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000 // Add a 30-second timeout
        }
      );

      if (response.data.status !== 'success' || !response.data.data?.checkout_url) {
        throw new Error('Failed to initialize payment with Chapa');
      }

      // Import Invoice model
      const { Invoice } = await import('../models/invoice.model');
      
      // Save invoice to database
      const invoice = new Invoice({
        invoiceId: reference, // Using tx_ref (reference) as invoiceId for consistency
        user: user._id,
        amount: invoiceData.amount,
        status: 'pending',
        chapaLink: response.data.data.checkout_url,
        chapaReference: reference, // Storing tx_ref
        tx_ref: reference,
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
      
      if (telegramId) {
        try {
          const telegramService = new TelegramService();
          const message = `
🎉 <b>Registration Successful!</b>

You have been registered for <b>${invoiceData.eventName}</b>.
📍 Location: ${invoiceData.place}
📅 Time: ${new Date(invoiceData.time).toLocaleString()}

Please complete your payment of <b>${invoiceData.amount} ETB</b> using the link below to confirm your spot.
`;
          
          await telegramService.sendMessage(telegramId, message, {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '💳 Pay Now',
                    url: response.data.data.checkout_url
                  }
                ]
              ]
            }
          });
        } catch (telegramError) {
          console.error('Failed to send Telegram message:', telegramError);
          // Don't fail the request if telegram message fails
        }
      }

      return {
        paymentLink: response.data.data.checkout_url,
        invoiceId: reference
      };
    } catch (error: any) {
      console.error('Error in initializePayment:', error);
      if ((error as any).isAxiosError) {
        console.error('Axios error details:', error.response?.data || error.message);
      }
      throw new Error(error instanceof Error ? error.message : 'Failed to initialize payment');
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(reference: string): Promise<{ status: string }> {
    try {
      // Import Invoice model
      const { Invoice } = await import('../models/invoice.model');
      
      const invoice = await Invoice.findOne({ tx_ref: reference });
      
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return { status: invoice.status };
    } catch (error) {
      console.error('Get payment status error:', error);
      throw error;
    }
  }

  /**
   * Verify payment and update status
   */
  async verifyPayment(reference: string): Promise<{ success: boolean; message: string; invoice?: any }> {
    try {
      console.log(`Verifying payment for reference: ${reference}`);
      
      // 1. Verify with Chapa
      const response = await axios.get<ChapaVerificationResponse>(
        `https://api.chapa.co/v1/transaction/verify/${reference}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.CHAPA_SECRET_KEY}`
          }
        }
      );

      if (response.data.status !== 'success') {
        return { success: false, message: 'Payment verification failed' };
      }

      // 2. Update Invoice status in database
      const { Invoice } = await import('../models/invoice.model');
      const invoice = await Invoice.findOne({ tx_ref: reference });

      if (!invoice) {
        return { success: false, message: 'Invoice not found' };
      }

      if (invoice.status === 'paid') {
        return { success: true, message: 'Payment already verified', invoice };
      }

      invoice.status = 'paid';
      invoice.paidAt = new Date();
      await invoice.save();

      // 3. Update EventRegistration status if linked
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

      return { 
        success: true, 
        message: 'Payment verified successfully', 
        invoice 
      };

    } catch (error) {
      console.error('Verify payment error:', error);
      return { success: false, message: 'Payment verification failed' };
    }
  }

  /**
   * Bulk initialize payment for an event
   */
  async bulkInitializePayment(eventId: string): Promise<{ success: number; failed: number; total: number }> {
    try {
      // Import EventRegistration model
      const { EventRegistration } = await import('../models/event-registration.model');
      
      // Find users registered for this event but not yet paid/initiated
      const registrations = await EventRegistration.find({
        event: eventId,
        status: 'registered'
      }).populate('user');

      let successCount = 0;
      let failedCount = 0;

      // Import Event model to get event details
      const { Event } = await import('../models/events.model');
      const event = await Event.findById(eventId);

      if (!event) {
        throw new Error('Event not found');
      }

      console.log(`Found ${registrations.length} users to process for event ${event.name}`);

      for (const reg of registrations) {
        try {
          const user = reg.user as any; // Cast to any to access user properties since populate is used
          
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
        total: registrations.length
      };
    } catch (error) {
      console.error('Error in bulkInitializePayment:', error);
      throw error;
    }
  }
}

export const paymentService = new PaymentService();
