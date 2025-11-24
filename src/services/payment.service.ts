import axios from 'axios';
import { IInvoice, IRegistration } from '../interfaces/user.interface';
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
  // async initializePayment(
  //   user: IRegistration,
  //   invoiceData: {
  //     eventName: string;
  //     amount: number;
  //     place: string;
  //     time: Date;
  //   }
  // ): Promise<{ paymentLink: string; invoiceId: string }> {
  //   try {
  //     const reference = this.generateReference();
  //     const invoiceId = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
  //     const chapaPayload = {
  //       amount: invoiceData.amount.toString(),
  //       currency: 'ETB',
  //       email: user.email,
  //       first_name: user.fullName.split(' ')[0],
  //       last_name: user.fullName.split(' ').slice(1).join(' ') || '.',
  //       tx_ref: reference,
  //       callback_url: `${process.env.APP_URL}/api/payments/verify/${reference}`,
  //       return_url: `${process.env.FRONTEND_URL}/payment/success`,
  //       'customization[title]': 'Rebbot Adventures',
  //       'customization[description]': `Payment for ${invoiceData.eventName}`,
  //       metadata: {
  //         userId: user._id.toString(),
  //         invoiceId,
  //         eventName: invoiceData.eventName,
  //         place: invoiceData.place,
  //         time: invoiceData.time.toISOString()
  //       }
  //     };

  //     const response = await axios.post<ChapaInitiateResponse>(
  //       `${this.chapaBaseUrl}/transaction/initialize`,
  //       chapaPayload,
  //       {
  //         headers: {
  //           Authorization: `Bearer ${this.chapaSecretKey}`,
  //           'Content-Type': 'application/json',
  //         },
  //       }
  //     );

  //     if (response.data.status !== 'success' || !response.data.data?.checkout_url) {
  //       throw new Error('Failed to initialize payment with Chapa');
  //     }

  //     // Create a new invoice object with all required fields
  //     const newInvoice = {
  //       ...invoiceData,
  //       invoiceId,
  //       chapaLink: response.data.data.checkout_url,
  //       status: 'pending' as const,
  //       chapaReference: reference,
  //       metadata: {},
  //       createdAt: new Date(),
  //       updatedAt: new Date(),
  //       paidAt: undefined
  //     };

  //     // Add the invoice to the user
  //     const updatedUser = await user.addInvoice(newInvoice as any);
      
  //     if (!updatedUser) {
  //       throw new Error('Failed to save invoice');
  //     }

  //     // Find the newly added invoice
  //     const savedInvoice = updatedUser.invoices.find(
  //       inv => inv.invoiceId === newInvoice.invoiceId
  //     );

  //     if (!savedInvoice) {
  //       throw new Error('Failed to retrieve saved invoice');
  //     }

  //     return {
  //       paymentLink: response.data.data.checkout_url,
  //       invoiceId: savedInvoice.invoiceId
  //     };
  //   } catch (error) {
  //     console.error('Error initializing payment:', error);
  //     throw new Error('Failed to initialize payment');
  //   }
  // }
// In payment.service.ts, update the initializePayment method
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

      // Create a new invoice object
      const newInvoice = {
        ...invoiceData,
        invoiceId,
        chapaLink: response.data.data.checkout_url,
        status: 'pending' as const,
        chapaReference: reference,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        paidAt: undefined
      };

      // Save the invoice directly using the model
      const updatedUser = await Registration.findByIdAndUpdate(
        user._id,
        { $push: { invoices: newInvoice } },
        { new: true, useFindAndModify: false }
      );

      if (!updatedUser) {
        throw new Error('Failed to save invoice: User not found');
      }

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
        invoiceId: newInvoice.invoiceId
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
   * Verify a payment with Chapa
   */
  async verifyPayment(reference: string): Promise<{
    success: boolean;
    message: string;
    invoice?: IInvoice;
  }> {
    try {
      // First verify with Chapa
      const response = await axios.get<ChapaVerificationResponse>(
        `${this.chapaBaseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.chapaSecretKey}`,
          },
        }
      );

      const responseData = response.data;
      
      if (responseData.status !== 'success' || responseData.data?.status !== 'success') {
        return { 
          success: false, 
          message: responseData.message || 'Payment verification failed' 
        };
      }

      // Find the user with this invoice reference
      const user = await Registration.findOne({
        'invoices.chapaReference': reference
      });

      if (!user) {
        return { success: false, message: 'Invoice not found' };
      }

      // Find and update the invoice status
      const invoice = user.invoices.find(inv => inv.chapaReference === reference);
      if (!invoice) {
        return { success: false, message: 'Invoice not found' };
      }

      const updateResult = await user.updateInvoiceStatus(invoice.invoiceId, 'paid', reference);
      
      if (!updateResult) {
        return { success: false, message: 'Failed to update invoice status' };
      }

      return {
        success: true,
        message: 'Payment verified successfully',
        invoice: {
          ...invoice.toObject(),
          status: 'paid' as const,
          paidAt: new Date(),
          chapaReference: reference
        } as IInvoice
      };
    } catch (error) {
      console.error('Error verifying payment:', error);
      return { success: false, message: 'Error verifying payment' };
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(reference: string): Promise<{
    status: 'pending' | 'paid' | 'failed' | 'not_found';
    invoice?: IInvoice;
  }> {
    try {
      const user = await Registration.findOne({
        'invoices.chapaReference': reference
      });

      if (!user) {
        return { status: 'not_found' };
      }

      const invoice = user.invoices.find(inv => inv.chapaReference === reference);
      if (!invoice) {
        return { status: 'not_found' };
      }

      // If already paid in our system, return that
      if (invoice.status === 'paid') {
        return { status: 'paid', invoice };
      }

      // Otherwise, verify with Chapa
      const verification = await this.verifyPayment(reference);
      if (verification.success && verification.invoice) {
        return { status: 'paid', invoice: verification.invoice };
      }

      return { status: invoice.status as 'pending' | 'failed', invoice };
    } catch (error) {
      console.error('Error getting payment status:', error);
      return { status: 'failed' };
    }
  }

  /**
   * Bulk initialize payment for an event
   */
  async bulkInitializePayment(eventId: string): Promise<{ success: number; failed: number; total: number }> {
    try {
      // Find users registered for this event but not yet paid/initiated
      // We need to query the registeredEvents array
      const users = await Registration.find({
        'registeredEvents': {
          $elemMatch: {
            eventId: eventId,
            status: 'registered'
          }
        }
      });

      let successCount = 0;
      let failedCount = 0;

      // Import Event model to get event details
      const { Event } = await import('../models/events.model');
      const event = await Event.findById(eventId);

      if (!event) {
        throw new Error('Event not found');
      }

      console.log(`Found ${users.length} users to process for event ${event.name}`);

      for (const user of users) {
        try {
          // Initialize payment
          await this.initializePayment(user, {
            eventName: event.name,
            amount: event.price,
            place: event.location,
            time: event.date
          });

          // Update status in registeredEvents
          const eventIndex = user.registeredEvents.findIndex(e => e.eventId.toString() === eventId);
          if (eventIndex !== -1) {
            user.registeredEvents[eventIndex].status = 'payment_initiated';
            await user.save();
          }

          successCount++;
        } catch (error) {
          console.error(`Failed to initialize payment for user ${user._id}:`, error);
          failedCount++;
        }
      }

      return {
        success: successCount,
        failed: failedCount,
        total: users.length
      };
    } catch (error) {
      console.error('Error in bulkInitializePayment:', error);
      throw error;
    }
  }
}

export const paymentService = new PaymentService();
