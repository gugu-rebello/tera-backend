export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const expectedToken = process.env.TERA_WEBHOOK_TOKEN;
  if (expectedToken) {
    const authHeader = req.headers['authentication'] || req.headers['authorization'];
    const sentToken = authHeader && authHeader.replace(/^Bearer\s+/i, '');
    if (sentToken !== expectedToken) {
      console.warn('webhook tera com token invalido');
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  const { eventType, eventData } = req.body || {};
  console.log('webhook tera:', eventType, JSON.stringify(eventData));

  if (eventType === 'RECEIPT_STATUS_UPDATED') {
    const accessKey = eventData && eventData.accessKey;
    const status = eventData && eventData.status;

    if (status === 'OK' && accessKey) {
      await consultarEAvisar(accessKey);
    } else if (status === 'INVALID') {
      console.log('nota invalida:', accessKey);
    }
  }

  return res.status(200).json({ received: true });
}

async function consultarEAvisar(accessKey) {
  const teraToken = process.env.TERA_API_TOKEN;
  if (!teraToken) {
    console.error('TERA_API_TOKEN ausente');
    return;
  }

  try {
    const cleanToken = teraToken.trim().replace(/^Bearer\s+/i, '');
    const teraResp = await fetch('https://api.terabr.com/v1/receipt/' + accessKey, {
      headers: { 'Authorization': 'Bearer ' + cleanToken }
    });
    const data = await teraResp.json();

    if (data.status !== 'OK' || !data.meta || !data.meta.wa) {
      console.log('nota sem wa no meta, ignora:', accessKey);
      return;
    }

    const wa = data.meta.wa;
    const receipt = data.receipt || {};
    const empresa = receipt.companyTradeName || receipt.companyName || 'estabelecimento';
    const valor = receipt.totalValue ? receipt.totalValue.toFixed(2).replace('.', ',') : null;

    let msg = '✅ *Sua participação foi confirmada!*\n\n';
    msg += 'Nota validada com sucesso 🎉\n\n';
    if (empresa && empresa !== 'estabelecimento') {
      msg += '🏪 ' + empresa + '\n';
    }
    if (valor) {
      msg += '💰 R$ ' + valor + '\n';
    }
    msg += '\nObrigado por participar da promoção!';

    await sendWhatsApp('whatsapp:+' + wa, msg);

  } catch (err) {
    console.error('erro ao consultar nota:', err.message);
  }
}

async function sendWhatsApp(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !fromNumber) {
    console.error('twilio config ausente');
    return;
  }

  const url = 'https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json';
  const auth = Buffer.from(sid + ':' + token).toString('base64');

  const params = new URLSearchParams();
  params.append('From', fromNumber);
  params.append('To', to);
  params.append('Body', body);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    console.log('twilio send:', resp.status);
  } catch (err) {
    console.error('erro twilio:', err.message);
  }
}
