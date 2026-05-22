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

  const urlToSend = urlQrCode || chaveAcesso;

  const qrCodeEntry = { url: urlToSend };
  if (meta && typeof meta === 'object') {
    qrCodeEntry.meta = meta;
  }

  try {
    const teraResponse = await fetch('https://api.terabr.com/v1/receipt/qr-code', {
      method: 'POST',
      headers: {
        'Authentication': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        qrCodes: [qrCodeEntry],
        reprocess: false
      })
    });

    const data = await teraResponse.json();

    console.log('Tera response:', teraResponse.status, JSON.stringify(data));

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

    return res.status(200).json({
      status: firstResult.status,
      accessKey: firstResult.accesskey,
      message: firstResult.message
    });

  } catch (err) {
    console.error('erro ao chamar tera:', err);
    return res.status(500).json({ error: 'erro interno', details: err.message });
  }
}
