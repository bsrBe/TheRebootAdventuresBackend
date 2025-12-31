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
        data: invoices
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

      const { transactionId, userId, method } = req.body;

      // Verify payment
      const result = await paymentService.verifyPayment(transactionId, userId, method);
      
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
   * Export invoices as CSV or PDF
   */
  public async exportInvoices(req: Request, res: Response) {
    try {
      const formatParam = (req.query.format as string | undefined)?.toLowerCase() || 'csv';
      const status = req.query.status as string | undefined;

      // Import Invoice model
      const { Invoice } = await import('../models/invoice.model');

      const query: any = {};
      if (status && status !== 'all') {
        query.status = status;
      }

      const invoices = await Invoice.find(query)
        .populate('user', 'fullName email phoneNumber')
        .sort({ createdAt: -1 })
        .lean();

      if (formatParam === 'csv') {
        const header = 'Invoice ID,User,Amount,Status,Event,Date';
        const csvLines = invoices.map((inv: any) => {
          const userName = typeof inv.user === 'object' ? inv.user.fullName : 'Unknown';
          const eventName = inv.metadata?.eventName || '-';
          const date = inv.createdAt ? new Date(inv.createdAt).toISOString() : '-';
          
          return [inv.invoiceId, userName, inv.amount, inv.status, eventName, date]
            .map((val) => {
              const s = val ?? '';
              if (/[",\n]/.test(String(s))) {
                return '"' + String(s).replace(/"/g, '""') + '"';
              }
              return String(s);
            })
            .join(',');
        });

        const csv = [header, ...csvLines].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="invoices_export_${new Date().toISOString().split('T')[0]}.csv"`);
        return res.status(200).send(csv);
      }

      if (formatParam === 'pdf') {
        const PDFDocument = (await import('pdfkit')).default as any;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoices_export_${new Date().toISOString().split('T')[0]}.pdf"`);

        const doc = new PDFDocument({ margin: 40, layout: 'landscape' });
        doc.pipe(res);

        // font registration
        let fontName = 'Helvetica';
        let fontBold = 'Helvetica-Bold';
        try {
          const amharicFontPath = '/usr/share/fonts/google-droid-sans-fonts/DroidSansEthiopic-Regular.ttf';
          const amharicFontBoldPath = '/usr/share/fonts/google-droid-sans-fonts/DroidSansEthiopic-Bold.ttf';
          doc.registerFont('Amharic', amharicFontPath);
          doc.registerFont('Amharic-Bold', amharicFontBoldPath);
          fontName = 'Amharic';
          fontBold = 'Amharic-Bold';
        } catch (err) { /* ignore */ }

        doc.font(fontBold).fontSize(18).text('Finance Report - Invoices', { align: 'center' });
        doc.moveDown();

        const tableTop = doc.y + 10;
        const rowHeight = 25;
        const columnWidths = [120, 150, 150, 80, 80, 140]; // InvoiceID, User, Event, Amount, Status, Date
        const startX = doc.page.margins.left;

        const drawRowBackground = (y: number, isHeader = false) => {
          doc.rect(startX, y, columnWidths.reduce((a, b) => a + b, 0), rowHeight)
            .fillOpacity(isHeader ? 0.1 : 0.03)
            .fill('#000000')
            .fillOpacity(1);
        };

        const drawCellText = (text: string, x: number, y: number, width: number, isHeader = false) => {
          doc
            .fontSize(10)
            .font(isHeader ? fontBold : fontName)
            .fillColor('#000000')
            .text(text, x + 5, y + 8, { width: width - 10, ellipsis: true });
        };

        // Header
        let y = tableTop;
        drawRowBackground(y, true);
        const headers = ['Invoice ID', 'User', 'Event', 'Amount', 'Status', 'Date'];
        let x = startX;
        headers.forEach((h, i) => {
          drawCellText(h, x, y, columnWidths[i], true);
          x += columnWidths[i];
        });
        y += rowHeight;

        // Rows
        invoices.forEach((inv: any, i: number) => {
          if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            y = doc.page.margins.top;
          }
          if (i % 2 === 0) drawRowBackground(y);
          
          x = startX;
          const userName = typeof inv.user === 'object' ? inv.user.fullName : 'Unknown';
          const values = [
            inv.invoiceId,
            userName,
            inv.metadata?.eventName || '-',
            `${inv.amount} ETB`,
            inv.status.toUpperCase(),
            inv.createdAt ? new Date(inv.createdAt).toLocaleString() : '-'
          ];

          values.forEach((v, idx) => {
            drawCellText(String(v), x, y, columnWidths[idx]);
            x += columnWidths[idx];
          });
          y += rowHeight;
        });

        doc.end();
        return;
      }

      return res.status(400).json({ success: false, message: 'Invalid format. Use csv or pdf.' });
    } catch (error: any) {
      console.error('Export invoices error:', error);
      return res.status(500).json({ success: false, message: error.message });
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
