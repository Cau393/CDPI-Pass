/** Match EventDetailsPage / Brazil wall-clock display regardless of server TZ. */
const EVENT_TZ = "America/Sao_Paulo";

export type TicketConfirmationKind = "paid" | "free" | "courtesy";

export interface TicketEmailData {
  userName: string;
  eventTitle: string;
  eventDate: Date;
  eventLocation: string;
  qrCodeData: string;
  orderId: string;
  qrCodeS3Url: string;
  /** Paid orders confirm the payment; free and courtesy tickets confirm the seat. */
  confirmationKind: TicketConfirmationKind;
}

export const TICKET_CONFIRMATION_LINE: Record<TicketConfirmationKind, string> = {
  paid: "Seu pagamento foi confirmado!",
  free: "Sua inscrição está confirmada!",
  courtesy: "Sua presença foi confirmada!",
};

export const TICKET_INSTRUCTIONS = [
  "Chegue com 30 minutos de antecedência.",
  "Cada ingresso é individual e intransferível.",
  "A apresentação do QRCode do Ingresso (digital ou impresso) é indispensável para ter acesso ao evento.",
  "Em caso de dúvidas, entre em contato conosco.",
] as const;

const SUPPORT_LINE = "relacionamento.mkt@cdpipharma.com.br | +55 (62) 3636-9909 / (62) 99610-1694";

export function confirmationKindForPaymentMethod(
  paymentMethod: string | null | undefined,
): TicketConfirmationKind {
  if (paymentMethod === "courtesy") return "courtesy";
  if (paymentMethod === "free") return "free";
  return "paid";
}

function formatTicketEventDate(date: Date): string {
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

export function buildTicketEmailHtml(data: TicketEmailData): string {
  const eventDate = formatTicketEventDate(data.eventDate);
  const confirmation = TICKET_CONFIRMATION_LINE[data.confirmationKind];
  const instructions = TICKET_INSTRUCTIONS.map((line) => `<li>${line}</li>`).join(
    "\n                ",
  );

  return `
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
            <p>${confirmation} Aqui está seu ingresso para o evento:</p>
            
            <div class="ticket">
              <h3>${data.eventTitle}</h3>
              <div class="event-details">
                <p><strong>📅 Data:</strong> ${eventDate}</p>
                <p><strong>📍 Local:</strong> ${data.eventLocation}</p>
                <p><strong>🎟️ Pedido:</strong> #${data.orderId}</p>
              </div>
              
              <div class="qr-code">
                <p><strong>QR Code do Ingresso:</strong></p>
                <img src="cid:qrcode" alt="QR Code do Ingresso" style="max-width: 256px; height: auto; display: block; margin: 10px auto;">
                <p style="font-size: 12px; color: #666;">
                  Apresente este QR Code na entrada do evento
                </p>
              </div>
            </div>
            
            <div style="background: #BBE1FA; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4>📋 Instruções Importantes:</h4>
              <ul style="text-align: left;">
                ${instructions}
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>CDPI Pass</p>
            <p>${SUPPORT_LINE}</p>
          </div>
        </div>
      </body>
      </html>
    `;
}

export function buildTicketEmailText(data: TicketEmailData): string {
  const eventDate = formatTicketEventDate(data.eventDate);
  const confirmation = TICKET_CONFIRMATION_LINE[data.confirmationKind];
  const instructions = TICKET_INSTRUCTIONS.map((line) => `      - ${line}`).join("\n");

  return `
      CDPI Pass - Seu Ingresso
      
      Olá, ${data.userName}!
      
      ${confirmation} Detalhes do evento:
      
      Evento: ${data.eventTitle}
      Data: ${eventDate}
      Local: ${data.eventLocation}
      Pedido: #${data.orderId}
      
      Importante: Seu QR Code está anexado neste email. Para visualizá-lo, abra este email em HTML ou acesse sua conta no site.
      
      Instruções Importantes:
${instructions}
    `;
}
