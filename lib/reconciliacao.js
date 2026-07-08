// Reconciliação das fotos que estouraram o polling do OCR (TIMEOUT).
// Fecha o loop para o usuário não ficar sem retorno:
//   - Deu certo (chave lida): o webhook (RECEIPT_STATUS_UPDATED OK) confirma sozinho, via
//     meta.wa. Aqui só tiramos da lista.
//   - Deu INVALID/ERROR, ou travou há muito tempo: avisamos que não deu e pedimos para
//     digitar/usar o site.
//   - Ainda processando e recente: deixa para a próxima passada.
// É disparada por: piggyback no webhook do 360 (toda mensagem) e pelo endpoint
// /api/reconciliar-fotos (cron/QStash). Idempotente: usa claim atômico para não avisar 2x.

import { lerFotosPendentes, claimFotoPendente } from './store.js';
import { consultarImagem } from './imagem.js';
import { sendText } from './whatsapp.js';

const PORTAL_URL = process.env.PORTAL_URL || 'https://promo.terabr.com';
const BOT_NUMBER = process.env.WHATSAPP_BOT_NUMBER || '5511980470391';
const ESPERA_MIN_MS = 90 * 1000;         // dá 90s para o webhook confirmar antes de intervir
const DESISTIR_MS = 15 * 60 * 1000;      // após ~15 min processando, desiste e avisa

function linkPortal(phone) {
  return PORTAL_URL + '/?wa=' + BOT_NUMBER + '&u=' + phone + '&t=' + Date.now();
}

function msgFotoFalhou(phone) {
  return '😕 *Não consegui ler o QR code daquela foto que você enviou.*\n\n' +
    'Provavelmente a imagem ou o QR code estava difícil de ler. Vamos de outro jeito, que é mais rápido:\n' +
    '🔢 Digite aqui os *44 números* da chave de acesso (ficam embaixo do QR code, na parte de baixo da nota)\n' +
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
    } else if (r.status === 'INVALID' || r.status === 'ERROR') {
      if (await claimFotoPendente(imageId)) { await sendText(info.phone, msgFotoFalhou(info.phone)); avisadas++; }
    } else if (idade > DESISTIR_MS) {
      // Processando há tempo demais: desiste e avisa.
      if (await claimFotoPendente(imageId)) { await sendText(info.phone, msgFotoFalhou(info.phone)); avisadas++; }
    }
    // senão (processando e ainda dentro do tempo): deixa para a próxima passada
  }

  return { checadas: ids.length, avisadas: avisadas };
}
