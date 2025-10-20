import { emailService } from '../services/emailService';
import { storage } from '../storage';

interface EmailJob {
  id: string;
  type: 'verification' | 'ticket' | 'generic';
  data: any;
  attempts: number;
  maxAttempts: number;
}

class EmailWorker {
  private isRunning = false;
  private processInterval: NodeJS.Timeout | null = null;
  private readonly PROCESS_INTERVAL = 2000; // 2 seconds
  private readonly MAX_CONCURRENT_JOBS = 5;

  start(): void {
    if (this.isRunning) {
      console.log('Email worker is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting email worker...');
    
    this.processInterval = setInterval(() => {
      this.processEmailQueue();
    }, this.PROCESS_INTERVAL);
  }

  stop(): void {
    if (!this.isRunning) {
      console.log('Email worker is not running');
      return;
    }

    this.isRunning = false;
    console.log('Stopping email worker...');
    
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }

  async processEmailQueue(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const pendingEmails = await storage.getPendingEmails();
      
      if (pendingEmails.length === 0) {
        return;
      }

      console.log(`Processing ${pendingEmails.length} pending emails`);
      
      // Process emails in batches
      const emailsToProcess = pendingEmails.slice(0, this.MAX_CONCURRENT_JOBS);
      
      const processPromises = emailsToProcess.map(email => 
        this.processEmailJob(email)
      );

      await Promise.allSettled(processPromises);
    } catch (error) {
      console.error('Error processing email queue:', error);
    }
  }

  private async processEmailJob(email: any): Promise<void> {
    try {
      console.log(`Processing email job ${email.id} to ${email.to}`);
      
      const success = await emailService.sendEmail(
        email.to,
        email.subject,
        email.html || '',
        email.text || ''
      );

      if (success) {
        await storage.updateEmailStatus(email.id, 'sent');
        console.log(`Email sent successfully to ${email.to}`);
      } else {
        await this.handleEmailFailure(email);
      }
    } catch (error) {
      console.error(`Error processing email job ${email.id}:`, error);
      await this.handleEmailFailure(email);
    }
  }

  private async handleEmailFailure(email: any): Promise<void> {
    const maxAttempts = 3;
    
    if (email.attempts >= maxAttempts) {
      await storage.updateEmailStatus(email.id, 'failed');
      console.error(`Email job ${email.id} failed after ${maxAttempts} attempts`);
    } else {
      // Keep as pending for retry
      console.log(`Email job ${email.id} failed, will retry (attempt ${email.attempts + 1}/${maxAttempts})`);
    }
  }

  async addEmailJob(emailData: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
  }): Promise<void> {
    try {
      await storage.addEmailToQueue(emailData);
      console.log(`Added email job to queue: ${emailData.to}`);
    } catch (error) {
      console.error('Error adding email job to queue:', error);
      throw error;
    }
  }

  async getQueueStatus(): Promise<{
    pending: number;
    failed: number;
    sent: number;
  }> {
    // This would require additional storage methods to count by status
    // For now, return basic info
    const pendingEmails = await storage.getPendingEmails();
    
    return {
      pending: pendingEmails.length,
      failed: 0, // Would need to implement this query
      sent: 0,   // Would need to implement this query
    };
  }

  isWorkerRunning(): boolean {
    return this.isRunning;
  }
}

export const emailWorker = new EmailWorker();

// Start the worker if this module is imported
// if (process.env.EMAIL_QUEUE_ENABLED !== 'false') {
//   emailWorker.start();
// }

// // Graceful shutdown
// process.on('SIGTERM', () => {
//   console.log('Received SIGTERM, stopping email worker...');
//   emailWorker.stop();
// });

// process.on('SIGINT', () => {
//   console.log('Received SIGINT, stopping email worker...');
//   emailWorker.stop();
// });
