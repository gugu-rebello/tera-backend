// Status diário do teste de leitura: quantidade de notas por contato no dia (fuso SP),
// enfileirado para a ponte postar no grupo Comercial.
// Disparo: cron do Vercel (Authorization: Bearer {CRON_SECRET}) ou manual com ?s={ALERTAS_SECRET}.

import { lerNotasDoDia, enfileirarAlerta, getUser } from '../lib/store.js';

export default async function handler(req, res) {
  const alertasSecret = (process.env.ALERTAS_SECRET || '').trim();
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const autorizado = (cronSecret && auth === cronSecret) || (alertasSecret && req.query.s === alertasSecret);
  if (!autorizado) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const contagens = await lerNotasDoDia();
  const phones = Object.keys(contagens || {});
  const dataSP = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  let msg = '📊 *Status do dia ' + dataSP + ' - Teste de leitura*\n\n';

  if (phones.length === 0) {
    msg += 'Nenhuma nota enviada hoje.';
  } else {
    // Ordena do maior volume para o menor (abuso aparece no topo)
    phones.sort(function (a, b) { return (contagens[b] || 0) - (contagens[a] || 0); });

    let totalNotas = 0;
    const linhas = [];
    for (const phone of phones) {
      const qtd = parseInt(contagens[phone], 10) || 0;
      totalNotas += qtd;
      const user = await getUser(phone);
      const nome = (user && user.nome) || '(sem nome)';
      const email = (user && user.email) || '(sem e-mail)';
      const aviso = qtd >= 10 ? ' ⚠️ volume alto' : '';
      linhas.push('• ' + nome + ' (' + phone + ', ' + email + '): ' + qtd + (qtd === 1 ? ' nota' : ' notas') + aviso);
    }

    msg += phones.length + (phones.length === 1 ? ' contato mandou ' : ' contatos mandaram ') +
      totalNotas + (totalNotas === 1 ? ' nota' : ' notas') + ' hoje:\n\n' + linhas.join('\n');
  }

  await enfileirarAlerta(msg);
  return res.status(200).json({ ok: true, contatos: phones.length });
}
