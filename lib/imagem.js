// Processa foto de nota fiscal: baixa do WhatsApp (360dialog) e envia para a API de imagem da Tera.
// Fluxo assíncrono: POST retorna um id, depois consultamos o status até vir a chave de acesso.

const D360_MEDIA_URL = 'https://waba-v2.360dialog.io';
const TERA_IMAGE_POST = 'https://api.terabr.com/v1/receipt/qr-code/image';
const TERA_IMAGE_GET = 'https://api.terabr.com/v1/receipt/qr-code/image/';

// Baixa a imagem do WhatsApp a partir do media id.
// O 360dialog exige 2 passos: pegar a URL da mídia, depois baixar os bytes.
export async function baixarImagemWhatsapp(mediaId) {
  const apiKey = process.env.D360_API_KEY;
  if (!apiKey) {
    console.error('D360_API_KEY ausente');
    return null;
  }

  try {
    // Passo 1: pega a URL temporária da mídia
    const metaResp = await fetch(D360_MEDIA_URL + '/' + mediaId, {
      headers: { 'D360-API-KEY': apiKey }
    });
    if (!metaResp.ok) {
      console.error('erro ao pegar meta da midia:', metaResp.status);
      return null;
    }
    const meta = await metaResp.json();
    const mediaUrl = meta.url;
    if (!mediaUrl) {
      console.error('midia sem url');
      return null;
    }

    // Passo 2: baixa os bytes da imagem (também autenticado)
    const fileResp = await fetch(mediaUrl, {
      headers: { 'D360-API-KEY': apiKey }
    });
    if (!fileResp.ok) {
      console.error('erro ao baixar bytes da midia:', fileResp.status);
      return null;
    }

    const arrayBuffer = await fileResp.arrayBuffer();
    const mimeType = meta.mime_type || fileResp.headers.get('content-type') || 'image/jpeg';

    return { buffer: Buffer.from(arrayBuffer), mimeType: mimeType };
  } catch (err) {
    console.error('erro baixarImagemWhatsapp:', err.message);
    return null;
  }
}

// Envia a imagem para a API de imagem da Tera. Retorna o id para consulta.
export async function enviarImagemParaTera(buffer, mimeType) {
  const token = (process.env.TERA_API_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  if (!token) {
    console.error('TERA_API_TOKEN ausente');
    return null;
  }

  try {
    const ext = mimeType.indexOf('png') !== -1 ? 'png' : 'jpg';
    const blob = new Blob([buffer], { type: mimeType });
    const form = new FormData();
    form.append('image', blob, 'nota.' + ext);

    const resp = await fetch(TERA_IMAGE_POST, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: form
    });
    const data = await resp.json();
    console.log('tera imagem POST:', resp.status, JSON.stringify(data).substring(0, 120));

    if (!resp.ok || !data.id) return null;
    return data.id;
  } catch (err) {
    console.error('erro enviarImagemParaTera:', err.message);
    return null;
  }
}

// Consulta o status do processamento OCR da imagem.
// Retorna { status, chave } onde status pode ser PROCESSING, OK, INVALID, ERROR.
export async function consultarImagem(imageId) {
  const token = (process.env.TERA_API_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  if (!token) return { status: 'ERROR' };

  try {
    const resp = await fetch(TERA_IMAGE_GET + imageId, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await resp.json();

    if (data.status === 'OK' && data.result && data.result.length > 0) {
      // Pega o primeiro QR code lido que tenha chave de acesso
      const comChave = data.result.find(function (r) { return r.accessKey; });
      if (comChave) {
        return { status: 'OK', chave: comChave.accessKey, itemStatus: comChave.status };
      }
      return { status: 'INVALID' };
    }

    return { status: data.status || 'PROCESSING' };
  } catch (err) {
    console.error('erro consultarImagem:', err.message);
    return { status: 'ERROR' };
  }
}

// Faz polling do resultado da imagem por até ~maxTentativas, com intervalo entre elas.
// O OCR é rápido (segundos), então poucas tentativas resolvem.
export async function aguardarResultadoImagem(imageId, maxTentativas, intervaloMs) {
  const max = maxTentativas || 8;
  const intervalo = intervaloMs || 1500;

  for (let i = 0; i < max; i++) {
    const r = await consultarImagem(imageId);
    if (r.status !== 'PROCESSING') {
      return r;
    }
    await new Promise(function (resolve) { setTimeout(resolve, intervalo); });
  }
  return { status: 'TIMEOUT' };
}
