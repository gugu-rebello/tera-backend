// Webhook que a Tera chama quando uma nota muda de status.
// Quando a nota fica OK, consulta os dados completos e avisa o usuário no WhatsApp
// com estabelecimento, qtd de itens, valor total e contador de notas do mês.

import { sendText } from '../lib/whatsapp.js';
import { registrarNota, contarNotasMes } from '../lib/store.js';

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
      await consultarEAvisar(accessKey);
    } else if (status === 'INVALID') {
      console.log('nota invalida:', accessKey);
    }
  }

  return res.status(200).json({ received: true });
}

async function consultarEAvisar(accessKey) {
  const teraToken = (process.env.TERA_API_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  if (!teraToken) {
    console.error('TERA_API_TOKEN ausente');
    return;
  }

  try {
    const teraResp = await fetch('https://api.terabr.com/v1/receipt/' + accessKey, {
      headers: { 'Authorization': 'Bearer ' + teraToken }
    });
    const data = await teraResp.json();

    if (data.status !== 'OK' || !data.meta || !data.meta.wa) {
      console.log('nota sem wa no meta, ignora:', accessKey);
      return;
    }

    const wa = data.meta.wa;
    const receipt = data.receipt || {};
    const empresa = receipt.companyTradeName || receipt.companyName || null;
    const valor = (typeof receipt.totalValue === 'number')
      ? receipt.totalValue.toFixed(2).replace('.', ',')
      : null;
    const qtdItens = Array.isArray(receipt.items) ? receipt.items.length : null;

    // Registra a nota no contador do mês (dedupe por chave dentro do set)
    const totalMes = await registrarNota(wa, accessKey);

    // Monta a confirmação rica
    let msg = '✅ *Participação confirmada!*\n\n';
    if (empresa) {
      msg += '🏪 ' + empresa + '\n';
    }
    if (qtdItens !== null) {
      msg += '🛒 ' + qtdItens + (qtdItens === 1 ? ' item' : ' itens') + '\n';
    }
    if (valor) {
      msg += '💰 R$ ' + valor + '\n';
    }

    if (totalMes && totalMes > 0) {
      const mesNome = nomeMesAtual();
      msg += '\n📊 Você já enviou *' + totalMes + (totalMes === 1 ? ' nota' : ' notas') + '* em ' + mesNome + '!';
    }

    msg += '\n\nContinue participando! 🎯';

    await sendText(wa, msg);

  } catch (err) {
    console.error('erro ao consultar nota:', err.message);
  }
}

function nomeMesAtual() {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return meses[new Date().getMonth()];
}
