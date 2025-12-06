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
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        const url = `${this.baseUrl}/${transactionId}`;
        console.log(`Scraping Telebirr receipt (Attempt ${attempt + 1}/${maxRetries}): ${url}`);

        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          timeout: 60000 // Increased to 60 seconds
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
        console.error(`Telebirr verification failed for ${transactionId} (Attempt ${attempt + 1}):`, error.message);
        
        // If it's a timeout or network error, retry
        if (error.code === 'ECONNABORTED' || error.response?.status >= 500) {
          attempt++;
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
            continue;
          }
        }
        
        // If it's a specific error like "Invalid transaction ID", throw immediately
        if (error.message === 'Invalid transaction ID') {
             throw error;
        }
        
        throw new Error('Failed to verify transaction. Please check the ID and try again.');
      }
    }
    throw new Error('Failed to verify transaction after multiple attempts.');
  }
}

export const telebirrService = new TelebirrService();
