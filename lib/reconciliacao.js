// Reconciliação das fotos que estouraram o polling do OCR (TIMEOUT).
// Só AVISA quando o QR é DEFINITIVAMENTE ilegível (status INVALID do OCR). Nos demais casos
// fica quieto para NÃO contradizer o webhook (que ainda pode confirmar a nota depois):
//   - OK (chave lida)            : o webhook confirma sozinho (meta.wa). Só remove.
//   - INVALID (QR ilegível)      : avisa que aquela foto ANTERIOR não deu, e remove.
//   - ERROR / PROCESSING         : NÃO avisa (pode ser transitório, imageId expirado, ou nota
//                                  lenta/contingência que ainda vai confirmar). Só limpa a
//                                  pendência em silêncio depois de muito tempo.
// Idempotente (claim atômico HDEL, nunca avisa 2x). Disparo: piggyback no webhook 360 + endpoint.

import { lerFotosPendentes, claimFotoPendente } from './store.js';
import { consultarImagem } from './imagem.js';
import { sendText } from './whatsapp.js';

const PORTAL_URL = process.env.PORTAL_URL || 'https://promo.terabr.com';
const BOT_NUMBER = process.env.WHATSAPP_BOT_NUMBER || '5511980470391';
const ESPERA_MIN_MS = 90 * 1000;              // dá 90s para o webhook confirmar antes de intervir
const LIMPEZA_MS = 3 * 60 * 60 * 1000;        // limpa (sem avisar) pendência ERROR/PROCESSING antiga

function linkPortal(phone) {
  return PORTAL_URL + '/?wa=' + BOT_NUMBER + '&u=' + phone + '&t=' + Date.now();
}

// Aviso sobre uma foto ANTERIOR (não a última que o usuário mandou), para não parecer que a
// atual falhou. Só sai quando o QR foi definitivamente ilegível.
function msgFotoAnteriorNaoLida(phone) {
  return 'ℹ️ Sobre uma foto que você tinha enviado *antes* e ficou pendente: não consegui ler o QR code dela.\n\n' +
    'Se *aquela* nota ainda não foi confirmada aqui, é só reenviar (a última que você mandou agora não é afetada):\n' +
    '🔢 Digite os *44 números* da chave de acesso (logo acima do QR code)\n' +
    '🔗 Ou envie a nota pelo site: ' + linkPortal(phone);
}

export async function reconciliarFotos() {
  const pend = await lerFotosPendentes();
  const ids = Object.keys(pend);
  if (ids.length === 0) return { checadas: 0, avisadas: 0 };

  const agora = Date.now();
  let avisadas = 0;

  for (const imageId of ids) {
    let info;
    try { info = typeof pend[imageId] === 'string' ? JSON.parse(pend[imageId]) : pend[imageId]; }
    catch (e) { info = null; }
    if (!info || !info.phone) { await claimFotoPendente(imageId); continue; }

    const idade = agora - (info.ts || 0);
    if (idade < ESPERA_MIN_MS) continue; // dá tempo do webhook agir primeiro

    let r;
    try { r = await consultarImagem(imageId); } catch (e) { r = { status: 'ERROR' }; }

    if (r.status === 'OK' && r.chave) {
      // Deu certo: o webhook confirma com os dados (meta.wa). Só remove.
      await claimFotoPendente(imageId);
    } else if (r.status === 'INVALID') {
      // QR definitivamente ilegível: aí sim avisamos (sobre a foto ANTERIOR).
      if (await claimFotoPendente(imageId)) { await sendText(info.phone, msgFotoAnteriorNaoLida(info.phone)); avisadas++; }
    } else if (idade > LIMPEZA_MS) {
      // ERROR/PROCESSING há muito tempo: limpa em silêncio (não avisa, para não contradizer
      // um webhook que ainda possa confirmar; a copy honesta do TIMEOUT já orientou o usuário).
      await claimFotoPendente(imageId);
    }
    // senão (ERROR/PROCESSING recente): deixa para a próxima passada
  }

  return { checadas: ids.length, avisadas: avisadas };
}
