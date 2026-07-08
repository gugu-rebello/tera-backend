// Conexão com o Upstash Redis (Vercel KV)
// Usa as env vars KV_REST_API_URL e KV_REST_API_TOKEN injetadas pelo Vercel

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});

// ===== SESSÃO DA CONVERSA =====
// Guarda em que ponto do fluxo o usuário está. Expira em 24h.

export async function getSession(phone) {
  try {
    const data = await redis.get('sessao:' + phone);
    return data || { estado: 'novo' };
  } catch (err) {
    console.error('erro getSession:', err.message);
    return { estado: 'novo' };
  }
}

export async function setSession(phone, session) {
  try {
    await redis.set('sessao:' + phone, session, { ex: 60 * 60 * 24 });
  } catch (err) {
    console.error('erro setSession:', err.message);
  }
}

// ===== CADASTRO DO USUÁRIO =====
// Guarda dados permanentes do usuário (email, nome). Não expira.

export async function getUser(phone) {
  try {
    return await redis.get('usuario:' + phone);
  } catch (err) {
    console.error('erro getUser:', err.message);
    return null;
  }
}

export async function setUser(phone, user) {
  try {
    await redis.set('usuario:' + phone, user);
  } catch (err) {
    console.error('erro setUser:', err.message);
  }
}

// ===== CONTAGEM DE NOTAS POR MÊS =====
// Incrementa o contador de notas do usuário no mês calendário atual.

function mesAtual() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Dia calendário no fuso de São Paulo (YYYY-MM-DD), para o acompanhamento diário.
function diaSP() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export async function registrarNota(phone, accessKey) {
  try {
    const key = 'notas:' + phone + ':' + mesAtual();
    // SADD adiciona a chave ao set (dedupe automático no mês);
    // retorna 1 quando a chave é inédita no mês.
    const adicionou = await redis.sadd(key, accessKey);
    await redis.expire(key, 60 * 60 * 24 * 90); // mantém 90 dias
    // Nota inédita também conta no acompanhamento diário (status p/ o time)
    if (adicionou === 1) {
      const diaKey = 'alertaDia:' + diaSP();
      await redis.hincrby(diaKey, phone, 1);
      await redis.expire(diaKey, 60 * 60 * 24 * 7);
    }
    const total = await redis.scard(key);
    return total;
  } catch (err) {
    console.error('erro registrarNota:', err.message);
    return null;
  }
}

// Contagem de notas por telefone no dia de hoje (SP). Retorna { phone: qtd }.
export async function lerNotasDoDia() {
  try {
    return (await redis.hgetall('alertaDia:' + diaSP())) || {};
  } catch (err) {
    console.error('erro lerNotasDoDia:', err.message);
    return {};
  }
}

// ===== FILA DE ALERTAS INTERNOS =====
// O backend enfileira mensagens para o time; a ponte do Tiago Lins consome
// via /api/fila-alertas e posta no grupo Comercial. LPUSH + RPOP = FIFO.

export async function enfileirarAlerta(texto) {
  try {
    await redis.lpush('fila:alertas', texto);
    await redis.ltrim('fila:alertas', 0, 99); // nunca acumula mais que 100
  } catch (err) {
    console.error('erro enfileirarAlerta:', err.message);
  }
}

export async function drenarAlertas(max) {
  try {
    const n = Math.max(1, Math.min(max || 10, 20));
    const itens = await redis.rpop('fila:alertas', n);
    if (!itens) return [];
    return Array.isArray(itens) ? itens : [itens];
  } catch (err) {
    console.error('erro drenarAlertas:', err.message);
    return [];
  }
}

export async function contarNotasMes(phone) {
  try {
    const key = 'notas:' + phone + ':' + mesAtual();
    return await redis.scard(key);
  } catch (err) {
    console.error('erro contarNotasMes:', err.message);
    return 0;
  }
}

// Verifica se o telefone JÁ enviou essa chave no mês (camada 2), SEM registrar.
// SISMEMBER retorna 1 se a chave já está no set do mês.
export async function jaEnviouNota(phone, accessKey) {
  try {
    const key = 'notas:' + phone + ':' + mesAtual();
    const existe = await redis.sismember(key, accessKey);
    return existe === 1;
  } catch (err) {
    console.error('erro jaEnviouNota:', err.message);
    return false; // em dúvida, deixa seguir (melhor processar que bloquear)
  }
}

// ===== ASSOCIAÇÃO CHAVE -> TELEFONE =====
// Usada para o webhook achar o dono da nota quando o meta.wa não veio
// (caso da foto, cuja chave é registrada pela API de imagem sem o nosso meta).
// Guarda por 7 dias (tempo de sobra para o processamento/webhook).

export async function associarChaveTelefone(accessKey, phone) {
  try {
    await redis.set('chaveWa:' + accessKey, phone, { ex: 60 * 60 * 24 * 7 });
  } catch (err) {
    console.error('erro associarChaveTelefone:', err.message);
  }
}

export async function buscarTelefonePorChave(accessKey) {
  try {
    return await redis.get('chaveWa:' + accessKey);
  } catch (err) {
    console.error('erro buscarTelefonePorChave:', err.message);
    return null;
  }
}

// ===== LEAD =====
// Guarda um lead que pediu pra falar com humano.

export async function salvarLead(phone, lead) {
  try {
    const id = 'lead:' + phone;
    await redis.set(id, { ...lead, phone: phone, criadoEm: new Date().toISOString() });
  } catch (err) {
    console.error('erro salvarLead:', err.message);
  }
}

// ===== DEDUPLICAÇÃO DE MENSAGENS =====
// Evita processar a mesma mensagem 2x (whatsapp às vezes reenvia o webhook).
// Retorna true se a mensagem é NOVA (deve processar), false se já foi vista.

export async function marcarMensagemProcessada(messageId) {
  try {
    if (!messageId) return true;
    // SET com NX (só cria se não existir) e expira em 10 min
    const result = await redis.set('msg:' + messageId, '1', { nx: true, ex: 600 });
    // result === 'OK' significa que era nova; null significa que já existia
    return result === 'OK';
  } catch (err) {
    console.error('erro dedupe:', err.message);
    return true; // em caso de erro, processa (melhor duplicar que perder)
  }
}

// ===== LOG PERSISTENTE DE MENSAGENS RECEBIDAS =====
// Guarda toda mensagem que chega, num histórico consultável no painel do Upstash.
// Útil para investigar mensagens inesperadas sem depender do log de 30 min do Vercel.
// Mantém as últimas 200 entradas.

export async function logMensagemRecebida(dados) {
  try {
    const entrada = JSON.stringify({
      ts: new Date().toISOString(),
      ...dados
    });
    // LPUSH adiciona no início da lista
    await redis.lpush('log:mensagens', entrada);
    // LTRIM mantém só as últimas 200 (índices 0 a 199)
    await redis.ltrim('log:mensagens', 0, 199);
  } catch (err) {
    console.error('erro logMensagem:', err.message);
  }
}

// Recupera as últimas N mensagens do log (para consulta via endpoint)
export async function lerLogMensagens(n) {
  try {
    const limite = (n || 50) - 1;
    const lista = await redis.lrange('log:mensagens', 0, limite);
    return lista.map(function (item) {
      try { return typeof item === 'string' ? JSON.parse(item) : item; }
      catch (e) { return item; }
    });
  } catch (err) {
    console.error('erro lerLog:', err.message);
    return [];
  }
}

// ===== FOTOS PENDENTES (reconciliação de OCR que estourou o polling) =====
// Quando a foto dá TIMEOUT, guardamos {phone, ts} por imageId. Um verificador
// (api/reconciliar-fotos + piggyback no webhook) fecha o loop depois: se deu certo o
// webhook confirma sozinho; se falhou/travou, avisa o usuário. Hash Redis fotosPendentes.

export async function registrarFotoPendente(imageId, phone) {
  try {
    await redis.hset('fotosPendentes', { [String(imageId)]: JSON.stringify({ phone: phone, ts: Date.now() }) });
  } catch (err) {
    console.error('erro registrarFotoPendente:', err.message);
  }
}

export async function lerFotosPendentes() {
  try {
    return (await redis.hgetall('fotosPendentes')) || {};
  } catch (err) {
    console.error('erro lerFotosPendentes:', err.message);
    return {};
  }
}

// Reivindica (remove atomicamente) uma foto pendente. Retorna true só para QUEM removeu,
// evitando que duas passadas de reconciliação avisem o mesmo usuário duas vezes.
export async function claimFotoPendente(imageId) {
  try {
    const removidos = await redis.hdel('fotosPendentes', String(imageId));
    return removidos === 1;
  } catch (err) {
    console.error('erro claimFotoPendente:', err.message);
    return false;
  }
}
