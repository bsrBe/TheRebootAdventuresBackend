import axios from 'axios';
import * as cheerio from 'cheerio';

export interface TelebirrReceipt {
  transactionId: string;
  senderName: string;
  receiverName?: string;
  amount: number;
  date: string;
  status: 'valid' | 'invalid';
}

export class TelebirrService {
  private readonly baseUrl = 'https://transactioninfo.ethiotelecom.et/receipt';

  /**
   * Verify a Telebirr transaction by scraping the receipt page
   */
  async verifyTransaction(transactionId: string): Promise<TelebirrReceipt> {
    try {
      const url = `${this.baseUrl}/${transactionId}`;
      console.log(`Scraping Telebirr receipt: ${url}`);

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data as string);
      
      // Check if page indicates invalid transaction
      if ($('body').text().includes('Transaction not found') || response.status !== 200) {
        throw new Error('Invalid transaction ID');
      }

      // Extract data - Note: Selectors need to be adjusted based on actual page structure
      // Assuming a standard key-value structure in tables or divs
      
      // Helper to find value by label
      const findValueByLabel = (label: string): string => {
        // Look for elements containing the label, then find the corresponding value
        // This is a generic approach; might need refinement
        const labelEl = $(`*:contains("${label}")`).last();
        if (labelEl.length) {
            // Try next sibling or parent's next sibling
            let value = labelEl.next().text().trim();
            if (!value) value = labelEl.parent().next().text().trim(); // If label is in a td/div
            if (!value) value = labelEl.parent().find('.value, span:not(.label)').text().trim();
            return value;
        }
        return '';
      };

      // These selectors are hypothetical and MUST be verified against real HTML
      const senderName = findValueByLabel('Payer') || findValueByLabel('Sender') || 'Unknown';
      const receiverName = findValueByLabel('Receiver') || findValueByLabel('Payee') || 'Unknown';
      const amountStr = findValueByLabel('Amount') || '0';
      const date = findValueByLabel('Date') || findValueByLabel('Time') || new Date().toISOString();

      // Clean amount string (remove ETB, commas)
      const amount = parseFloat(amountStr.replace(/[^0-9.]/g, ''));

      if (!amount) {
          throw new Error('Could not parse amount from receipt');
      }

      return {
        transactionId,
        senderName,
        receiverName,
        amount,
        date,
        status: 'valid'
      };

    } catch (error: any) {
      console.error(`Telebirr verification failed for ${transactionId}:`, error.message);
      throw new Error('Failed to verify transaction. Please check the ID and try again.');
    }
  }
}

export const telebirrService = new TelebirrService();
