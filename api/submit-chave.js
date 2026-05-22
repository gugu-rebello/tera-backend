export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = process.env.TERA_API_TOKEN;

  const debug = {
    hasToken: !!token,
    tokenLength: token ? token.length : 0,
    tokenFirstChars: token ? token.substring(0, 6) : null,
    tokenLastChars: token ? token.substring(token.length - 4) : null,
    tokenHasSpaces: token ? token.includes(' ') : false,
    tokenHasNewline: token ? (token.includes('\n') || token.includes('\r')) : false,
    tokenStartsWithBearer: token ? token.toLowerCase().startsWith('bearer') : false,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV
  };

  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'debug endpoint',
      debug: debug
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { chaveAcesso, urlQrCode, meta } = req.body || {};

  if (!chaveAcesso && !urlQrCode) {
    return res.status(400).json({
      error: 'envie chaveAcesso ou urlQrCode',
      debug: debug
    });
  }

  if (!token) {
    return res.status(500).json({ error: 'config error', debug: debug });
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
        'Authentication': 'Bearer ' + cleanToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        qrCodes: [qrCodeEntry],
        reprocess: false
      })
    });

    const data = await teraResponse.json();
    console.log('Tera response:', teraResponse.status, JSON.stringify(data));

    return res.status(teraResponse.status).json({
      teraStatus: teraResponse.status,
      teraResponse: data,
      sentHeader: 'Bearer ' + cleanToken.substring(0, 6) + '...' + cleanToken.substring(cleanToken.length - 4),
      debug: debug
    });

  } catch (err) {
    return res.status(500).json({ error: 'erro interno', details: err.message, debug: debug });
  }
}
