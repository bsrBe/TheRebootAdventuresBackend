import { Request, Response } from 'express';
import { AuthService } from '../../services/auth.service';
import { validationResult } from 'express-validator';
import { RequestUser, isAdmin } from '../../middleware/auth.middleware';

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export class AdminAuthController {
  static async inviteAdmin(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, role } = req.body;
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }
      if (!isAdmin(req.user)) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }
      await AuthService.inviteAdmin(req.user, email, role);
      res.json({ success: true, message: 'Invitation sent successfully' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async setupAccount(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { token, password, firstName, lastName } = req.body;
      const result = await AuthService.setupAccount(token, password, firstName, lastName);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(401).json({ success: false, message: error.message });
    }
  }

  static async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      const result = await AuthService.refreshToken(refreshToken);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(401).json({ success: false, message: error.message });
    }
  }

  static async getProfile(req: Request, res: Response) {
    try {
      res.json({ success: true, data: req.user });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateProfile(req: Request, res: Response) {
    try {
      const { firstName, lastName, email } = req.body;
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }
      const result = await AuthService.updateProfile(req.user._id, { firstName, lastName, email });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const result = await AuthService.forgotPassword(email);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async resetPassword(req: Request, res: Response) {
    try {
      const { token, newPassword } = req.body;
      const result = await AuthService.resetPassword(token, newPassword);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async changePassword(req: Request, res: Response) {
    try {
      const { oldPassword, newPassword } = req.body;
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }
      const result = await AuthService.changePassword(req.user._id, oldPassword, newPassword);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
