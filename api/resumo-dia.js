// Status do teste de leitura: envios e confirmações por contato nas ÚLTIMAS 24H,
// enfileirado para a ponte postar no grupo Comercial.
// Janela deslizante de 24h (não dia calendário): roda no horário fixo do cron e cobre a
// noite anterior, sem depender do dedupe mensal. Disparo: cron do Vercel
// (Authorization: Bearer {CRON_SECRET}) ou manual com ?s={ALERTAS_SECRET}.

import { lerResumo24h, enfileirarAlerta, getUser } from '../lib/store.js';

export default async function handler(req, res) {
  const alertasSecret = (process.env.ALERTAS_SECRET || '').trim();
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const autorizado = (cronSecret && auth === cronSecret) || (alertasSecret && req.query.s === alertasSecret);
  if (!autorizado) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const resumo = await lerResumo24h();
  const phones = Object.keys(resumo || {});

  let msg = '📊 *Status (últimas 24h) - Teste de leitura*\n\n';

  if (phones.length === 0) {
    msg += 'Nenhuma nota enviada nas últimas 24h.';
  } else {
    // Ordena por envios (maior volume no topo, para abuso aparecer primeiro)
    phones.sort(function (a, b) { return (resumo[b].enviadas || 0) - (resumo[a].enviadas || 0); });

    let totalEnviadas = 0;
    let totalConfirmadas = 0;
    const linhas = [];
    for (const phone of phones) {
      const enviadas = resumo[phone].enviadas || 0;
      const confirmadas = resumo[phone].confirmadas || 0;
      totalEnviadas += enviadas;
      totalConfirmadas += confirmadas;
      const user = await getUser(phone);
      const nome = (user && user.nome) || '(sem nome)';
      const email = (user && user.email) || '(sem e-mail)';
      const aviso = enviadas >= 10 ? ' ⚠️ volume alto' : '';
      linhas.push('• ' + nome + ' (' + phone + ', ' + email + '): ' +
        enviadas + (enviadas === 1 ? ' enviada' : ' enviadas') + ', ' +
        confirmadas + (confirmadas === 1 ? ' confirmada' : ' confirmadas') + aviso);
    }

    msg += phones.length + (phones.length === 1 ? ' contato' : ' contatos') +
      ' · *' + totalEnviadas + '* enviadas / *' + totalConfirmadas + '* confirmadas:\n\n' +
      linhas.join('\n');
  }

  await enfileirarAlerta(msg);
  return res.status(200).json({ ok: true, contatos: phones.length });
}
