import { Request, Response } from 'express';
import { paymentService } from '../services/payment.service';
import { Registration } from '../models/user.model';

import { check, validationResult } from 'express-validator';
import { isAdmin } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';

export class PaymentController {
  /**
   * Initialize a new payment
   */
  public async initializePayment(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { userId, eventName, amount, place, time } = req.body;

      // Find the user
      const user = await Registration.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Initialize payment
      const invoiceData = {
        eventName,
        amount,
        place,
        time: new Date(time)
      } as const;
      
      const result = await paymentService.initializePayment(user, invoiceData);
      
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error initializing payment:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to initialize payment'
      });
    }
  }

  /**
   * Get payment status
   */
  public async getPaymentStatus(req: Request, res: Response) {
    try {
      const { invoiceId } = req.params;
      
      const { status } = await paymentService.getPaymentStatus(invoiceId);
      let invoice = null;
      
      if (status !== 'not_found') {
         const { Invoice } = await import('../models/invoice.model');
         invoice = await Invoice.findOne({ invoiceId });
      }
      
      if (status === 'not_found') {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          status,
          invoice
        }
      });
    } catch (error: any) {
      console.error('Error getting payment status:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get payment status'
      });
    }
  }

  /**
   * Get user invoices
   */
  public async getUserInvoices(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      
      // Import Invoice model
      const { Invoice } = await import('../models/invoice.model');
      
      const invoices = await Invoice.find({ user: userId }).sort({ createdAt: -1 });

      return res.status(200).json({
        success: true,
        data: {
          invoices
        }
      });
    } catch (error: any) {
      console.error('Error getting user invoices:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user invoices'
      });
    }
  }

  /**
   * Get invoice by ID
   */
  public async getInvoiceById(req: Request, res: Response) {
    try {
      const { userId, invoiceId } = req.params;
      
      // Import Invoice model
      const { Invoice } = await import('../models/invoice.model');
      
      const invoice = await Invoice.findOne({ 
        user: userId,
        invoiceId: invoiceId 
      });

      if (!invoice) {
        return res.status(404).json({ message: 'Invoice not found' });
      }

      return res.status(200).json({
        success: true,
        data: {
          invoice
        }
      });
    } catch (error: any) {
      console.error('Error getting invoice:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get invoice'
      });
    }
  }

  /**
   * Get all invoices (admin only)
   */
  public async getAllInvoices(req: Request, res: Response) {
    try {
      // Check if user is admin
      if (!isAdmin(req.user)) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const { status } = req.query;
      
      // Import Invoice model
      const { Invoice } = await import('../models/invoice.model');

      // Build the query
      const query: any = {};
      if (status) {
        query.status = status;
      }

      // Find invoices and populate user
      const invoices = await Invoice.find(query)
        .populate('user', 'fullName email phoneNumber')
        .sort({ createdAt: -1 });

      return res.status(200).json({
        success: true,
        data: {
          invoices
        }
      });
    } catch (error: any) {
      console.error('Error getting all invoices:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get all invoices'
      });
    }
  }

  /**
   * Bulk initialize payments for an event
   */
  public async bulkInitializePayment(req: Request, res: Response) {
    try {
      const { eventId } = req.body;

      if (!eventId) {
        return res.status(400).json({ success: false, message: 'Event ID is required' });
      }

      const result = await paymentService.bulkInitializePayment(eventId);

      res.status(200).json({
        success: true,
        message: 'Bulk payment initialization completed',
        data: result
      });
    } catch (error) {
      console.error('Error in bulkInitializePayment:', error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to bulk initialize payments' 
      });
    }
  }
}

export const paymentController = new PaymentController();
