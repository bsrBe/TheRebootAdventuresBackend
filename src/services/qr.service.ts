import QRCode from 'qrcode';

export class QRService {
  /**
   * Generate a QR code buffer for a receipt
   */
  async generateReceiptQR(data: {
    eventName: string;
    amount: number;
    payerName: string;
    date: string;
    transactionId: string;
  }): Promise<Buffer> {
    try {
      // Create a formatted string for the QR content
      const qrContent = JSON.stringify({
        event: data.eventName,
        amount: data.amount,
        payer: data.payerName,
        date: data.date,
        ref: data.transactionId,
        verified: true
      });

      // Generate QR code as a Buffer
      const buffer = await QRCode.toBuffer(qrContent, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 300,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      return buffer;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }
}

export const qrService = new QRService();
