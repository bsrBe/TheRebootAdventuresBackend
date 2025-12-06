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
    const maxRetries = 1; // Reduced from 3 to 1 to fail fast
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
          timeout: 15000 // Reduced to 15 seconds
        });

        const $ = cheerio.load(response.data as string);
        
        // Check if page indicates invalid transaction
        if ($('body').text().includes('Transaction not found') || response.status !== 200) {
          throw new Error('Invalid transaction ID');
        }

        // Extract data using specific selectors based on the receipt structure
        
        // 1. Extract Payer/Sender and Receiver
        // Look for "Credited Party name" for receiver
        const receiverLabel = $('td:contains("Credited Party name"), div:contains("Credited Party name")').last();
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

        // Find the index of the columns
        let amountIndex = -1;
        let dateIndex = -1;
        
        // Iterate through all table rows to find the header row
        $('tr').each((i, row) => {
            const cells = $(row).find('td, th');
            cells.each((j, cell) => {
                const text = $(cell).text().trim();
                if (text.includes('Settled Amount')) amountIndex = j;
                if (text.includes('Payment date')) dateIndex = j;
            });
            
            // If we found headers, look at the next row for values
            if (amountIndex !== -1 || dateIndex !== -1) {
                const nextRow = $(row).next('tr');
                if (nextRow.length) {
                    const valueCells = nextRow.find('td');
                    
                    if (amountIndex !== -1 && valueCells.eq(amountIndex).length) {
                        const amountText = valueCells.eq(amountIndex).text().trim();
                        // Clean amount string (remove ETB, commas, " Birr")
                        const amountVal = parseFloat(amountText.replace(/[^0-9.]/g, ''));
                        if (!isNaN(amountVal)) {
                             amountStr = amountText;
                        }
                    }
                    
                    if (dateIndex !== -1 && valueCells.eq(dateIndex).length) {
                         const dateText = valueCells.eq(dateIndex).text().trim();
                         if (dateText) {
                             date = dateText;
                         }
                    }
                }
                // Reset indices to avoid false positives in other tables if any (though unlikely to have same headers)
                // But we should break if we found both. 
                return false; // Break loop
            }
        });

        // Fallback if table parsing failed (e.g. mobile view might use divs)
        if (amountStr === '0') {
             const amountLabel = $('*:contains("Settled Amount")').last();
             if (amountLabel.length) {
                 amountStr = amountLabel.next().text().trim() || amountLabel.parent().next().text().trim();
             }
        }

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
        
        throw new Error('Failed to verify transaction. Please check the transaction number and try again.');
      }
    }
    throw new Error('Failed to verify transaction after multiple attempts.');
  }
}

export const telebirrService = new TelebirrService();
