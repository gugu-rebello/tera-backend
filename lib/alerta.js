// Alerta de novo lead: email (SendGrid) + WhatsApp individual para o time comercial

import { sendText } from './whatsapp.js';

// Números do time comercial que recebem alerta no WhatsApp (formato 55DDDNUMERO)
// TROCAR pelos números reais antes de subir
const COMERCIAL_PHONES = (process.env.COMERCIAL_PHONES || '').split(',').map(function (s) {
  return s.trim();
}).filter(Boolean);

// Emails do time comercial
const COMERCIAL_EMAILS = (process.env.COMERCIAL_EMAILS || '').split(',').map(function (s) {
  return s.trim();
}).filter(Boolean);

export async function alertarLead(lead) {
  const resumo = [
    'Nome: ' + (lead.nome || 'não informado'),
    'Contato: ' + (lead.contato || 'não informado'),
    'WhatsApp: +' + lead.phone
  ].join('\n');

  // 1. WhatsApp para o time comercial
  const msgWa = '🔔 *Novo lead da promoção Tera*\n\n' + resumo + '\n\nRetorne o quanto antes!';
  for (const phone of COMERCIAL_PHONES) {
    try {
      await sendText(phone, msgWa);
    } catch (err) {
      console.error('erro alerta wa para', phone, err.message);
    }
  }

  // 2. Email via SendGrid
  if (COMERCIAL_EMAILS.length > 0) {
    await enviarEmail(
      COMERCIAL_EMAILS,
      'Novo lead da promoção Tera',
      'Um novo lead chegou pelo chatbot:\n\n' + resumo
    );
  }
}

async function enviarEmail(destinatarios, assunto, corpo) {
  const sgKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (!sgKey || !fromEmail) {
    console.error('SendGrid config ausente (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL)');
    return;
  }

  try {
    const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + sgKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: destinatarios.map(function (e) { return { email: e }; })
        }],
        from: { email: fromEmail, name: 'Tera Promoções' },
        subject: assunto,
        content: [{ type: 'text/plain', value: corpo }]
      })
    });
    console.log('sendgrid:', resp.status);
  } catch (err) {
    console.error('erro sendgrid:', err.message);
  }
}
