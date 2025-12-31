import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = promisify(exec);

export interface BankReceipt {
  transactionId: string;
  senderName: string;
  receiverName?: string;
  amount: number;
  date: string;
  status: 'valid' | 'invalid';
}

export class BankVerifierService {
  /**
   * Verify BOA transaction via direct API
   */
  async verifyBOA(transactionId: string): Promise<BankReceipt> {
    try {
      console.log(`Verifying BOA transaction: ${transactionId}`);
      const response = await axios.get(`https://cs.bankofabyssinia.com/api/onlineSlip/getDetails/?id=${transactionId}`, {
        timeout: 15000
      });
      const data = response.data as any;

      if (data.header?.status !== 'success' || !data.body || data.body.length === 0) {
        throw new Error('Invalid BOA transaction ID or receipt not found');
      }

      const slip = data.body[0];
      
      // Clean up the amount - sometimes it might have commas or ETB prefix
      const amountStr = slip['Transferred Amount'] || '0';
      const amount = parseFloat(amountStr.replace(/[^0-9.]/g, ''));

      return {
        transactionId: slip['Transaction Reference'] || transactionId,
        senderName: slip['Source Account Name'] || 'Unknown',
        amount: amount,
        date: slip['Transaction Date'] || new Date().toISOString(),
        status: 'valid'
      };
    } catch (error: any) {
      console.error('BOA verification error:', error.message);
      if (error.response?.status === 404) {
        throw new Error('BOA transaction not found');
      }
      throw new Error(error.message || 'Failed to verify BOA transaction');
    }
  }

  /**
   * Verify CBE transaction via PDF parsing
   */
  async verifyCBE(transactionId: string): Promise<BankReceipt> {
    const tempPdf = path.join('/tmp', `cbe_${transactionId}.pdf`);
    const tempTxt = path.join('/tmp', `cbe_${transactionId}.txt`);
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
        try {
          console.log(`Verifying CBE transaction: ${transactionId} (Attempt ${attempt + 1}/${maxAttempts})`);
          
          // Use curl for download as it's more resilient to the specific TLS/H2 issues of CBE server
          // -k is for insecure if needed, but here it's more about resilience
          await execPromise(`curl -L "https://apps.cbe.com.et:100/?id=${transactionId}" -o "${tempPdf}" --max-time 60 --retry 2`);
          
          if (!fs.existsSync(tempPdf) || fs.statSync(tempPdf).size < 5000) {
              throw new Error('CBE PDF download failed or file is not a valid PDF');
          }

          // 2. Convert to text using system utility pdftotext
          await execPromise(`pdftotext -layout ${tempPdf} ${tempTxt}`);
          
          if (!fs.existsSync(tempTxt)) {
              throw new Error('Failed to extract text from CBE PDF');
          }

          const text = fs.readFileSync(tempTxt, 'utf-8');

          // 3. Parse text using regex
          const payerMatch = text.match(/Payer\s+(.+)/);
          const amountMatch = text.match(/Transferred Amount\s+([\d,.]+)\s+ETB/);
          const dateMatch = text.match(/Payment Date & Time\s+(.+)/);

          if (!amountMatch) {
             throw new Error('Could not parse amount from CBE receipt. Transaction might not exist or format changed.');
          }

          const amount = parseFloat(amountMatch[1].replace(/,/g, ''));

          return {
            transactionId,
            senderName: payerMatch ? payerMatch[1].trim() : 'Unknown',
            amount: amount,
            date: dateMatch ? dateMatch[1].trim() : new Date().toISOString(),
            status: 'valid'
          };
        } catch (error: any) {
          console.error(`CBE verification attempt ${attempt + 1} failed:`, error.message);
          attempt++;
          if (attempt < maxAttempts) {
              console.log('Retrying CBE verification in 3s...');
              await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
              throw new Error(`Failed to verify CBE transaction after ${maxAttempts} attempts: ${error.message}`);
          }
        } finally {
          // Cleanup temp files
          try {
              if (fs.existsSync(tempPdf)) fs.unlinkSync(tempPdf);
              if (fs.existsSync(tempTxt)) fs.unlinkSync(tempTxt);
          } catch (cleanupError) {
              // Ignore cleanup errors
          }
        }
    }
    throw new Error('CBE verification failed unexpectedly');
  }
}

export const bankVerifierService = new BankVerifierService();
