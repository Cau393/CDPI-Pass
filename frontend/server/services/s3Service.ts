import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    // Initialize S3 client with credentials from environment
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'sa-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    
    this.bucketName = process.env.AWS_S3_BUCKET_NAME!;
    
    // Validate required environment variables
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !this.bucketName) {
      throw new Error('Missing required AWS S3 environment variables');
    }
  }

  /**
   * Upload a buffer (like QR code image) to S3
   * @param buffer - The file buffer to upload
   * @param key - The S3 object key (file path)
   * @param contentType - The MIME type of the file
   * @returns Promise with the S3 object URL
   */
  async uploadBuffer(buffer: Buffer, key: string, contentType: string = 'image/png'): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await this.s3Client.send(command);
      
      // Return the public URL
      return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    } catch (error) {
      console.error('Error uploading to S3:', error);
      throw new Error(`Failed to upload file to S3: ${error}`);
    }
  }

  /**
   * Upload QR code buffer specifically
   * @param qrCodeBuffer - The QR code image buffer
   * @param orderId - Order ID for unique naming
   * @returns Promise with the S3 URL
   */
  async uploadQRCode(qrCodeBuffer: Buffer, orderId: string): Promise<string> {
    const timestamp = Date.now();
    const key = `qr-codes/${orderId}-${timestamp}.png`;
    
    return this.uploadBuffer(qrCodeBuffer, key, 'image/png');
  }

  /**
   * Generate a presigned URL for secure file access
   * @param key - The S3 object key
   * @param expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns Promise with the presigned URL
   */
  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      throw new Error(`Failed to generate presigned URL: ${error}`);
    }
  }

  /**
   * Delete a file from S3
   * @param key - The S3 object key to delete
   * @returns Promise<void>
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error('Error deleting from S3:', error);
      throw new Error(`Failed to delete file from S3: ${error}`);
    }
  }

  /**
   * Extract S3 key from a full S3 URL
   * @param url - The full S3 URL
   * @returns The S3 object key
   */
  extractKeyFromUrl(url: string): string {
    const urlParts = url.split('/');
    return urlParts.slice(3).join('/'); // Remove protocol and domain
  }
}

export const s3Service = new S3Service();