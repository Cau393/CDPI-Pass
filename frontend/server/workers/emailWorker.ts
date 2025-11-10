import { emailService } from '../services/emailService';
import { storage } from '../storage';
import { parse } from 'csv-parse/sync';

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
  private readonly PROCESS_INTERVAL = 20000; 
  private readonly MAX_CONCURRENT_JOBS = 5;
  private isCycleRunning = false;

  start(): void {
    if (this.isRunning) {
      console.log('Email worker is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting email worker...');
    
    this.processInterval = setInterval(() => {
      this.runWorkerCycle();
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

  async runWorkerCycle(): Promise<void> {
    if (this.isCycleRunning) {
      // Don't start a new cycle if one is already running
      return;
    }
    
    this.isCycleRunning = true;
    
    try {
      // Run both job processors at the same time
      // This way, a big email queue doesn't block CSV processing,
      // and a big CSV job doesn't block emails.
      await Promise.allSettled([
        this.processEmailQueue(),
        this.processMassSendQueue(), // <-- This is our new function
      ]);
    } catch (error) {
      console.error('Error during worker cycle:', error);
    } finally {
      this.isCycleRunning = false;
    }
  }

  async processEmailQueue(): Promise<void> {

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
      
      // Fix: Parse attachments from the database
      const attachments = email.attachments ? JSON.parse(email.attachments) : undefined;
      
      // Use the new service method that doesn't re-queue
      const success = await emailService._sendEmailFromQueue(
        email.to,
        email.subject,
        email.html || '',
        email.text || '',
        attachments
      );

      if (success) {
        await storage.updateEmailStatus(email.id, 'sent');
        console.log(`Email sent successfully to ${email.to}`);
      } else {
        // This will be hit if SendGrid is not configured
        await storage.updateEmailStatus(email.id, 'failed');
        console.error(`Email job ${email.id} failed: SendGrid is not configured.`);
      }
    } catch (error) {
      // This will be hit if _sendEmailFromQueue throws an error
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

  private async processMassSendQueue(): Promise<void> {
    // 1. Get *one* pending CSV job. (We process one at a time)
    const pendingJobs = await storage.getPendingMassSendJobs(1);
    if (pendingJobs.length === 0) {
      return; // No jobs to process
    }

    const job = pendingJobs[0];

    try {
      console.log(`Processing mass-send job ${job.id}.`);
      await storage.updateMassSendJobStatus(job.id, 'processing');

      // 2. Parse the CSV data from the job
      // Note: You may need to add delimiter detection here
      const results: any[] = parse(job.csvData, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: [',', ';'], // Detects comma or semicolon
        relax_column_count: true,
      });

      // 3. Parse attachment data
      const attachments = job.attachmentData
        ? [JSON.parse(job.attachmentData)]
        : undefined;

      console.log(`Job ${job.id}: Found ${results.length} rows to process.`);

      // 4. Loop through rows and queue emails
      for (const row of results) {
        // Normalize field names by trimming them
        const normalizedRow: any = Object.keys(row).reduce((acc: { [key: string]: any }, key) => {
          acc[key.trim()] = row[key];
          return acc;
        }, {});

        const { name, email, amount_of_courtesies, event_id } = normalizedRow;

        if (!name || !email || !event_id || !amount_of_courtesies) {
          console.warn(`Job ${job.id}: Skipping row due to missing data:`, normalizedRow);
          continue;
        }

        const event = await storage.getEvent(event_id);
        if (event) {
          const code = `CDPI${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          const link = await storage.createCourtesyLink({
            code,
            eventId: event.id,
            ticketCount: parseInt(amount_of_courtesies, 10),
            createdBy: job.createdBy,
            isActive: true,
            recipientEmail: email,
            recipientName: name,
          });

          // This will queue the email, which our *other* function
          // (processEmailQueue) will pick up on a future cycle.
          await emailService.sendCourtesyMassEmail(
            email,
            name,
            event.title,
            link.code,
            event.date,
            attachments
          );
        } else {
          console.warn(`Job ${job.id}: Event not found for ID ${event_id}`);
        }
      }

      // 5. Mark job as completed
      await storage.updateMassSendJobStatus(job.id, 'completed');
      console.log(`Mass-send job ${job.id} completed successfully.`);

    } catch (error) {
      console.error(`Error processing mass-send job ${job.id}:`, error);
      await storage.updateMassSendJobStatus(job.id, 'failed');
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
