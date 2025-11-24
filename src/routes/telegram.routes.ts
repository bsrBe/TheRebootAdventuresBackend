import { Router } from 'express';
import { telegramController } from '../controllers/telegram.controller';

const router = Router();

/**
 * @route POST /api/telegram/webhook
 * @desc Handle Telegram bot webhook updates
 * @access Public (Telegram servers)
 */
router.post('/webhook', telegramController.handleWebhook);

/**
 * @route GET /api/telegram/set-webhook
 * @desc Set Telegram webhook URL (run once)
 * @access Private (Admin)
 */
router.get('/set-webhook', async (req, res) => {
  try {
    const webhookUrl = `${process.env.APP_URL}/api/telegram/webhook`;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
      return res.status(500).json({ success: false, message: 'TELEGRAM_BOT_TOKEN is not set' });
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl })
    });

    const data = await response.json();
    
    return res.status(200).json({
      success: data.ok,
      message: data.description || 'Webhook set successfully',
      data
    });
  } catch (error) {
    console.error('Error setting webhook:', error);
    return res.status(500).json({ success: false, message: 'Failed to set webhook' });
  }
});

export default router;
