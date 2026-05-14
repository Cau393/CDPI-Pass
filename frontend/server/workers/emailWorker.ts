import type { Event } from '@shared/schema';
import { emailService } from '../services/emailService';
import { storage } from '../storage';
import { parse } from 'csv-parse/sync';
import { renderTemplate } from '../utils/templateRenderer';
import {
  filterEligibleReminderLinks,
  deduplicateReminderLinksByEmail,
} from '../utils/reminderEligibility';

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
      await Promise.allSettled([
        this.processEmailQueue(),
        this.processMassSendQueue(),
        this.processReminderQueue(),
        this.processCommunicateQueue(),
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

      const eventCache = new Map<string, Event | undefined>();

      const getCachedEvent = async (eventId: string): Promise<Event | undefined> => {
        if (eventCache.has(eventId)) {
          return eventCache.get(eventId);
        }
        const ev = await storage.getEvent(eventId);
        eventCache.set(eventId, ev);
        return ev;
      };

      const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

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

        const event = await getCachedEvent(event_id);
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

          const eventDate =
            event.date instanceof Date ? event.date : new Date(event.date as string | number);
          const redeemUrl = `${process.env.BASE_URL}/cortesia?code=${link.code}`;
          const variables: Record<string, string> = {
            nome: String(name),
            evento: event.title,
            data: Number.isNaN(eventDate.getTime()) ? "" : dateFormatter.format(eventDate),
            link: redeemUrl,
          };
          const renderedSubject = event.courtesyEmailSubject?.trim()
            ? renderTemplate(event.courtesyEmailSubject, variables)
            : undefined;

          if (event.courtesyTemplate?.trim()) {
            const customMessageBoxHtml = renderTemplate(event.courtesyTemplate, variables);

            await emailService.sendCourtesyMassEmail(
              email,
              name,
              event.title,
              link.code,
              event.date,
              attachments,
              customMessageBoxHtml,
              "courtesy_invite",
              renderedSubject,
            );
          } else {
            await emailService.sendCourtesyMassEmail(
              email,
              name,
              event.title,
              link.code,
              event.date,
              attachments,
              undefined,
              "courtesy_invite",
              renderedSubject,
            );
          }
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

  private async processReminderQueue(): Promise<void> {
    const jobs = await storage.getPendingReminderJobs(1);
    if (jobs.length === 0) return;

    const job = jobs[0];
    try {
      await storage.updateReminderJobStatus(job.id, 'processing');

      const event = await storage.getEvent(job.eventId);
      if (!event || !event.isActive) {
        await storage.updateReminderJobStatus(job.id, 'failed');
        console.warn(`Reminder job ${job.id}: event ${job.eventId} unavailable.`);
        return;
      }

      const attachments = job.attachmentData
        ? [JSON.parse(job.attachmentData)]
        : undefined;

      const templateRow = await storage.getReminderTemplate(job.eventId);
      const templateBody = templateRow?.body?.trim() ?? "";
      const templateSubject = templateRow?.subject?.trim() ?? "";

      const allLinks = await storage.getEligibleReminderLinks(job.eventId);
      const eligibleLinks = filterEligibleReminderLinks(allLinks);
      const dedupedLinks = deduplicateReminderLinksByEmail(eligibleLinks);
      /** Mass-send rows have recipient_email; manual courtesy links often do not — skip those. */
      const linksWithReminderEmail = dedupedLinks.filter(
        (l) => (l.recipientEmail ?? "").trim().length > 0,
      );

      const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const eventDate =
        event.date instanceof Date ? event.date : new Date(event.date as string | number);
      const formattedDate = Number.isNaN(eventDate.getTime())
        ? ''
        : dateFormatter.format(eventDate);

      for (const link of linksWithReminderEmail) {
        const redeemUrl = `${process.env.BASE_URL}/cortesia?code=${link.code}`;
        const variables: Record<string, string> = {
          nome: link.recipientName ?? '',
          evento: event.title,
          data: formattedDate,
          link: redeemUrl,
        };

        const customMessageBoxHtml = templateBody
          ? renderTemplate(templateBody, variables)
          : undefined;
        const renderedReminderSubject = templateSubject
          ? renderTemplate(templateSubject, variables)
          : undefined;

        await emailService.sendCourtesyMassEmail(
          link.recipientEmail!,
          link.recipientName ?? "",
          event.title,
          link.code,
          event.date,
          attachments,
          customMessageBoxHtml,
          "courtesy_reminder",
          renderedReminderSubject,
        );
      }

      await storage.updateReminderJobStatus(job.id, 'completed');
      console.log(
        `Reminder job ${job.id}: sent ${linksWithReminderEmail.length} reminder(s); skipped ${dedupedLinks.length - linksWithReminderEmail.length} link(s) without recipient email for event ${job.eventId}.`,
      );
    } catch (error) {
      console.error(`Error processing reminder job ${job.id}:`, error);
      await storage.updateReminderJobStatus(job.id, 'failed');
    }
  }

  private async processCommunicateQueue(): Promise<void> {
    const jobs = await storage.getPendingCommunicateJobs(1);
    if (jobs.length === 0) return;

    const job = jobs[0];
    try {
      await storage.updateCommunicateJobStatus(job.id, 'processing');

      const event = await storage.getEvent(job.eventId);
      if (!event || !event.isActive) {
        await storage.updateCommunicateJobStatus(job.id, 'failed');
        console.warn(`Communicate job ${job.id}: event ${job.eventId} unavailable.`);
        return;
      }

      const attachments = job.attachmentData
        ? [JSON.parse(job.attachmentData)]
        : undefined;

      const templateRow = await storage.getCommunicateTemplate(job.eventId);
      const templateBody = templateRow?.body?.trim() ?? '';
      const templateSubject = templateRow?.subject?.trim() ?? '';

      if (!templateBody) {
        await storage.updateCommunicateJobStatus(job.id, 'failed');
        console.warn(`Communicate job ${job.id}: empty template for event ${job.eventId}.`);
        return;
      }

      const recipients = await storage.resolveCommunicateRecipients(
        job.eventId,
        job.recipientMode,
      );

      const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const eventDate =
        event.date instanceof Date ? event.date : new Date(event.date as string | number);
      const formattedDate = Number.isNaN(eventDate.getTime())
        ? ''
        : dateFormatter.format(eventDate);

      let sent = 0;
      for (const recipient of recipients) {
        const to = recipient.email.trim();
        if (!to) continue;
        const variables: Record<string, string> = {
          nome: recipient.name ?? '',
          evento: event.title,
          data: formattedDate,
        };
        const customMessageBoxHtml = renderTemplate(templateBody, variables);
        const renderedSubject = templateSubject
          ? renderTemplate(templateSubject, variables)
          : null;

        await emailService.sendCommunicateEmail(
          to,
          customMessageBoxHtml,
          renderedSubject,
          attachments,
        );
        sent += 1;
      }

      await storage.updateCommunicateJobStatus(job.id, 'completed');
      console.log(
        `Communicate job ${job.id}: sent ${sent} email(s) for event ${job.eventId} (mode ${job.recipientMode}).`,
      );
    } catch (error) {
      console.error(`Error processing communicate job ${job.id}:`, error);
      await storage.updateCommunicateJobStatus(job.id, 'failed');
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
