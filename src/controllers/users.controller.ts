import { Request, Response } from 'express';
import { IRegistration, IRegistrationInput } from '../interfaces/user.interface';
import { Registration } from '../models/user.model';
import { EventRegistration } from '../models/event-registration.model';
import { Error as MongooseError } from 'mongoose';

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const registrationData: IRegistrationInput = {
      ...req.body,
      telegramData: req.body.telegramData || null
    };

    // Check if user with this Telegram ID already exists
    if (registrationData.telegramData?.id) {
      const existingUser = await Registration.findOne({ 'telegramData.id': registrationData.telegramData.id });
      if (existingUser) {
        res.status(400).json({
          success: false,
          error: 'You are already registered with this Telegram account'
        });
        return;
      }
    }
    
    const registration = new Registration(registrationData);
    await registration.save();
    
    res.status(201).json({
      success: true,
      data: registration
    });
  } catch (error: unknown) {
    if (error instanceof MongooseError.ValidationError) {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({
        success: false,
        error: messages
      });
      return;
    }
    
    if ((error as any).code === 11000) {
      res.status(400).json({
        success: false,
        error: 'Email or phone number already registered'
      });
      return;
    }
    
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

/**
 * @desc Export users as CSV or PDF
 * @route GET /api/users/export?format=csv|pdf
 * @access Admin (protected in router)
 */
export const exportUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const format = (req.query.format as string | undefined)?.toLowerCase() || 'csv';

    const users = await Registration.find()
      .select('fullName email phoneNumber telegramData')
      .sort({ createdAt: -1 })
      .lean();

    const rows = users.map((u: any) => ({
      fullName: u.fullName,
      email: u.email,
      phoneNumber: u.phoneNumber,
      telegramHandle: u.telegramData?.username || u.telegramData?.id || '',
    }));

    if (format === 'csv') {
      const header = 'Full Name,Email,Phone Number,Telegram Handle';
      const csvLines = rows.map((r) => [r.fullName, r.email, r.phoneNumber, r.telegramHandle]
        .map((val) => {
          const s = val ?? '';
          if (/[",\n]/.test(String(s))) {
            return '"' + String(s).replace(/"/g, '""') + '"';
          }
          return String(s);
        })
        .join(','));

      const csv = [header, ...csvLines].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');
      res.status(200).send(csv);
      return;
    }

    if (format === 'pdf') {
      // Lazy-load pdfkit so it is only required when needed
      const PDFDocument = (await import('pdfkit')).default as any;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="users_export.pdf"');

      const doc = new PDFDocument({ margin: 40 });
      doc.pipe(res);

      // Try to register Amharic font if it exists on system
      let fontName = 'Helvetica';
      let fontBold = 'Helvetica-Bold';
      try {
        const amharicFontPath = '/usr/share/fonts/google-droid-sans-fonts/DroidSansEthiopic-Regular.ttf';
        const amharicFontBoldPath = '/usr/share/fonts/google-droid-sans-fonts/DroidSansEthiopic-Bold.ttf';
        doc.registerFont('Amharic', amharicFontPath);
        doc.registerFont('Amharic-Bold', amharicFontBoldPath);
        fontName = 'Amharic';
        fontBold = 'Amharic-Bold';
      } catch (err) {
        console.warn('Amharic font not found, falling back to Helvetica');
      }

      // Title
      doc.font(fontBold).fontSize(18).text('Users Export', { align: 'center' });
      doc.moveDown();

      // Simple table layout
      const tableTop = doc.y + 10;
      const rowHeight = 20;
      const columnWidths = [150, 170, 90, 100]; // FullName, Email, Phone, Telegram
      const startX = doc.page.margins.left;

      const drawRowBackground = (y: number) => {
        doc.rect(startX, y, columnWidths.reduce((a, b) => a + b, 0), rowHeight).fillOpacity(0.03).fill('#000000').fillOpacity(1);
      };

      const drawRowBorder = (y: number) => {
        doc.moveTo(startX, y)
          .lineTo(startX + columnWidths.reduce((a, b) => a + b, 0), y)
          .strokeColor('#cccccc')
          .lineWidth(0.5)
          .stroke();
      };

      const drawCellText = (text: string, x: number, y: number, width: number, isHeader = false) => {
        doc
          .fontSize(10)
          .font(isHeader ? fontBold : fontName)
          .fillColor('#000000')
          .text(text, x + 4, y + 5, {
            width: width - 8,
            ellipsis: true,
          });
      };

      // Header row
      let y = tableTop;
      drawRowBackground(y);
      drawRowBorder(y);

      const headers = ['Full Name', 'Email', 'Phone', 'Telegram'];
      let x = startX;
      headers.forEach((header, idx) => {
        drawCellText(header, x, y, columnWidths[idx], true);
        x += columnWidths[idx];
      });

      y += rowHeight;
      drawRowBorder(y);

      // Data rows
      rows.forEach((r, rowIndex) => {
        if (rowIndex % 2 === 0) {
          drawRowBackground(y);
        }

        x = startX;
        const values = [r.fullName || '', r.email || '', r.phoneNumber || '', r.telegramHandle || ''];
        values.forEach((val, idx) => {
          drawCellText(String(val), x, y, columnWidths[idx]);
          x += columnWidths[idx];
        });

        y += rowHeight;

        // Add page break if needed
        if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
          drawRowBorder(y);
          doc.addPage();
          y = tableTop;

          // Redraw header on new page
          drawRowBackground(y);
          drawRowBorder(y);
          x = startX;
          headers.forEach((header, idx) => {
            drawCellText(header, x, y, columnWidths[idx], true);
            x += columnWidths[idx];
          });
          y += rowHeight;
          drawRowBorder(y);
        } else {
          drawRowBorder(y);
        }
      });

      doc.end();
      return;
    }

    res.status(400).json({ success: false, error: 'Invalid format. Use csv or pdf.' });
  } catch (error) {
    console.error('Export users error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
};

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const registrations: IRegistration[] = await Registration.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      count: registrations.length,
      data: registrations
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

export const getUserByTelegramId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = await Registration.findOne({ 'telegramData.id': Number(id) });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
      return;
    }

    // Fetch user's event registrations
    const registrations = await EventRegistration.find({ user: user._id })
      .select('event status registrationDate')
      .lean();

    // Format registrations to match the old structure
    const registeredEvents = registrations.map(reg => ({
      eventId: reg.event.toString(),
      status: reg.status,
      registeredAt: reg.registrationDate
    }));

    res.json({
      success: true,
      data: {
        ...user.toJSON(),
        registeredEvents
      }
    });
  } catch (error) {
    console.error('Get user by Telegram ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

/**
 * @desc Update a user (admin only)
 * @route PUT /api/users/:id
 */
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const updateData = req.body;
    const user = await Registration.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, message: 'User updated', data: user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * @desc Delete a user (admin only)
 * @route DELETE /api/users/:id
 */
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await Registration.findByIdAndDelete(req.params.id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
