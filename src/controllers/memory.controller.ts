import { Request, Response } from 'express';
import { Memory } from '../models/memory.model';
import { TelegramService } from '../services/telegram.service';

export class MemoryController {
  private telegramService: TelegramService;

  constructor() {
    this.telegramService = new TelegramService();
  }

  /**
   * Get all memories for admin
   */
  public async getMemories(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const isApproved = req.query.isApproved === 'true' ? true : req.query.isApproved === 'false' ? false : undefined;
      const skip = (page - 1) * limit;

      const query: any = {};
      if (isApproved !== undefined) {
        query.isApproved = isApproved;
      }

      const [memories, total] = await Promise.all([
        Memory.find(query)
          .populate('user', 'fullName email')
          .populate('event', 'name')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Memory.countDocuments(query)
      ]);

      // Transform photoUrl to use our proxy if it's a telegram link or if we have fileId
      const memoriesWithProxy = memories.map(m => {
        const obj = m.toObject();
        if (m.telegramFileId) {
          // Point to our proxy endpoint
          const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
          obj.photoUrl = `${baseUrl}/api/memories/${m._id}/photo`;
        }
        return obj;
      });

      return res.status(200).json({
        success: true,
        data: memoriesWithProxy,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error: any) {
      console.error('Get memories error:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch memories' });
    }
  }

  /**
   * Proxy/Redirect to a fresh telegram photo URL
   */
  public async getMemoryPhoto(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const memory = await Memory.findById(id);

      if (!memory || !memory.telegramFileId) {
        return res.status(404).send('Photo not found');
      }

      // Refresh the URL from Telegram using the service
      const freshUrl = await this.telegramService.getFileUrl(memory.telegramFileId);

      if (!freshUrl) {
        return res.status(500).send('Failed to refresh photo URL');
      }

      // Redirect to the temporary but fresh Telegram URL
      return res.redirect(freshUrl);
    } catch (error: any) {
      console.error('Proxy photo error:', error.message);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * Approve a memory
   */
  public async approveMemory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { isApproved } = req.body;

      const memory = await Memory.findByIdAndUpdate(id, { isApproved }, { new: true });
      
      if (!memory) {
        return res.status(404).json({ success: false, message: 'Memory not found' });
      }

      return res.status(200).json({
        success: true,
        message: isApproved ? 'Memory approved' : 'Memory unapproved',
        data: memory
      });
    } catch (error: any) {
      console.error('Approve memory error:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to update memory' });
    }
  }

  /**
   * Delete a memory
   */
  public async deleteMemory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const memory = await Memory.findByIdAndDelete(id);

      if (!memory) {
        return res.status(404).json({ success: false, message: 'Memory not found' });
      }

      return res.status(200).json({
        success: true,
        message: 'Memory deleted'
      });
    } catch (error: any) {
      console.error('Delete memory error:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to delete memory' });
    }
  }

  /**
   * Get approved memories for public gallery
   */
  public async getPublicMemories(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const [memories, total] = await Promise.all([
        Memory.find({ isApproved: true })
          .populate('event', 'name')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Memory.countDocuments({ isApproved: true })
      ]);

      // Transform photoUrl to use our proxy if it's a telegram link or if we have fileId
      const memoriesWithProxy = memories.map(m => {
        const obj = m.toObject();
        if (m.telegramFileId) {
          // Point to our proxy endpoint
          const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
          obj.photoUrl = `${baseUrl}/api/memories/${m._id}/photo`;
        }
        return obj;
      });

      return res.status(200).json({
        success: true,
        data: memoriesWithProxy,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error: any) {
      console.error('Get public memories error:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch gallery' });
    }
  }
}

export const memoryController = new MemoryController();
