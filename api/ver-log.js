// Endpoint para consultar o log de mensagens recebidas pelo navegador.
// Protegido por uma senha simples via query string (?s=SENHA).
// Acesso: https://tera-backend.vercel.app/api/ver-log?s=SUA_SENHA

import { lerLogMensagens } from '../lib/store.js';

export default async function handler(req, res) {
  const senha = process.env.LOG_VIEW_SECRET;
  const enviada = req.query && req.query.s;

  if (!senha || enviada !== senha) {
    return res.status(401).json({ error: 'não autorizado' });
  }

  const n = parseInt((req.query && req.query.n) || '50', 10);
  const log = await lerLogMensagens(n);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json({
    total: log.length,
    mensagens: log
  });
}
