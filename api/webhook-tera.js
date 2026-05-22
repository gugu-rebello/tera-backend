export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const expectedToken = process.env.TERA_WEBHOOK_TOKEN;
  if (expectedToken) {
    const authHeader = req.headers['authentication'] || req.headers['authorization'];
    const sentToken = authHeader && authHeader.replace(/^Bearer\s+/i, '');
    if (sentToken !== expectedToken) {
      console.warn('webhook com token invalido');
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  const { eventType, eventData } = req.body || {};

  console.log('webhook recebido:', eventType, JSON.stringify(eventData));

  if (eventType === 'RECEIPT_STATUS_UPDATED') {
    const { accessKey, status } = eventData || {};
    console.log(`nota ${accessKey} mudou para status ${status}`);
  }

  return res.status(200).json({ received: true });
}
