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
    return res.status(400).json({
      error: 'envie chaveAcesso ou urlQrCode'
    });
  }

  const token = process.env.TERA_API_TOKEN;
  if (!token) {
    console.error('TERA_API_TOKEN nao configurado');
    return res.status(500).json({ error: 'config error' });
  }

  const cleanToken = token.trim().replace(/^Bearer\s+/i, '');
  const urlToSend = urlQrCode || chaveAcesso;
  const qrCodeEntry = { url: urlToSend };
  if (meta && typeof meta === 'object') {
    qrCodeEntry.meta = meta;
  }

  try {
    const teraResponse = await fetch('https://api.terabr.com/v1/receipt/qr-code', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + cleanToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        qrCodes: [qrCodeEntry],
        reprocess: false
      })
    });

    const data = await teraResponse.json();
    console.log('Tera response status:', teraResponse.status);

    if (!teraResponse.ok) {
      return res.status(teraResponse.status).json({
        error: 'falha na api da tera',
        details: data
      });
    }

    const firstResult = data.result && data.result[0];
    if (!firstResult) {
      return res.status(500).json({ error: 'resposta vazia da tera' });
    }

    if (meta && meta.wa && (firstResult.status === 'RECEIVED' || firstResult.status === 'DUPLICATED')) {
      let msg = '';
      if (firstResult.status === 'DUPLICATED') {
        msg = 'Ops! Essa nota já foi enviada antes 🤔\n\nManda outra nota fiscal pra concorrer!';
      } else {
        msg = '📥 *Nota recebida!*\n\nEstamos validando sua nota fiscal. Em alguns minutos te aviso aqui se sua participação foi confirmada. 🎯';
      }
      try {
        await sendWhatsApp('whatsapp:+' + meta.wa, msg);
      } catch (err) {
        console.error('erro ao mandar wa de confirmacao imediata:', err.message);
      }
    }

    return res.status(200).json({
      status: firstResult.status,
      accessKey: firstResult.accessKey || firstResult.accesskey,
      message: firstResult.message,
      receipt: firstResult
    });

  } catch (err) {
    console.error('erro ao chamar tera:', err);
    return res.status(500).json({ error: 'erro interno', details: err.message });
  }
}

async function sendWhatsApp(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !fromNumber) {
    console.error('twilio config ausente no submit-chave');
    return;
  }

  const url = 'https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json';
  const auth = Buffer.from(sid + ':' + token).toString('base64');

  const params = new URLSearchParams();
  params.append('From', fromNumber);
  params.append('To', to);
  params.append('Body', body);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  const respText = await resp.text();
  console.log('twilio send (submit):', resp.status, respText.substring(0, 300));
}
