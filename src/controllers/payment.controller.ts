import { Request, Response } from 'express';
import { paymentService } from '../services/payment.service';
import { Registration } from '../models/user.model';
import { IInvoice, IInvoiceBase } from '../interfaces/user.interface';
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
        time: new Date(time),
        chapaLink: '' // Will be set by the service
      } as const;
      
      const paymentData = await paymentService.initializePayment(user, invoiceData);
      
      const { paymentLink, invoiceId } = paymentData;

      return res.status(200).json({
        success: true,
        data: {
          paymentLink,
          invoiceId
        }
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
   * Verify a payment (Chapa webhook)
   */
  public async verifyPayment(req: Request, res: Response) {
    try {
      const { reference } = req.params;
      
      const result = await paymentService.verifyPayment(reference);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          invoice: result.invoice
        }
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
   * Get payment status
   */
  public async getPaymentStatus(req: Request, res: Response) {
    try {
      const { reference } = req.params;
      
      const { status, invoice } = await paymentService.getPaymentStatus(reference);
      
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
      
      const user = await Registration.findById(userId).select('invoices');
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        data: {
          invoices: user.invoices
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
      
      const user = await Registration.findOne({
        _id: userId,
        'invoices.invoiceId': invoiceId
      });

      if (!user) {
        return res.status(404).json({ message: 'Invoice not found' });
      }

      const invoice = user.invoices.find(inv => inv.invoiceId === invoiceId);
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
      
      // Build the query
      const query: any = { 'invoices': { $exists: true, $not: { $size: 0 } } };
      if (status) {
        query['invoices.status'] = status;
      }

      // Find users with invoices
      const users = await Registration.find(query).lean();

      // Process the results
      const result = users.flatMap(user => {
        if (!user.invoices || !Array.isArray(user.invoices)) return [];
        
        return user.invoices
          .filter(invoice => {
            if (!invoice || typeof invoice !== 'object') return false;
            return !status || invoice.status === status;
          })
          .map(invoice => ({
            _id: invoice._id?.toString() || '',
            invoice: {
              _id: invoice._id?.toString() || '',
              userId: user._id?.toString() || '',
              invoiceId: invoice.invoiceId || '',
              eventName: invoice.eventName || '',
              amount: invoice.amount || 0,
              place: invoice.place || '',
              time: invoice.time ? new Date(invoice.time) : new Date(),
              chapaLink: invoice.chapaLink || '',
              status: invoice.status || 'pending',
              createdAt: invoice.createdAt ? new Date(invoice.createdAt) : new Date(),
              updatedAt: invoice.updatedAt ? new Date(invoice.updatedAt) : new Date(),
              paidAt: invoice.paidAt ? new Date(invoice.paidAt) : null,
              chapaReference: invoice.chapaReference,
              metadata: invoice.metadata || {}
            },
            user: {
              id: user._id?.toString() || '',
              fullName: user.fullName || '',
              email: user.email || '',
              phoneNumber: user.phoneNumber || ''
            }
          }));
      });

      return res.status(200).json({
        success: true,
        data: {
          invoices: result
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
   * Handle payment success redirect
   */
  public async paymentSuccess(req: Request, res: Response) {
    try {
      // Get the transaction reference from the query parameters (Chapa sends it as tx_ref)
      const { tx_ref } = req.query;
      console.log('PaymentSuccess: Received query params:', req.query);
      console.log('PaymentSuccess: tx_ref:', tx_ref);
      
      let paymentDetails = null;
      let userDetails = null;

      if (tx_ref && typeof tx_ref === 'string') {
        // Find the user and invoice associated with this reference
        const user = await Registration.findOne({
          'invoices.chapaReference': tx_ref
        });

        if (user) {
          const invoice = user.invoices.find(inv => inv.chapaReference === tx_ref);
          if (invoice) {
            paymentDetails = invoice;
            userDetails = {
              fullName: user.fullName,
              email: user.email,
              phoneNumber: user.phoneNumber
            };
            
            // If status is still pending, we might want to verify it now
            if (invoice.status === 'pending') {
               try {
                 const verification = await paymentService.verifyPayment(tx_ref);
                 if (verification.success && verification.invoice) {
                   paymentDetails = verification.invoice;
                 }
               } catch (err) {
                 console.error('Auto-verification failed on success page:', err);
               }
            }
          }
        }
      }
      
      const html = `
        <html>
          <head>
            <title>Payment Receipt</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                text-align: center; 
                padding: 0;
                margin: 0;
                background-color: #f4f7f6;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
              }
              .container {
                background: white;
                padding: 40px;
                border-radius: 15px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.05);
                max-width: 500px;
                width: 90%;
              }
              .success-icon { 
                color: #4CAF50; 
                font-size: 60px; 
                margin-bottom: 15px;
                line-height: 1;
              }
              h1 { 
                color: #333; 
                margin-bottom: 5px;
                font-size: 24px;
              }
              .subtitle { 
                color: #666; 
                margin-bottom: 25px;
                font-size: 14px;
              }
              .receipt-box {
                background-color: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 10px;
                padding: 20px;
                margin-bottom: 25px;
                text-align: left;
              }
              .section-title {
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #adb5bd;
                margin-bottom: 10px;
                font-weight: 700;
                border-bottom: 1px solid #e9ecef;
                padding-bottom: 5px;
              }
              .details-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 10px;
                font-size: 14px;
              }
              .details-row:last-child {
                margin-bottom: 0;
              }
              .label {
                color: #6c757d;
              }
              .value {
                font-weight: 600;
                color: #212529;
                text-align: right;
              }
              .amount-row {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 2px dashed #dee2e6;
                font-size: 18px;
              }
              .amount-value {
                color: #4CAF50;
                font-weight: 700;
              }
              .btn { 
                display: inline-block; 
                padding: 12px 30px; 
                background-color: #333; 
                color: white; 
                text-decoration: none; 
                border-radius: 25px; 
                font-weight: 600;
                transition: background-color 0.3s;
                font-size: 14px;
              }
              .btn:hover {
                background-color: #000;
              }
              .print-btn {
                background-color: transparent;
                color: #6c757d;
                border: 1px solid #ced4da;
                margin-left: 10px;
              }
              .print-btn:hover {
                background-color: #f8f9fa;
                color: #333;
              }
              .status-badge {
                display: inline-block;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                background-color: #d4edda;
                color: #155724;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✓</div>
              <h1>Payment Successful</h1>
              <p class="subtitle">Your transaction has been completed.</p>
              
              ${paymentDetails ? `
              <div class="receipt-box">
                <div class="section-title">Customer Details</div>
                <div class="details-row">
                  <span class="label">Name</span>
                  <span class="value">${userDetails?.fullName || 'N/A'}</span>
                </div>
                <div class="details-row">
                  <span class="label">Email</span>
                  <span class="value">${userDetails?.email || 'N/A'}</span>
                </div>
                <div class="details-row">
                  <span class="label">Phone</span>
                  <span class="value">${userDetails?.phoneNumber || 'N/A'}</span>
                </div>

                <div class="section-title" style="margin-top: 20px;">Payment Details</div>
                <div class="details-row">
                  <span class="label">Event</span>
                  <span class="value">${paymentDetails.eventName}</span>
                </div>
                <div class="details-row">
                  <span class="label">Invoice ID</span>
                  <span class="value">${paymentDetails.invoiceId}</span>
                </div>
                <div class="details-row">
                  <span class="label">Reference</span>
                  <span class="value" style="font-family: monospace;">${paymentDetails.chapaReference}</span>
                </div>
                <div class="details-row">
                  <span class="label">Date</span>
                  <span class="value">${paymentDetails.createdAt ? new Date(paymentDetails.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</span>
                </div>
                <div class="details-row">
                  <span class="label">Status</span>
                  <span class="value"><span class="status-badge">${paymentDetails.status.toUpperCase()}</span></span>
                </div>

                <div class="details-row amount-row">
                  <span class="label">Total Amount</span>
                  <span class="value amount-value">${paymentDetails.amount} ETB</span>
                </div>
              </div>
              ` : `
              <div class="receipt-box">
                <p style="text-align: center; color: #666;">Payment details could not be loaded. Please check your email for confirmation.</p>
                <p style="text-align: center; font-family: monospace; font-size: 12px; color: #999;">Ref: ${tx_ref || 'N/A'}</p>
              </div>
              `}

              <a href="/" class="btn">Return to Home</a>
              <button onclick="window.print()" class="btn print-btn">Print Receipt</button>
            </div>
          </body>
        </html>
      `;
      
      res.send(html);
    } catch (error) {
      console.error('Error rendering success page:', error);
      res.status(500).send('An error occurred while rendering the success page.');
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
