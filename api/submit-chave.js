// Endpoint chamado pelo portal web (promo.terabr.com) quando lê um QR code.
// Recebe a chave/url + meta {wa, email, nome}, submete na Tera e confirma no WhatsApp via 360dialog.

import { sendText } from '../lib/whatsapp.js';
import { msgNotaNaFila } from '../lib/mensagens.js';
import { registrarEnvio } from '../lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { chaveAcesso, urlQrCode, meta } = req.body || {};

  if (!chaveAcesso && !urlQrCode) {
    return res.status(400).json({ error: 'envie chaveAcesso ou urlQrCode' });
  }

  const token = (process.env.TERA_API_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  if (!token) {
    console.error('TERA_API_TOKEN nao configurado');
    return res.status(500).json({ error: 'config error' });
  }

  const urlToSend = urlQrCode || chaveAcesso;
  const qrCodeEntry = { url: urlToSend };
  if (meta && typeof meta === 'object') {
    qrCodeEntry.meta = meta;
  }

  // Conta o envio pelo portal (acompanhamento do time, janela de 24h).
  if (meta && meta.wa) {
    await registrarEnvio(meta.wa);
  }

  try {
    const teraResponse = await fetch('https://api.terabr.com/v1/receipt/qr-code', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        qrCodes: [qrCodeEntry],
        reprocess: false
      })
    });

    const data = await teraResponse.json();
    console.log('submit-chave tera status:', teraResponse.status);

    if (!teraResponse.ok) {
      return res.status(teraResponse.status).json({ error: 'falha na api da tera', details: data });
    }

    const firstResult = data.result && data.result[0];
    if (!firstResult) {
      return res.status(500).json({ error: 'resposta vazia da tera' });
    }

    // Confirmação imediata no WhatsApp (via 360dialog) se veio o número
    if (meta && meta.wa && (firstResult.status === 'RECEIVED' || firstResult.status === 'DUPLICATED')) {
      const chaveLida = firstResult.accessKey || firstResult.accesskey || chaveAcesso;
      let msg;
      if (firstResult.status === 'DUPLICATED') {
        msg = '🔁 Essa nota já tinha sido enviada antes!\n\nManda outra nota fiscal para continuar participando. 🎯';
      } else {
        msg = msgNotaNaFila(chaveLida);
      }
      try {
        await sendText(meta.wa, msg);
      } catch (err) {
        console.error('erro ao mandar wa de confirmacao imediata:', err.message);
      }
    }

    return res.status(200).json({
      status: firstResult.status,
      accessKey: firstResult.accessKey || firstResult.accesskey,
      message: firstResult.message
    });

  } catch (err) {
    console.error('erro ao chamar tera:', err);
    return res.status(500).json({ error: 'erro interno', details: err.message });
  }
}
