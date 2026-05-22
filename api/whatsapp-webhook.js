export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('method not allowed');
  }

  const from = req.body.From || '';
  const body = (req.body.Body || '').trim();
  const profileName = req.body.ProfileName || 'amigo';

  console.log('whatsapp in:', from, 'msg:', body);

  const userPhone = from.replace('whatsapp:', '').replace(/\D/g, '');

  const baseUrl = process.env.WEBVIEW_BASE_URL || 'https://gugu-rebello.github.io/qrtera-demo';
  const botNumber = process.env.WHATSAPP_BOT_NUMBER || '14155238886';
  const webviewLink = baseUrl + '/?wa=' + botNumber + '&u=' + userPhone + '&t=' + Date.now();

  const reply = [
    'Oi ' + profileName.split(' ')[0] + '! 👋',
    '',
    'Bem-vindo à *Promoção Demo Tera*.',
    '',
    'Pra participar, é simples:',
    '1. Clique no link abaixo',
    '2. Aponte a câmera pro QR code da sua nota fiscal',
    '3. Pronto!',
    '',
    '👉 ' + webviewLink
  ].join('\n');

  await sendWhatsApp(from, reply);

  return res.status(200).send('<Response></Response>');
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
    const data = await resp.json();
    console.log('twilio response:', resp.status, JSON.stringify(data).substring(0, 200));
  } catch (err) {
    console.error('erro twilio:', err.message);
  }
}
