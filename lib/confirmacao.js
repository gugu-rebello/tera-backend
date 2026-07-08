// Monta e envia a mensagem de confirmação rica da nota (estabelecimento, itens, valor, contador).
// Compartilhado entre o webhook (nota nova processada) e o Caso B (nota já existente buscada pela chave).

import { sendText } from './whatsapp.js';
import { registrarNota, registrarConfirmada } from './store.js';

function nomeMesAtual() {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return meses[new Date().getMonth()];
}

// Registra a nota no contador do mês e envia a confirmação completa.
// dados = { empresa, qtdItens, valor } vindos de buscarDadosNota.
export async function confirmarNotaComDados(phone, accessKey, dados) {
  // Contador MENSAL do participante (dedupe por chave no mês).
  const totalMes = await registrarNota(phone, accessKey);
  // Evento de confirmação para o acompanhamento do time (janela de 24h).
  await registrarConfirmada(phone, accessKey);

  let msg = '✅ *Participação confirmada!*\n\n';
  if (dados.empresa) {
    msg += '🏪 ' + dados.empresa + '\n';
  }
  if (dados.qtdItens !== null && dados.qtdItens !== undefined) {
    msg += '🛒 ' + dados.qtdItens + (dados.qtdItens === 1 ? ' item' : ' itens') + '\n';
  }
  if (dados.valor !== null && dados.valor !== undefined) {
    msg += '💰 R$ ' + Number(dados.valor).toFixed(2).replace('.', ',') + '\n';
  }

  if (totalMes && totalMes > 0) {
    msg += '\n📊 Você já enviou *' + totalMes + (totalMes === 1 ? ' nota' : ' notas') + '* em ' + nomeMesAtual() + '!';
  }

  msg += '\n\nContinue participando! 🎯';

  await sendText(phone, msg);
  return totalMes;
}
