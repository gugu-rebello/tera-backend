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

export async function registrarNota(phone, accessKey) {
  try {
    const key = 'notas:' + phone + ':' + mesAtual();
    // SADD adiciona a chave ao set (dedupe automático no mês)
    await redis.sadd(key, accessKey);
    await redis.expire(key, 60 * 60 * 24 * 90); // mantém 90 dias
    const total = await redis.scard(key);
    return total;
  } catch (err) {
    console.error('erro registrarNota:', err.message);
    return null;
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
