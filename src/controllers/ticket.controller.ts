import { Request, Response } from 'express';
import { qrService, TicketReference } from '../services/qr.service';
import { Invoice } from '../models/invoice.model';
import { Registration } from '../models/user.model';
import { Event } from '../models/events.model';

export class TicketController {
  /**
   * Verify and display ticket information
   * GET /ticket/:reference
   */
  public async verifyTicket(req: Request, res: Response) {
    try {
      const { reference } = req.params;
      
      if (!reference) {
        return res.status(400).json({ 
          success: false, 
          message: 'Ticket reference is required' 
        });
      }

      console.log(`Verifying ticket reference: ${reference}`);
      
      // Verify the QR reference
      const ticketData = await qrService.verifyTicketReference(reference);
      
      // Get full invoice details
      const invoice = await Invoice.findOne({ 
        invoiceId: ticketData.invoiceId,
        status: 'paid'
      }).populate('user');

      if (!invoice) {
        return res.status(404).json({ 
          success: false, 
          message: 'Ticket not found or invalid' 
        });
      }

      // Get user details
      const user = await Registration.findById(invoice.user);
      
      // Get event details
      let event = null;
      if (invoice.metadata?.eventName) {
        event = await Event.findOne({ name: invoice.metadata.eventName });
      }

      // Log the verification
      console.log(`Ticket verified: ${ticketData.invoiceId} for user ${user?.fullName}`);

      // Prepare data for the template
      const ticketInfo = {
        success: true,
        data: {
          ticket: ticketData,
          invoice: {
            invoiceId: invoice.invoiceId,
            amount: invoice.amount,
            currency: invoice.currency,
            paidAt: invoice.paidAt,
            receiptData: invoice.receiptData,
            metadata: invoice.metadata
          },
          user: user ? {
            fullName: user.fullName,
            email: user.email,
            telegramUsername: user.telegramData?.username
          } : { fullName: 'Guest', email: '', telegramUsername: '' },
          event: event ? {
            name: event.name,
            location: event.location || invoice.metadata?.place || 'TBD',
            date: event.date ? new Date(event.date).toLocaleString() : invoice.metadata?.time || 'TBD',
            description: event.description || '',
            amount: invoice.amount
          } : {
            name: invoice.metadata?.eventName || 'Event',
            location: invoice.metadata?.place || 'TBD',
            date: invoice.metadata?.time ? new Date(invoice.metadata.time).toLocaleString() : 'TBD',
            description: '',
            amount: invoice.amount
          }
        }
      };

      // Render the ticket page with the data
      return res.render('ticket', ticketInfo);

    } catch (error: any) {
      console.error('Ticket verification error:', error.message);
      
      // Return appropriate error based on error type
      if (error.message.includes('Invalid signature')) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid ticket - possible fraud attempt detected' 
        });
      }
      
      if (error.message.includes('expired')) {
        return res.status(410).json({ 
          success: false, 
          message: 'Ticket has expired' 
        });
      }
      
      if (error.message.includes('not found')) {
    return res.status(404).render('error', {
    success: false,
    error: 'Ticket Not Found',
    message: 'The ticket could not be found or has expired.',
    code: 'TICKET_NOT_FOUND'
  }); 
      }
      
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to verify ticket' 
      });
    }
  }

  /**
   * Mark ticket as used (for event check-in)
   * POST /ticket/:reference/use
   */
  public async markTicketUsed(req: Request, res: Response) {
    try {
      const { reference } = req.params;
      
      if (!reference) {
        return res.status(400).json({ 
          success: false, 
          message: 'Ticket reference is required' 
        });
      }

      // Verify the QR reference first
      const ticketData = await qrService.verifyTicketReference(reference);
      
      // Check if already used (you'd implement this tracking)
      // For now, we'll just return success
      
      console.log(`Ticket marked as used: ${ticketData.invoiceId}`);

      return res.status(200).json({
        success: true,
        message: 'Ticket marked as used successfully',
        data: {
          ticket: ticketData,
          usedAt: new Date()
        }
      });

    } catch (error: any) {
      console.error('Mark ticket used error:', error.message);
      
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to mark ticket as used' 
      });
    }
  }

  /**
   * Get ticket status without full details
   * GET /ticket/:reference/status
   */
  public async getTicketStatus(req: Request, res: Response) {
    try {
      const { reference } = req.params;
      
      if (!reference) {
        return res.status(400).json({ 
          success: false, 
          message: 'Ticket reference is required' 
        });
      }

      const ticketData = await qrService.verifyTicketReference(reference);

      return res.status(200).json({
        success: true,
        data: {
          status: ticketData.status,
          eventName: ticketData.eventName,
          amount: ticketData.amount,
          createdAt: ticketData.createdAt
        }
      });

    } catch (error: any) {
      console.error('Get ticket status error:', error.message);
      
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get ticket status' 
      });
    }
  }
}
