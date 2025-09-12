import QRCode from 'qrcode';
import crypto from 'crypto';
import { s3Service } from './s3Service';
import { storage } from '../storage';

interface QRCodeData {
  orderId: string;
  eventId: string;
  userId: string;
}

interface QRCodeResult {
  base64Data: string;  
  s3Url?: string;      
}

class QRCodeService {
  /*
    Generate a QR code for the given data.
    @param data - The data to encode in the QR code.
    @returns The base64-encoded QR code data for database.
    @returns the S3 URL of the QR code uploaded.
  */
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

      this.generateQRCodeBuffer(data);

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
        type: 'png',
        margin: 1,
        color: {
          dark: '#0F4C75',
          light: '#FFFFFF',
        },
        width: 256,
      });

      let s3Url: string | undefined;
      
      // Try to upload to S3, but don't fail if it doesn't work
      try {
        s3Url = await s3Service.uploadQRCode(qrCodeBuffer, data.orderId);
        console.log(`QR code uploaded to S3: ${s3Url}`);
        // save the url in the database
        await storage.updateOrder(data.orderId, { qr_code_s3_url: s3Url });
        console.log("QR code S3 URL saved in database");
      } catch (s3Error) {
        console.warn('Failed to upload QR code to S3, using base64 only:', s3Error);
        // Continue without S3 - fallback to base64 only
      }

      return qrCodeBuffer;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
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

  async uploadExistingQRCode(base64Data: string, orderId: string): Promise<string | null> {
    try {
      // Convert base64 data URL to buffer
      const base64String = base64Data.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64String, 'base64');
      
      // Upload to S3
      return await s3Service.uploadQRCode(buffer, orderId);
    } catch (error) {
      console.error('Failed to upload existing QR code to S3:', error);
      return null;
    }
  }
}

export const qrCodeService = new QRCodeService();
