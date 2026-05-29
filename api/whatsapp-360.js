// Webhook que recebe mensagens do 360dialog (WhatsApp Cloud API)
// Formato do payload segue o padrão da Meta WhatsApp Cloud API

import { processarMensagem } from '../lib/flow.js';
import { marcarMensagemProcessada } from '../lib/store.js';

export default async function handler(req, res) {
  // O 360dialog valida o webhook com um GET na configuração inicial
  if (req.method === 'GET') {
    return res.status(200).send('ok');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const body = req.body || {};
    console.log('360 webhook recebido:', JSON.stringify(body).substring(0, 500));

    const entry = body.entry && body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const value = change && change.value;
    const messages = value && value.messages;

    if (!messages || messages.length === 0) {
      // Pode ser um evento de status (entregue, lido), ignoramos
      return res.status(200).json({ ok: true });
    }

    const message = messages[0];
    const from = message.from; // número do usuário, formato 55DDDNUMERO
    const messageId = message.id;

    // Deduplicação: se essa mensagem já foi processada, ignora
    const isNova = await marcarMensagemProcessada(messageId);
    if (!isNova) {
      console.log('mensagem duplicada ignorada:', messageId);
      return res.status(200).json({ ok: true, duplicate: true });
    }

    // Nome do perfil do WhatsApp, se disponível
    const contacts = value.contacts && value.contacts[0];
    const nomePerfil = contacts && contacts.profile && contacts.profile.name;

    let textoMsg = '';
    let opcaoBotao = '';

    if (message.type === 'text') {
      textoMsg = message.text && message.text.body;
    } else if (message.type === 'interactive') {
      // Resposta de botão
      const interactive = message.interactive;
      if (interactive && interactive.button_reply) {
        opcaoBotao = interactive.button_reply.id;
        textoMsg = interactive.button_reply.title;
      } else if (interactive && interactive.list_reply) {
        opcaoBotao = interactive.list_reply.id;
        textoMsg = interactive.list_reply.title;
      }
    } else if (message.type === 'image') {
      // Foto: na fase 3 vamos processar. Por enquanto avisamos.
      textoMsg = '__IMAGE__';
    }

    await processarMensagem(from, textoMsg, opcaoBotao, nomePerfil);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('erro no webhook 360:', err.message);
    // Mesmo com erro, responde 200 para não gerar re-tentativa em loop
    return res.status(200).json({ ok: false, error: err.message });
  }
}
