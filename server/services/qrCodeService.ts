import QRCode from 'qrcode';
import crypto from 'crypto';

interface QRCodeData {
  orderId: string;
  eventId: string;
  userId: string;
}

class QRCodeService {
  async generateQRCode(data: QRCodeData): Promise<string> {
    try {
      // Create a unique identifier for the ticket
      const ticketData = {
        orderId: data.orderId,
        eventId: data.eventId,
        userId: data.userId,
        timestamp: Date.now(),
        checksum: this.generateChecksum(data.orderId, data.eventId, data.userId),
      };

      // Convert to JSON string
      const dataString = JSON.stringify(ticketData);

      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(dataString, {
        errorCorrectionLevel: 'M',
        margin: 1,
        color: {
          dark: '#0F4C75', // Primary color
          light: '#FFFFFF',
        },
        width: 256,
      });

      return qrCodeDataUrl;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  async generateQRCodeBuffer(data: QRCodeData): Promise<Buffer> {
    try {
      const ticketData = {
        orderId: data.orderId,
        eventId: data.eventId,
        userId: data.userId,
        timestamp: Date.now(),
        checksum: this.generateChecksum(data.orderId, data.eventId, data.userId),
      };

      const dataString = JSON.stringify(ticketData);

      // Generate QR code as buffer
      const qrCodeBuffer = await QRCode.toBuffer(dataString, {
        errorCorrectionLevel: 'M',
        margin: 1,
        color: {
          dark: '#0F4C75',
          light: '#FFFFFF',
        },
        width: 256,
      });

      return qrCodeBuffer;
    } catch (error) {
      console.error('Error generating QR code buffer:', error);
      throw new Error('Failed to generate QR code buffer');
    }
  }

  verifyQRCode(qrCodeData: string): { valid: boolean; data?: any; error?: string } {
    try {
      const parsedData = JSON.parse(qrCodeData);
      
      if (!parsedData.orderId || !parsedData.eventId || !parsedData.userId || !parsedData.checksum) {
        return { valid: false, error: 'Invalid QR code format' };
      }

      // Verify checksum
      const expectedChecksum = this.generateChecksum(
        parsedData.orderId,
        parsedData.eventId,
        parsedData.userId
      );

      if (parsedData.checksum !== expectedChecksum) {
        return { valid: false, error: 'Invalid QR code checksum' };
      }

      // Check if QR code is not too old (optional security measure)
      const maxAge = 365 * 24 * 60 * 60 * 1000; // 1 year
      if (Date.now() - parsedData.timestamp > maxAge) {
        return { valid: false, error: 'QR code expired' };
      }

      return { valid: true, data: parsedData };
    } catch (error) {
      return { valid: false, error: 'Failed to parse QR code data' };
    }
  }

  private generateChecksum(orderId: string, eventId: string, userId: string): string {
    const secret = process.env.QR_CODE_SECRET || 'default-secret-key';
    const data = `${orderId}:${eventId}:${userId}:${secret}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }
}

export const qrCodeService = new QRCodeService();
