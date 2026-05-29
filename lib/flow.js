// Motor de fluxo da conversa (state machine)
// Recebe a mensagem do usuário e o estado atual, decide a resposta e o próximo estado.

import { getSession, setSession, getUser, setUser, salvarLead } from './store.js';
import { sendText, sendButtons } from './whatsapp.js';
import { alertarLead } from './alerta.js';

const PORTAL_URL = process.env.PORTAL_URL || 'https://gugu-rebello.github.io/qrtera-demo';
const BOT_NUMBER = process.env.WHATSAPP_BOT_NUMBER || '5511980470391';

// Detecta e-mail simples
function isEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(str).trim());
}

// Detecta 44 dígitos no texto
function extrairChave(str) {
  const m = String(str).replace(/\D/g, '').match(/\d{44}/);
  return m ? m[0] : null;
}

// Detecta saudações que devem sempre reiniciar a conversa
function isSaudacao(str) {
  const s = String(str || '').trim().toLowerCase();
  return ['oi', 'ola', 'olá', 'menu', 'inicio', 'início', 'começar', 'comecar',
    'bom dia', 'boa tarde', 'boa noite', 'eai', 'eaí', 'e ai', 'opa'].indexOf(s) !== -1;
}

export async function processarMensagem(phone, msg, opcaoBotao, nomePerfil) {
  const session = await getSession(phone);
  const estado = session.estado || 'novo';

  // Saudação sempre reinicia (só quando NÃO é resposta de botão)
  if (!opcaoBotao && typeof msg === 'string' && isSaudacao(msg)) {
    return enviarMenuInicial(phone);
  }

  switch (estado) {
    case 'novo':
    case 'concluido':
      return enviarMenuInicial(phone);

    case 'aguardando_menu_inicial':
      return tratarEscolhaMenu(phone, msg, opcaoBotao);

    case 'lead_contato':
      return tratarLeadContato(phone, msg, session, nomePerfil);

    case 'cadastro_email':
      return tratarCadastroEmail(phone, msg);

    case 'aguardando_nota':
      return tratarNota(phone, msg);

    default:
      return enviarMenuInicial(phone);
  }
}

// ===== MENU INICIAL =====
async function enviarMenuInicial(phone) {
  await sendButtons(
    phone,
    'Olá! 👋 Bem-vindo à *Tera*.\n\nComo posso te ajudar hoje?',
    [
      { id: 'falar_humano', title: 'Falar com a Tera' },
      { id: 'testar_leitura', title: 'Testar leitura' }
    ]
  );
  await setSession(phone, { estado: 'aguardando_menu_inicial' });
}

async function tratarEscolhaMenu(phone, msg, opcaoBotao) {
  const escolha = (opcaoBotao || msg || '').toLowerCase();

  if (escolha === 'falar_humano' || escolha.indexOf('falar') !== -1 || escolha === '1') {
    await sendText(phone, 'Legal! Vou te conectar com alguém do nosso time. 😊\n\nPara o time entrar em contato, me passe seu *e-mail*:');
    await setSession(phone, { estado: 'lead_contato' });
    return;
  }

  if (escolha === 'testar_leitura' || escolha.indexOf('testar') !== -1 || escolha === '2') {
    await sendText(phone, 'Que bom que quer testar! 🎯\n\nPara liberar sua participação, me informe seu *e-mail*:');
    await setSession(phone, { estado: 'cadastro_email' });
    return;
  }

  // Não entendeu, reenvia o menu
  await sendText(phone, 'Não entendi sua escolha. Vou te mostrar as opções de novo:');
  return enviarMenuInicial(phone);
}

// ===== CAMINHO LEAD =====
async function tratarLeadContato(phone, msg, session, nomePerfil) {
  const contato = (msg || '').trim();
  if (contato.length < 5) {
    await sendText(phone, 'Hmm, esse e-mail parece curto. Me passe um e-mail válido:');
    return;
  }

  const lead = { nome: nomePerfil || null, contato: contato };
  await salvarLead(phone, lead);
  await alertarLead({ ...lead, phone: phone });

  await sendText(phone, '✅ Tudo certo! Já avisei nosso time comercial e em breve alguém da *Tera* vai entrar em contato com você.\n\nObrigado! 🙌');
  await setSession(phone, { estado: 'concluido' });
}

// ===== CAMINHO CADASTRO + NOTA =====
async function tratarCadastroEmail(phone, msg) {
  const email = (msg || '').trim();
  if (!isEmail(email)) {
    await sendText(phone, 'Esse e-mail não parece válido. 🤔\n\nTente novamente (ex: nome@email.com):');
    return;
  }

  await setUser(phone, { email: email, cadastradoEm: new Date().toISOString() });

  await sendText(
    phone,
    '✅ Cadastro feito!\n\nAgora você pode enviar uma nota fiscal a qualquer momento. Você tem *3 formas* de participar:\n\n' +
    '📷 *Foto*: tire uma foto do QR code da nota e envie aqui\n\n' +
    '🔢 *Digitar*: mande os 44 dígitos da chave de acesso (ficam embaixo do QR code)\n\n' +
    '🔗 *Site*: use nosso portal de leitura:\n' + PORTAL_URL + '/?wa=' + BOT_NUMBER + '&u=' + phone + '&t=' + Date.now() + '\n\n' +
    'É só mandar quando quiser! 🎯'
  );
  await setSession(phone, { estado: 'aguardando_nota' });
}

async function tratarNota(phone, msg) {
  const chave = extrairChave(msg);

  if (!chave) {
    await sendText(
      phone,
      'Não consegui identificar uma chave de acesso válida. 🤔\n\nVocê pode:\n' +
      '📷 Enviar uma *foto* do QR code\n' +
      '🔢 Digitar os *44 dígitos* da chave\n' +
      '🔗 Usar nosso *site*: ' + PORTAL_URL + '/?wa=' + BOT_NUMBER + '&u=' + phone + '&t=' + Date.now()
    );
    return;
  }

  // Chave detectada no texto. A submissão real à Tera será feita na FASE 2.
  // Por enquanto (fase 1), só confirmamos a detecção.
  await sendText(phone, '📥 Recebi sua chave! Em breve a integração completa estará ativa.\n\n(Fase 1: detecção funcionando ✅)');
  // Mantém no estado aguardando_nota para poder mandar outra
}
