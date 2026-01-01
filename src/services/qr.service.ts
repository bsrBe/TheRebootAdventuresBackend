import QRCode from 'qrcode';
import crypto from 'crypto';

export interface TicketReference {
  reference: string;
  invoiceId: string;
  transactionId: string;
  userId: string;
  eventName: string;
  amount: number;
  status: 'valid' | 'used' | 'expired';
  createdAt: Date;
  signature: string;
}

export class QRService {
  private readonly QR_BASE_URL = (process.env.QR_BASE_URL || 'http://localhost:5000').replace(/\/$/, '').replace(/\/ticket(\/|$)/, ''); // Base URL without /ticket
  private readonly SECRET_KEY = process.env.QR_SECRET_KEY || 'your-secret-key';

  /**
   * Generate a secure QR code with reference instead of full data
   */
  async generateTicketQR(invoice: any): Promise<Buffer> {
    try {
      // Generate secure reference
      const reference = this.generateSecureReference(invoice);
      
      // Create QR content with just the reference URL
      const qrContent = `${this.QR_BASE_URL}/ticket/${reference}`;
      
      // Generate QR code as a Buffer
      const buffer = await QRCode.toBuffer(qrContent, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 300,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      return buffer;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate a secure reference for the ticket
   */
  private generateSecureReference(invoice: any): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(16).toString('hex');
    const data = `${invoice.invoiceId}:${invoice.transactionId}:${timestamp}:${random}`;
    
    // Create signature
    const signature = crypto
      .createHmac('sha256', this.SECRET_KEY)
      .update(data)
      .digest('hex');
    
    // Combine data with signature
    const fullData = `${data}:${signature}`;
    
    // Encode to base64 for URL safety
    return Buffer.from(fullData).toString('base64url');
  }

  /**
   * Verify and decode QR reference
   */
  async verifyTicketReference(reference: string): Promise<TicketReference> {
    try {
      // Decode from base64
      const decoded = Buffer.from(reference, 'base64url').toString('utf-8');
      const parts = decoded.split(':');
      
      if (parts.length !== 5) {
        throw new Error('Invalid reference format');
      }

      const [invoiceId, transactionId, timestamp, random, signature] = parts;
      
      // Verify signature
      const dataToVerify = `${invoiceId}:${transactionId}:${timestamp}:${random}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.SECRET_KEY)
        .update(dataToVerify)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        throw new Error('Invalid signature - possible fraud');
      }

      // Get invoice details
      const { Invoice } = await import('../models/invoice.model');
      const invoice = await Invoice.findOne({ 
        invoiceId, 
        transactionId,
        status: 'paid' 
      });

      if (!invoice) {
        throw new Error('Invoice not found or not paid');
      }

      // Get registration to check check-in status
      const { EventRegistration } = await import('../models/event-registration.model');
      let registration = await EventRegistration.findOne({
        user: invoice.user,
        event: invoice.event
      });

      // Fallback: If registration not found by ID (maybe old invoice), try find event by name and then registration
      if (!registration && invoice.metadata?.eventName) {
          const { Event } = await import('../models/events.model');
          const event = await Event.findOne({ name: invoice.metadata.eventName });
          if (event) {
              registration = await EventRegistration.findOne({
                  user: invoice.user,
                  event: event._id
              });
          }
      }

      console.log(`Ticket Status Check: Ref=${reference}, CheckIn=${registration?.checkedIn || false}`);

      const createdAt = new Date(parseInt(timestamp));

      return {
        reference,
        invoiceId,
        transactionId,
        userId: invoice.user.toString(),
        eventName: invoice.metadata?.eventName || 'Event',
        amount: invoice.amount,
        status: this.determineTicketStatus(invoice, registration),
        createdAt,
        signature
      };

    } catch (error) {
      console.error('Error verifying QR reference:', error);
      throw error;
    }
  }

  /**
   * Determine ticket status based on invoice and registration
   */
  private determineTicketStatus(invoice: any, registration?: any): 'valid' | 'used' | 'expired' {
    const now = new Date();
    
    // 1. Check if user already checked in
    if (registration?.checkedIn) {
      return 'used';
    }

    // 2. Check if event has passed
    if (invoice.metadata?.time) {
        const eventTime = new Date(invoice.metadata.time);
        if (now > eventTime) {
          return 'expired';
        }
    }
    
    return 'valid';
  }
}

export const qrService = new QRService();
