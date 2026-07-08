// Verificador das fotos pendentes (que deram TIMEOUT no OCR). Fecha o loop para o
// usuário: confirma (via webhook) ou avisa que não deu. Pode ser chamado por:
//   - cron do Vercel / Upstash QStash (agendado)
//   - piggyback: o próprio webhook do 360 chama reconciliarFotos() a cada mensagem
// Auth: header Authorization: Bearer {CRON_SECRET} (cron do Vercel) OU ?s={ALERTAS_SECRET}.

import { reconciliarFotos } from '../lib/reconciliacao.js';

export default async function handler(req, res) {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const alertasSecret = (process.env.ALERTAS_SECRET || '').trim();
  const authHeader = req.headers['authorization'] || '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();

  const autorizado =
    (cronSecret && bearer === cronSecret) ||
    (alertasSecret && req.query && req.query.s === alertasSecret);

  if (!autorizado) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const r = await reconciliarFotos();
    return res.status(200).json({ ok: true, ...r });
  } catch (err) {
    console.error('erro reconciliar-fotos:', err.message);
    return res.status(200).json({ ok: false, error: err.message });
  }
}
