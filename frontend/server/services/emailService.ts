import { MailService } from '@sendgrid/mail';
import jwt from 'jsonwebtoken';
import { storage } from '../storage';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable not set");
}

const mailService = new MailService();
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "relacionamento@cdpipharma.com.br";

interface TicketEmailData {
  userName: string;
  eventTitle: string;
  eventDate: Date;
  eventLocation: string;
  qrCodeData: string;
  orderId: string;
}

class EmailService {
  async sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.log("SendGrid not configured, queuing email:", { to, subject });
      // Queue email for later processing
      await storage.addEmailToQueue({
        to,
        subject,
        html,
        text,
      });
      return true;
    }

    try {
      await mailService.send({
        to,
        from: FROM_EMAIL,
        subject,
        html,
        text,
      });
      return true;
    } catch (error) {
      console.error('SendGrid email error:', error);
      // Queue for retry
      await storage.addEmailToQueue({
        to,
        subject,
        html,
        text,
      });
      return false;
    }
  }

  async sendVerificationEmail(email: string, userId: string): Promise<boolean> {
    // Create a verification token that expires in 24 hours
    const verificationToken = jwt.sign(
      { userId, type: 'email-verification' }, 
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    // Use relative URL so it works on any domain
    const verificationLink = `/verify-email?token=${verificationToken}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Confirme seu email - CDPI Pass</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0F4C75; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { 
            display: inline-block; 
            background: #3282B8; 
            color: white; 
            padding: 12px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0; 
          }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏥 CDPI Pass</h1>
            <h2>Confirme seu email</h2>
          </div>
          <div class="content">
            <p>Obrigado por se cadastrar no CDPI Pass!</p>
            <p>Para completar seu cadastro e ter acesso aos eventos farmacêuticos, clique no botão abaixo:</p>
            <p style="text-align: center;">
              <a href="${verificationLink}" class="button">Confirmar Email</a>
            </p>
            <p>Se o botão não funcionar, copie e cole este link no seu navegador:</p>
            <p style="word-break: break-all;">${verificationLink}</p>
            <p>Este link expira em 24 horas.</p>
          </div>
          <div class="footer">
            <p>CDPI Pass - Eventos Farmacêuticos</p>
            <p>Este é um email automático, não responda.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      CDPI Pass - Confirmação de Email
      
      Obrigado por se cadastrar no CDPI Pass!
      
      Para completar seu cadastro, acesse: ${verificationLink}
      
      Este link expira em 24 horas.
    `;

    return this.sendEmail(email, "Confirme seu email - CDPI Pass", html, text);
  }

  async sendTicketEmail(email: string, data: TicketEmailData): Promise<boolean> {
    const eventDate = new Date(data.eventDate).toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Seu ingresso - CDPI Pass</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0F4C75; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .ticket { 
            background: white; 
            border: 2px solid #3282B8; 
            border-radius: 10px; 
            padding: 20px; 
            margin: 20px 0; 
            text-align: center; 
          }
          .qr-code { 
            margin: 20px 0; 
            padding: 20px; 
            background: white; 
            border: 1px solid #ddd; 
            display: inline-block; 
          }
          .event-details { text-align: left; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎫 Seu Ingresso</h1>
            <h2>CDPI Pass</h2>
          </div>
          <div class="content">
            <p>Olá, <strong>${data.userName}</strong>!</p>
            <p>Seu pagamento foi confirmado! Aqui está seu ingresso para o evento:</p>
            
            <div class="ticket">
              <h3>${data.eventTitle}</h3>
              <div class="event-details">
                <p><strong>📅 Data:</strong> ${eventDate}</p>
                <p><strong>📍 Local:</strong> ${data.eventLocation}</p>
                <p><strong>🎟️ Pedido:</strong> #${data.orderId}</p>
              </div>
              
              <div class="qr-code">
                <p><strong>QR Code do Ingresso:</strong></p>
                <img src="${data.qrCodeData}" alt="QR Code do Ingresso" style="max-width: 256px; height: auto; display: block; margin: 10px auto;">
                <p style="font-size: 12px; color: #666;">
                  Apresente este QR Code na entrada do evento
                </p>
              </div>
            </div>
            
            <div style="background: #BBE1FA; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4>📋 Instruções Importantes:</h4>
              <ul style="text-align: left;">
                <li>Chegue com 30 minutos de antecedência</li>
                <li>Traga um documento com foto</li>
                <li>O QR Code pode ser apresentado impresso ou no celular</li>
                <li>Em caso de dúvidas, entre em contato conosco</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>CDPI Pass - Eventos Farmacêuticos</p>
            <p>contato@cdpipass.com.br | (11) 3000-0000</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      CDPI Pass - Seu Ingresso
      
      Olá, ${data.userName}!
      
      Seu pagamento foi confirmado! Detalhes do evento:
      
      Evento: ${data.eventTitle}
      Data: ${eventDate}
      Local: ${data.eventLocation}
      Pedido: #${data.orderId}
      
      Importante: Seu QR Code está anexado neste email. Para visualizá-lo, abra este email em HTML ou acesse sua conta no site.
      
      Apresente o QR Code na entrada do evento.
      Chegue com 30 minutos de antecedência e traga um documento com foto.
    `;

    return this.sendEmail(email, `Seu ingresso para ${data.eventTitle} - CDPI Pass`, html, text);
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
          from: FROM_EMAIL,
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
}

export const emailService = new EmailService();
