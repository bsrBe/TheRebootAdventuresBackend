import { Router } from 'express';
import { body, param } from 'express-validator';
import { paymentController } from '../controllers/payment.controller';
import { validate } from '../middleware/validation.middleware';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @route POST /api/payments/initialize
 * @desc Initialize a new payment
 * @access Private
 */
router.post(
  '/initialize',
  authenticate,
  validate([
    body('userId').isMongoId().withMessage('Valid user ID is required'),
    body('eventName').trim().notEmpty().withMessage('Event name is required'),
    body('amount').isNumeric().withMessage('Valid amount is required'),
    body('place').trim().notEmpty().withMessage('Place is required'),
    body('time').isISO8601().withMessage('Valid time is required'),
  ]),
  paymentController.initializePayment
);

/**
 * @route GET /api/payments/verify/:reference
 * @desc Verify a payment (webhook)
 * @access Public (Chapa will call this)
 */
router.get(
  '/verify/:reference',
  validate([
    param('reference').trim().notEmpty().withMessage('Reference is required')
  ]),
  paymentController.verifyPayment
);

/**
 * @route GET /api/payments/status/:reference
 * @desc Get payment status
 * @access Private
 */
router.get(
  '/status/:reference',
  authenticate,
  validate([
    param('reference').trim().notEmpty().withMessage('Reference is required')
  ]),
  paymentController.getPaymentStatus
);

/**
 * @route GET /api/payments/invoices/user/:userId
 * @desc Get all invoices for a user
 * @access Private
 */
router.get(
  '/invoices/user/:userId',
  authenticate,
  validate([
    param('userId').isMongoId().withMessage('Valid user ID is required')
  ]),
  paymentController.getUserInvoices
);

/**
 * @route GET /api/payments/invoices/:invoiceId
 * @desc Get invoice by ID
 * @access Private
 */
router.get(
  '/invoices/:invoiceId',
  authenticate,
  validate([
    param('invoiceId').trim().notEmpty().withMessage('Invoice ID is required')
  ]),
  paymentController.getInvoiceById
);

/**
 * @route GET /api/payments/invoices
 * @desc Get all invoices (admin only)
 * @access Private (Admin only)
 */
router.get(
  '/invoices',
  authenticate,
  paymentController.getAllInvoices
);

/**
 * @route GET /api/payments/success
 * @desc Payment success page
 * @access Public
 */
router.get(
  '/success',
  paymentController.paymentSuccess
);

// Route to bulk initialize payments (Admin only)
router.post(
  '/bulk-initialize',
  authenticate,
  // Add admin check middleware here if available, e.g. requireAdmin
  paymentController.bulkInitializePayment
);

export default router;
