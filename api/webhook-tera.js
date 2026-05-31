// Webhook que a Tera chama quando uma nota muda de status.
// Quando a nota fica OK, busca os dados, descobre o dono (meta.wa ou associação no KV)
// e envia a confirmação rica com itens, valor e contador.

import { buscarDadosNota } from '../lib/nota.js';
import { confirmarNotaComDados } from '../lib/confirmacao.js';
import { buscarTelefonePorChave } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const expectedToken = (process.env.TERA_WEBHOOK_TOKEN || '').trim();
  const authHeader = req.headers['authentication'] || req.headers['authorization'] || '';
  const sentToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (expectedToken && sentToken !== expectedToken) {
    console.warn('webhook tera com token invalido');
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { eventType, eventData } = req.body || {};
  console.log('webhook tera:', eventType, JSON.stringify(eventData));

  if (eventType === 'RECEIPT_STATUS_UPDATED') {
    const accessKey = eventData && eventData.accessKey;
    const status = eventData && eventData.status;

    if (status === 'OK' && accessKey) {
      await processarNotaPronta(accessKey);
    } else if (status === 'INVALID') {
      console.log('nota invalida:', accessKey);
    }
  }

  return res.status(200).json({ received: true });
}

async function processarNotaPronta(accessKey) {
  // Busca os dados completos da nota
  const dados = await buscarDadosNota(accessKey);
  if (!dados.ok) {
    console.log('nao consegui buscar dados da nota:', accessKey);
    return;
  }

  // Descobre o dono: 1º o meta.wa (caminhos digitar/portal),
  // 2º a associação chave->telefone no KV (caso da foto, meta vem null)
  let phone = dados.metaWa;
  if (!phone) {
    phone = await buscarTelefonePorChave(accessKey);
  }

  if (!phone) {
    console.log('nota sem dono identificavel (sem meta.wa e sem associacao no KV):', accessKey);
    return;
  }

  // Registra no contador e envia a confirmação rica
  await confirmarNotaComDados(phone, accessKey, dados);
}
