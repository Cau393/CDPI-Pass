import { EMAIL_CONTACT_FOOTER_HTML, EMAIL_CONTACT_LINE } from "@shared/contact";
import {
  TICKET_CONFIRMATION_LINE,
  type TicketConfirmationKind,
} from "./ticketEmailTemplate";
import {
  confirmationEmailCustomBlockHtml,
  confirmationEmailCustomBlockText,
} from "./confirmationEmailHtml";

/** Match EventDetailsPage / Brazil wall-clock display regardless of server TZ. */
const EVENT_TZ = "America/Sao_Paulo";

export interface OnlineEventEmailData {
  userName: string;
  eventTitle: string;
  eventDate: Date;
  meetingUrl: string;
  orderId: string;
  confirmationKind: TicketConfirmationKind;
  customHtml?: string | null;
}

export const ONLINE_EVENT_INSTRUCTIONS = [
  "Acesse o link na data e hora do evento.",
  "O link é individual e intransferível.",
  "Recomendamos entrar alguns minutos antes do início.",
  "Em caso de dúvidas, entre em contato conosco.",
] as const;

function formatEventDate(date: Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    timeZone: EVENT_TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildOnlineEventEmailHtml(data: OnlineEventEmailData): string {
  const eventDate = formatEventDate(data.eventDate);
  const confirmation = TICKET_CONFIRMATION_LINE[data.confirmationKind];
  const instructions = ONLINE_EVENT_INSTRUCTIONS.map(
    (line) => `<li>${line}</li>`,
  ).join("\n                ");
  const safeUrl = escapeHtml(data.meetingUrl);
  const customBlock = confirmationEmailCustomBlockHtml(data.customHtml);

  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Seu link de acesso - CDPI Pass</title>
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
          .event-details { text-align: left; margin: 20px 0; }
          .meeting-link {
            display: inline-block;
            background: #3282B8;
            color: white !important;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: bold;
            margin: 10px 0;
          }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Seu link de acesso</h1>
            <h2>CDPI Pass</h2>
          </div>
          <div class="content">
            <p>Olá, <strong>${escapeHtml(data.userName)}</strong>!</p>
            <p>${confirmation} Este é um evento <strong>online</strong>. Use o link abaixo para entrar na reunião:</p>
            ${customBlock}

            <div class="ticket">
              <h3>${escapeHtml(data.eventTitle)}</h3>
              <div class="event-details">
                <p><strong>Data:</strong> ${eventDate}</p>
                <p><strong>Formato:</strong> Online</p>
                <p><strong>Pedido:</strong> #${escapeHtml(data.orderId)}</p>
              </div>

              <p><strong>Link da reunião:</strong></p>
              <p>
                <a class="meeting-link" href="${safeUrl}">Acessar reunião</a>
              </p>
              <p style="font-size: 12px; color: #666; word-break: break-all;">
                ${safeUrl}
              </p>
            </div>

            <div style="background: #BBE1FA; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4>Instruções Importantes:</h4>
              <ul style="text-align: left;">
                ${instructions}
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>CDPI Pass</p>
            ${EMAIL_CONTACT_FOOTER_HTML}
          </div>
        </div>
      </body>
      </html>
    `;
}

export function buildOnlineEventEmailText(data: OnlineEventEmailData): string {
  const eventDate = formatEventDate(data.eventDate);
  const confirmation = TICKET_CONFIRMATION_LINE[data.confirmationKind];
  const instructions = ONLINE_EVENT_INSTRUCTIONS.map(
    (line) => `      - ${line}`,
  ).join("\n");
  const customText = confirmationEmailCustomBlockText(data.customHtml);

  return `
      CDPI Pass - Seu link de acesso

      Olá, ${data.userName}!

      ${confirmation} Este é um evento online. Use o link abaixo para entrar na reunião:
${customText}
      Evento: ${data.eventTitle}
      Data: ${eventDate}
      Formato: Online
      Pedido: #${data.orderId}

      Link da reunião: ${data.meetingUrl}

      Instruções Importantes:
${instructions}

      Fale conosco:
      ${EMAIL_CONTACT_LINE}
    `;
}
