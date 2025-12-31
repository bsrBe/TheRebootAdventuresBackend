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
    const maxRetries = 3; // Increased to 3 for better reliability
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
          timeout: 30000 // Increased to 30 seconds
        });

        const $ = cheerio.load(response.data as string);
        
        // Check if page indicates invalid transaction
        if ($('body').text().includes('Transaction not found') || response.status !== 200) {
          throw new Error('Invalid transaction ID');
        }

        // Extract data using specific selectors based on the receipt structure
        
        // 1. Extract Payer/Sender and Receiver
        // Look for "Credited Party name" or "Beneficiary Name" for receiver
        const receiverLabel = $('td:contains("Credited Party name"), div:contains("Credited Party name"), td:contains("Beneficiary Name")').last();
        const receiverName = receiverLabel.next().text().trim() || 
                             receiverLabel.parent().next().text().trim() || 
                             'Unknown';

        const senderLabel = $('td:contains("Payer Name"), div:contains("Payer Name")').last();
        const senderName = senderLabel.next().text().trim() || 
                           senderLabel.parent().next().text().trim() || 
                           'Unknown';

        // 2. Extract Amount and Date from the "Invoice details" table
        // The table has headers in one row and values in the next
        // We look for the header "Settled Amount" and "Payment date"
        
        let amountStr = '0';
        let date = new Date().toISOString();

        // Look for the table containing "Settled Amount" - be more specific
        const settledAmountHeader = $('td:contains("Settled Amount"), th:contains("Settled Amount")').last();
        const amountRow = settledAmountHeader.closest('tr').next('tr');

        if (amountRow.length) {
          // Look for the cell that contains "1.00 Birr" pattern
          const amountCells = amountRow.find('td');
          amountCells.each((i, cell) => {
            const cellText = $(cell).text().trim();
            if (cellText.match(/^\d+\.\d{2}\s*Birr$/)) {
              amountStr = cellText;
              console.log('Found amount in table cell:', amountStr);
              return false; // Stop after finding the correct amount
            }
          });
        }

        // Extract date from the same table
        const dateHeader = $('td:contains("Payment date"), th:contains("Payment date")').last();
        const dateRow = dateHeader.closest('tr').next('tr');

        if (dateRow.length) {
          const dateCell = dateRow.find('td').eq(1); // Second column
          if (dateCell.length) {
            date = dateCell.text().trim();
            console.log('Found date in table cell:', date);
          }
        }

        // Fallback: Look for "1.00 Birr" pattern anywhere in the document
        if (!amountStr || amountStr === '0') {
          const amountMatch = $(`*:contains("1.00 Birr")`).text().match(/(\d+\.\d{2})\s*Birr/);
          if (amountMatch) {
            amountStr = amountMatch[0];
            console.log('Found amount via pattern match:', amountStr);
          }
        }

        // Final fallback - look for any text containing "Birr" and extract numbers
        if (amountStr === '0') {
            $('*:contains("Birr")').each((i, elem) => {
                const text = $(elem).text().trim();
                const match = text.match(/(\d+\.?\d*)\s*Birr/i);
                if (match && parseFloat(match[1]) > 0) {
                    amountStr = match[1] + ' Birr';
                    console.log('Final fallback amount:', amountStr);
                    return false; // Stop after first match
                }
            });
        }

        // Clean amount string (remove ETB, commas)
        const amount = parseFloat(amountStr.replace(/[^0-9.]/g, ''));

        console.log('Final parsed amount:', amount, 'from string:', amountStr);

        if (!amount || amount <= 0) {
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
            console.log(`Retrying in 3s... (Attempt ${attempt + 1} failed)`);
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s before retry
            continue;
          }
        }
        
        // If it's a specific error like "Invalid transaction ID", throw immediately
        if (error.message === 'Invalid transaction ID') {
             throw error;
        }
        
        throw new Error('Failed to verify transaction. Please check the transaction number and try again.');
      }
    }
    throw new Error('Failed to verify transaction after multiple attempts.');
  }
}

export const telebirrService = new TelebirrService();
