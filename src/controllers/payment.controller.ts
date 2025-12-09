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
   * Debug Telebirr transaction scraping
   */
  public async debugTelebirrScraping(req: Request, res: Response) {
    try {
      const { transactionId } = req.body;
      
      if (!transactionId) {
        return res.status(400).json({ message: 'Transaction ID is required' });
      }

      // Import Telebirr service
      const { telebirrService } = await import('../services/telebirr.service');
      
      // Add debugging to see what's being scraped
      const axios = require('axios');
      const cheerio = require('cheerio');
      
      const url = `https://transactioninfo.ethiotelecom.et/receipt/${transactionId}`;
      console.log('Debugging URL:', url);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 30000
      });
      
      const $ = cheerio.load(response.data);
      
      // Get all text content for debugging
      const allText = $('body').text();
      const allTables: string[][][] = [];
      
      $('table').each((i: number, table: any) => {
        const tableData: string[][] = [];
        $(table).find('tr').each((j: number, row: any) => {
          const rowData: string[] = [];
          $(row).find('td, th').each((k: number, cell: any) => {
            rowData.push($(cell).text().trim());
          });
          tableData.push(rowData);
        });
        allTables.push(tableData);
      });
      
      // Try to get the receipt data
      try {
        const receipt = await telebirrService.verifyTransaction(transactionId);
        return res.status(200).json({
          success: true,
          data: {
            url,
            allText: allText.substring(0, 1000) + '...', // First 1000 chars
            tables: allTables,
            receipt
          }
        });
      } catch (error: any) {
        return res.status(200).json({
          success: false,
          data: {
            url,
            allText: allText.substring(0, 1000) + '...',
            tables: allTables,
            error: error.message
          }
        });
      }
      
    } catch (error: any) {
      console.error('Debug scraping error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to debug scraping'
      });
    }
  }

  /**
   * Verify payment manually via transaction ID
   */
  public async verifyPayment(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { transactionId, userId } = req.body;

      // Verify payment
      const result = await paymentService.verifyPayment(transactionId, userId);
      
      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.invoice ? { invoice: result.invoice } : undefined
      });
    } catch (error: any) {
      console.error('Error verifying payment:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to verify payment'
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
