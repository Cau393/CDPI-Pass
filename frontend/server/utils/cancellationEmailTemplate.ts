import { EMAIL_CONTACT_FOOTER_HTML } from "@shared/contact";
import { renderTemplate } from "./templateRenderer";

const CANCELLATION_EMAIL_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a;">
  <p>Olá, <strong>{nome}</strong>,</p>
  <p>Sua inscrição no evento <strong>{evento}</strong> foi <strong>cancelada</strong> pela organização.</p>
  <p>O QR Code do ingresso foi invalidado e não poderá mais ser utilizado na entrada.</p>
  <p style="margin-top: 1.5rem; font-size: 0.9rem; color: #555;">
    Em caso de pagamento confirmado, eventuais estornos devem ser tratados diretamente com o financeiro / Asaas, conforme as regras do evento.
  </p>
  <p style="margin-top: 1.5rem;">Atenciosamente,<br />Equipe CDPI Pass</p>
  ${EMAIL_CONTACT_FOOTER_HTML}
</body>
</html>
`.trim();

export function buildCancellationEmailHtml(
  recipientName: string,
  eventTitle: string,
): string {
  return renderTemplate(CANCELLATION_EMAIL_HTML, {
    nome: recipientName,
    evento: eventTitle,
  });
}
