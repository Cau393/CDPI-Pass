import { MailService } from '@sendgrid/mail';
import jwt from 'jsonwebtoken';
import { storage } from '../storage';
import { EMAIL_CONTACT_LINE } from '@shared/contact';
import { buildTicketQrAttachment } from '../utils/ticketQrAttachment';
import {
  buildTicketEmailHtml,
  buildTicketEmailText,
  type TicketEmailData,
} from '../utils/ticketEmailTemplate';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable not set");
}

const mailService = new MailService();
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "relacionamento.mkt@cdpipharma.com.br";

/** Rough HTML to plain text for multipart/alternative body (no external deps). */
function courtesyMessageHtmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Outer HTML shell for courtesy transactional mail: invite (mass-send) vs pending-redemption reminder. */
export type CourtesyMassEmailLayout = "courtesy_invite" | "courtesy_reminder";

/**
 * A SendGrid attachment.
 *
 * `disposition: "inline"` plus `content_id` makes the file render inside the
 * HTML body via <img src="cid:<content_id>"> instead of appearing as a
 * download. The ticket email uses this to embed the QR code, so it no longer
 * depends on the S3 object being publicly readable.
 */
export interface EmailAttachment {
  filename: string;
  content: string;
  type: string;
  disposition?: string;
  content_id?: string;
}

class EmailService {
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    text?: string,
    attachments?: EmailAttachment[]
  ): Promise<boolean> {
    if (!to?.trim?.()) {
      console.warn("EmailService.sendEmail: skipped — missing or empty recipient (to)");
      return false;
    }

    if (!process.env.SENDGRID_API_KEY) {
      console.log("SendGrid not configured, queuing email:", { to, subject });
      await storage.addEmailToQueue({
        to,
        subject,
        html,
        text,
        attachments: attachments ? JSON.stringify(attachments) : null,
      });
      return true;
    }

    try {
      const emailPayload: any = {
        to,
        from: { email: FROM_EMAIL, name: "CDPI Pass" },
        subject,
        html,
        text,
      };

      // Only add attachments if provided
      if (attachments && attachments.length > 0) {
        emailPayload.attachments = attachments;
      }

      await mailService.send(emailPayload);
      return true;
    } catch (error) {
      console.error('SendGrid email error:', error);
      await storage.addEmailToQueue({
        to,
        subject,
        html,
        text,
        attachments: attachments ? JSON.stringify(attachments) : null,
      });
      return false;
    }
  }

  async sendVerificationEmail(email: string, userId: string): Promise<boolean> {
    // Generate a 6-digit code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    // Set an expiration time (15 minutes from now)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Store the code and its expiration in the database
    await storage.updateUser(userId, {
        emailVerificationCode: verificationCode,
        emailVerificationCodeExpiresAt: expiresAt,
    });

    const html = `
      <h1>Confirme seu email - CDPI Pass</h1>
      <p>Seu código de verificação é:</p>
      <h2><b>${verificationCode}</b></h2>
      <p>Este código expira em 15 minutos.</p>
    `;
    const text = `Seu código de verificação para o CDPI Pass é: ${verificationCode}`;

    return this.sendEmail(email, "Seu Código de Verificação - CDPI Pass", html, text);
    }

  async sendTicketEmail(email: string, data: TicketEmailData): Promise<boolean> {
    const html = buildTicketEmailHtml(data);
    const text = buildTicketEmailText(data);

    // The QR is attached inline (cid:qrcode) rather than hot-linked from S3.
    // See buildTicketQrAttachment for why. The template must keep referencing
    // the same content_id.
    const qrAttachment = buildTicketQrAttachment(data.qrCodeData);

    if (!qrAttachment) {
      // Never silently send a ticket with no QR: check-in would fail at the door.
      console.error(
        `sendTicketEmail: order ${data.orderId} has no qrCodeData; ticket email will have no QR image`,
      );
    }

    return this.sendEmail(
      email,
      `Seu ingresso para ${data.eventTitle} - CDPI Pass`,
      html,
      text,
      qrAttachment ? [qrAttachment] : undefined,
    );
  }

  /**
   * E-mail simples com o link de checkout (cartão): sem template de cobrança Asaas;
   * apenas o link gerado pelo nosso fluxo.
   */
  async sendCardPaymentLinkEmail(
    email: string,
    data: { userName: string; eventTitle: string; paymentUrl: string },
  ): Promise<boolean> {
    const html = `
      <p>Olá, <strong>${data.userName}</strong>,</p>
      <p>Para pagar com cartão o ingresso <strong>${data.eventTitle}</strong>, use o link abaixo:</p>
      <p><a href="${data.paymentUrl}">${data.paymentUrl}</a></p>
      <p>Após a confirmação do pagamento, você receberá o QR Code do ingresso por e-mail.</p>
      <p style="color:#666;font-size:12px;">CDPI Pass</p>
    `;
    const text = `Olá, ${data.userName}. Link para pagamento com cartão (${data.eventTitle}): ${data.paymentUrl}`;
    return this.sendEmail(
      email,
      `Link de pagamento — ${data.eventTitle} — CDPI Pass`,
      html,
      text,
    );
  }

  async processEmailQueue(): Promise<void> {
    if (!process.env.SENDGRID_API_KEY) {
      console.log("SendGrid not configured, skipping email queue processing");
      return;
    }

    const pendingEmails = await storage.getPendingEmails();
    
    for (const email of pendingEmails) {
      try {
        await mailService.send({
          to: email.to,
          from: { email: FROM_EMAIL, name: "CDPI Pass" },
          subject: email.subject,
          html: email.html || '',
          text: email.text || '',
        });
        
        await storage.updateEmailStatus(email.id, "sent");
        console.log(`Email sent successfully to ${email.to}`);
      } catch (error) {
        console.error(`Failed to send email to ${email.to}:`, error);
        await storage.updateEmailStatus(email.id, "failed");
      }
    }
  }

  async sendPasswordResetEmail(email: string, userId: string): Promise<boolean> {
    // Create a password reset token that expires in 30 minutes
    const resetToken = jwt.sign(
        { userId, type: 'password-reset' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '30m' }
    );

    const resetLink = `https://cdpipass.com.br/reset-password?token=${resetToken}`;

    const html = `
        <h1>Redefinição de Senha</h1>
        <p>Você solicitou a redefinição de sua senha. Clique no link abaixo para criar uma nova:</p>
        <a href="${resetLink}">Redefinir Senha</a>
        <p>Este link expirará em 30 minutos.</p>
    `;
    const text = `Acesse este link para redefinir sua senha: ${resetLink}`;

    return this.sendEmail(email, "Redefinição de Senha - CDPI Pass", html, text);
  }

  /**
   * Sends the standard courtesy mass email layout. Header, CTA, notice box, and footer are fixed.
   * @param customMessageBoxHtml - If set (already-interpolated HTML), replaces only the dynamic paragraphs
   * inside `.message-box` before the static "Para resgatar..." line. Use placeholders resolved upstream.
   * @param layout - Invite (default) vs reminder: only the header `<h1>` title changes.
   * @param renderedSubject - Optional fully rendered subject (plain text). When empty/omitted, uses default "Sua cortesia para o evento …".
   */
  async sendCourtesyMassEmail(
    email: string,
    name: string,
    eventName: string,
    courtesyCode: string,
    eventDate: Date,
    attachments?: EmailAttachment[],
    customMessageBoxHtml?: string,
    layout: CourtesyMassEmailLayout = "courtesy_invite",
    renderedSubject?: string | null,
  ): Promise<boolean> {
    const redeemUrl = `${process.env.BASE_URL}/cortesia?code=${courtesyCode}`;
    const defaultSubject = `Sua cortesia para o evento ${eventName}`;
    const subject =
      renderedSubject != null && String(renderedSubject).trim() !== ""
        ? String(renderedSubject).trim()
        : defaultSubject;
    const headerHeading =
      layout === "courtesy_reminder"
        ? "Lembrete para Resgate de Cortesia!"
        : "🎁 Você Recebeu uma Cortesia!";

    const defaultMessageInner = `
              <p style="font-size: 18px;">Olá, <strong>${name}</strong>!</p>
              <p>Você recebeu uma cortesia para o <strong>${eventName}</strong> nas datas <strong>quarta-feira e quinta-feira, 04 e 05 de março de 2026!</strong>!</p>
              <p style="font-style: italic; color: #333;">
                Um evento que tem como objetivo aprofundar a discussão sobre os critérios técnicos e regulatórios para comprovação de eficácia e segurança de medicamentos de liberação prolongada, considerando os parâmetros farmacocinéticos exigidos atualmente e a aplicação prática dos guias internacionais utilizados como referência regulatória.
              </p>
    `;

    const messageInner =
      customMessageBoxHtml !== undefined && customMessageBoxHtml.trim() !== ""
        ? customMessageBoxHtml
        : defaultMessageInner;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0F4C75; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; text-align: center; }
          .message-box { text-align: left; margin: 20px 0; }
          .cta-button {
            background-color: #3282B8;
            color: white;
            padding: 15px 25px;
            text-decoration: none;
            border-radius: 5px;
            font-size: 16px;
            display: inline-block;
            margin: 20px 0;
          }
          .important-notice {
            background: #BBE1FA;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            text-align: left;
          }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${headerHeading}</h1>
            <h2>CDPI Pass</h2>
          </div>
          <div class="content">
            <div class="message-box">
              ${messageInner}
              <p>Para resgatar seu ingresso, clique no botão abaixo:</p>
            </div>
            
            <a href="${redeemUrl}" class="cta-button">Resgatar Ingresso Agora</a>
            
            <div class="important-notice">
            <p>Ou se preferir, você pode resgatar a cortesia por meio do nosso site com o código:    <strong>${courtesyCode}</strong></p>
              <h4>⚠️ Instruções Importantes:</h4>
              <p>
                É imprescindível fazer o resgate da sua cortesia até o prazo de <strong>48 horas</strong> após o recebimento dessa confirmação de inscrição para garantir a sua vaga e participar do evento.
              </p>
            </div>
          </div>
          <div class="footer">
            <p>Atenciosamente,<br>Equipe CDPI Pass</p>
            <p>${EMAIL_CONTACT_LINE}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const defaultTextBody = `
      Olá, ${name}!

      Você recebeu uma cortesia para o ${eventName} nas datas quarta-feira e quinta-feira, 04 e 05 de março de 2026!

      Um evento que tem como objetivo aprofundar a discussão sobre os critérios técnicos e regulatórios para comprovação de eficácia e segurança de medicamentos de liberação prolongada, considerando os parâmetros farmacocinéticos exigidos atualmente e a aplicação prática dos guias internacionais utilizados como referência regulatória.
    `;

    const textMessagePart =
      customMessageBoxHtml !== undefined && customMessageBoxHtml.trim() !== ""
        ? courtesyMessageHtmlToPlainText(customMessageBoxHtml)
        : defaultTextBody.trim();

    const text = `
${textMessagePart}

Para resgatar seu ingresso, acesse o seguinte link:
${redeemUrl}

Código: ${courtesyCode}

⚠️ É imprescindível fazer o resgate da sua cortesia até o prazo de 48 horas após o recebimento dessa confirmação de inscrição para garantir a sua vaga e participar do evento.

Atenciosamente,
Equipe CDPI Pass
`.trim();

    return this.sendEmail(email, subject, html, text, attachments);
  }

  /**
   * Announcement e-mail: same visual shell as courtesy mail, without redeem CTA or courtesy code block.
   */
  async sendCommunicateEmail(
    email: string,
    messageBoxHtml: string,
    renderedSubject: string | null | undefined,
    attachments?: EmailAttachment[],
  ): Promise<boolean> {
    const subject =
      renderedSubject != null && String(renderedSubject).trim() !== ""
        ? String(renderedSubject).trim()
        : "Comunicado — CDPI Pass";
    const messageInner =
      messageBoxHtml.trim() !== "" ? messageBoxHtml : "<p></p>";
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0F4C75; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; text-align: center; }
          .message-box { text-align: left; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Comunicado</h1>
            <h2>CDPI Pass</h2>
          </div>
          <div class="content">
            <div class="message-box">
              ${messageInner}
            </div>
          </div>
          <div class="footer">
            <p>Atenciosamente,<br>Equipe CDPI Pass</p>
            <p>${EMAIL_CONTACT_LINE}</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const text = `
${courtesyMessageHtmlToPlainText(messageInner)}

Atenciosamente,
Equipe CDPI Pass
`.trim();
    return this.sendEmail(email, subject, html, text, attachments);
  }

  async _sendEmailFromQueue(
    to: string,
    subject: string,
    html: string,
    text?: string,
    attachments?: EmailAttachment[]
  ): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.warn("SendGrid not configured, email worker cannot send email:", { to, subject });
      // Return false to indicate failure, so worker can mark it as 'failed'
      return false;
    }

    try {
      const emailPayload: any = {
        to,
        from: { email: FROM_EMAIL, name: "CDPI Pass" },
        subject,
        html,
        text,
      };

      if (attachments && attachments.length > 0) {
        emailPayload.attachments = attachments;
      }

      await mailService.send(emailPayload);
      return true; // Success
    } catch (error) {
      console.error('SendGrid email error (from queue):', error);
      // Re-throw the error so the worker's catch block can handle it
      throw error;
    }
  }
}


export const emailService = new EmailService();
