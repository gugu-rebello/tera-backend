// Fila de alertas internos: a ponte do Tiago Lins (bridge.js, máquina do escritório)
// consulta este endpoint e posta cada mensagem no grupo Comercial.
// GET ?s={ALERTAS_SECRET}&max=10 → { total, mensagens } (FIFO; o que é retornado sai da fila)

import { drenarAlertas } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const secret = (process.env.ALERTAS_SECRET || '').trim();
  if (!secret || req.query.s !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const max = parseInt(req.query.max, 10) || 10;
  const mensagens = await drenarAlertas(max);
  return res.status(200).json({ total: mensagens.length, mensagens: mensagens });
}
