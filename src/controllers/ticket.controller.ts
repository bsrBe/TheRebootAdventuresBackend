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

      // Get registration details
      const { EventRegistration } = await import('../models/event-registration.model');
      let registration = await EventRegistration.findOne({
          user: invoice.user,
          event: invoice.event
      });

      if (!registration && invoice.metadata?.eventName) {
          const { Event: EventModel } = await import('../models/events.model');
          const eventRecord = await EventModel.findOne({ name: invoice.metadata.eventName });
          if (eventRecord) {
              registration = await EventRegistration.findOne({
                  user: invoice.user,
                  event: eventRecord._id
              });
          }
      }

      // Log the verification
      console.log(`Ticket verified: ${ticketData.invoiceId} for user ${user?.fullName}, Status: ${ticketData.status}`);

      // Prepare data for the template
      const ticketInfo = {
        success: true,
        data: {
          ticket: ticketData,
          registration: registration,
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
      
      let errorTitle = 'Verification Failed';
      let errorMessage = 'We couldn\'t verify this ticket at the moment.';
      let errorCode = 'VERIFY_ERROR';

      if (error.message.includes('Invalid signature')) {
        errorTitle = 'Invalid Ticket';
        errorMessage = 'This ticket appears to be invalid or tempered with.';
        errorCode = 'INVALID_SIGNATURE';
      } else if (error.message.includes('expired')) {
        errorTitle = 'Ticket Expired';
        errorMessage = 'This ticket has already expired and is no longer valid.';
        errorCode = 'TICKET_EXPIRED';
      } else if (error.message.includes('not found')) {
        errorTitle = 'Ticket Not Found';
        errorMessage = 'We couldn\'t find any active ticket matching this reference.';
        errorCode = 'TICKET_NOT_FOUND';
      }
      
      return res.status(400).render('error', {
        success: false,
        error: errorTitle,
        message: errorMessage,
        code: errorCode
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

      // 1. Verify the QR reference first
      const ticketData = await qrService.verifyTicketReference(reference);
      
      // 2. Fetch all necessary details for rich response
      const invoice = await Invoice.findOne({ invoiceId: ticketData.invoiceId }).populate('user');
      const user = invoice ? await Registration.findById(invoice.user) : null;
      
      const attendeeInfo = {
        fullName: user?.fullName || 'Unknown Attendee',
        email: user?.email || '',
        phoneNumber: user?.phoneNumber || '',
        telegramUsername: user?.telegramData?.username || '',
        // Full Profile Data
        age: user?.age,
        weight: user?.weight,
        height: user?.height,
        horseRidingExperience: user?.horseRidingExperience,
        // Payment Data
        invoiceId: invoice?.invoiceId,
        paidAmount: invoice?.amount,
        currency: invoice?.currency,
        receiptData: invoice?.receiptData,
        // Event Data (from ticketData)
        event: ticketData.eventName,
        ticketStatus: ticketData.status,
      };

      let eventId: any = invoice?.event;
      
      // Fallback: Find event by name if ID is missing in invoice (legacy data)
      if (!eventId && invoice?.metadata?.eventName) {
        const { Event: EventModel } = await import('../models/events.model');
        const eventRecord = await EventModel.findOne({ name: invoice.metadata.eventName });
        if (eventRecord) {
          eventId = eventRecord._id as any;
        }
      }

      // Fetch full event details immediately for rich response
      let fullEvent = null;
      if (eventId) {
        const { Event: EventModel } = await import('../models/events.model');
        fullEvent = await EventModel.findById(eventId);
      }

      if (ticketData.status === 'used' || ticketData.status === 'expired') {
        const { EventRegistration } = await import('../models/event-registration.model');
        const reg = await EventRegistration.findOne({ user: invoice?.user, event: eventId });
        
        return res.status(400).json({
          success: false,
          message: ticketData.status === 'expired' ? 'This ticket has expired' : 'Ticket has already been used',
          data: { 
            ...attendeeInfo, 
            usedAt: reg?.checkedInAt,
            eventDetails: fullEvent ? {
              location: fullEvent.location,
              date: fullEvent.date,
              capacity: fullEvent.capacity
            } : null
          }
        });
      }

      if (!invoice || !eventId) {
        return res.status(404).json({ success: false, message: 'Associated event not found', data: attendeeInfo });
      }

      // 3. Find and update the registration
      const { EventRegistration } = await import('../models/event-registration.model');
      let registration = await EventRegistration.findOne({
        user: invoice.user,
        event: eventId as any
      });

      // Fallback for registration if not found by ID
      if (!registration) {
          registration = await EventRegistration.findOne({
              user: invoice.user,
          }).populate('event');
      }

      if (!registration) {
        return res.status(404).json({ success: false, message: 'Registration not found', data: attendeeInfo });
      }

      if (registration.checkedIn) {
        return res.status(400).json({ 
          success: false, 
          message: 'User already checked in',
          data: { ...attendeeInfo, usedAt: registration.checkedInAt }
        });
      }

      registration.checkedIn = true;
      registration.checkedInAt = new Date();
      await registration.save();
      
      console.log(`Ticket marked as used: ${ticketData.invoiceId} for user ${user?.fullName}`);

      return res.status(200).json({
        success: true,
        message: 'Checked in successfully!',
        data: {
          ...attendeeInfo,
          usedAt: registration.checkedInAt,
          eventDetails: fullEvent ? {
            location: fullEvent.location,
            date: fullEvent.date,
            capacity: fullEvent.capacity
          } : null
        }
      });

    } catch (error: any) {
      console.error('Mark ticket used error:', error.message);
      
      return res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to mark ticket as used' 
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

  /**
   * Mark attendee as checked in manually by registration ID
   * POST /ticket/checkin/:registrationId
   */
  public async checkInManual(req: Request, res: Response) {
    try {
      const { registrationId } = req.params;

      if (!registrationId) {
        return res.status(400).json({ success: false, message: 'Registration ID is required' });
      }

      const { EventRegistration } = await import('../models/event-registration.model');
      const registration = await EventRegistration.findById(registrationId);

      if (!registration) {
        return res.status(404).json({ success: false, message: 'Registration not found' });
      }

      if (registration.checkedIn) {
        return res.status(400).json({ success: false, message: 'User already checked in' });
      }

      registration.checkedIn = true;
      registration.checkedInAt = new Date();
      await registration.save();

      // Find user to return name
      const { Registration } = await import('../models/user.model');
      const user = await Registration.findById(registration.user);

      return res.status(200).json({
        success: true,
        message: 'Manual check-in successful',
        data: {
          userName: user?.fullName || 'User',
          usedAt: registration.checkedInAt
        }
      });
    } catch (error: any) {
      console.error('Manual check-in error:', error.message);
      return res.status(500).json({ success: false, message: error.message || 'Failed to check in manually' });
    }
  }
}
