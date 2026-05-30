// Submete uma chave de acesso na API de leitura de nota da Tera,
// guardando os metadados do usuário (nome, email, whatsapp) para uso no webhook de retorno.

import { getUser, setSession } from './store.js';

const TERA_QRCODE_URL = 'https://api.terabr.com/v1/receipt/qr-code';

// Valida formato da chave de acesso (44 dígitos, UF, modelo, DV)
export function isValidChave(str) {
  const clean = String(str || '').replace(/\D/g, '');
  if (clean.length !== 44) return false;
  const uf = parseInt(clean.substring(0, 2), 10);
  if (uf < 11 || uf > 53) return false;
  const modelo = clean.substring(20, 22);
  if (modelo !== '55' && modelo !== '65') return false;
  return validaDV(clean);
}

function validaDV(chave) {
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += parseInt(chave.charAt(i), 10) * peso;
    peso++;
    if (peso > 9) peso = 2;
  }
  const resto = soma % 11;
  const dv = (resto < 2) ? 0 : 11 - resto;
  return dv === parseInt(chave.charAt(43), 10);
}

// Submete a chave na Tera. Retorna { status } (RECEIVED, DUPLICATED, INVALID, ERROR).
// Passa os metadados do usuário no campo meta, que volta no webhook.
export async function submeterChave(phone, chave) {
  const token = (process.env.TERA_API_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  if (!token) {
    console.error('TERA_API_TOKEN ausente');
    return { status: 'ERROR' };
  }

  // Recupera os dados cadastrados do usuário para anexar como meta
  const user = await getUser(phone);

  const meta = {
    wa: phone,
    email: (user && user.email) || null,
    nome: (user && user.nome) || null
  };

  try {
    const resp = await fetch(TERA_QRCODE_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        qrCodes: [{ url: chave, meta: meta }],
        reprocess: false
      })
    });

    const data = await resp.json();
    console.log('submeterChave tera:', resp.status, JSON.stringify(data).substring(0, 150));

    if (!resp.ok) return { status: 'ERROR' };

    const first = data.result && data.result[0];
    if (!first) return { status: 'ERROR' };

    return { status: first.status, accessKey: first.accessKey || first.accesskey || chave };
  } catch (err) {
    console.error('erro submeterChave:', err.message);
    return { status: 'ERROR' };
  }
}
