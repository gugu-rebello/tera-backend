// Motor de fluxo da conversa (state machine)
// Recebe a mensagem do usuário e o estado atual, decide a resposta e o próximo estado.

import { getSession, setSession, getUser, setUser, salvarLead, jaEnviouNota, contarNotasMes, associarChaveTelefone } from './store.js';
import { sendText, sendButtons } from './whatsapp.js';
import { alertarLead } from './alerta.js';
import { submeterChave, isValidChave, buscarDadosNota } from './nota.js';
import { confirmarNotaComDados } from './confirmacao.js';
import { baixarImagemWhatsapp, enviarImagemParaTera, aguardarResultadoImagem } from './imagem.js';

const PORTAL_URL = process.env.PORTAL_URL || 'https://promo.terabr.com';
const BOT_NUMBER = process.env.WHATSAPP_BOT_NUMBER || '5511980470391';

// Detecta e-mail simples
function isEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(str).trim());
}

// Extrai 44 dígitos do texto (chave digitada)
function extrairChave(str) {
  const m = String(str).replace(/\D/g, '').match(/\d{44}/);
  return m ? m[0] : null;
}

// Detecta saudações que sempre reiniciam a conversa
function isSaudacao(str) {
  const s = String(str || '').trim().toLowerCase();
  return ['oi', 'ola', 'olá', 'menu', 'inicio', 'início', 'começar', 'comecar',
    'bom dia', 'boa tarde', 'boa noite', 'eai', 'eaí', 'e ai', 'opa'].indexOf(s) !== -1;
}

// Monta o link do portal com os parâmetros do usuário
function linkPortal(phone) {
  return PORTAL_URL + '/?wa=' + BOT_NUMBER + '&u=' + phone + '&t=' + Date.now();
}

// Texto das 3 opções de envio (reutilizado em vários pontos)
function textoComoEnviar(phone) {
  return 'Você pode mandar sua nota fiscal de *3 formas*:\n\n' +
    '*1.* 📷 Tire uma *foto* do QR code da nota e envie aqui\n\n' +
    '*2.* 🔢 Digite os *44 números* da chave de acesso (ficam embaixo do QR code)\n\n' +
    '*3.* 🔗 Use nosso site: ' + linkPortal(phone);
}

export async function processarMensagem(phone, msg, opcaoBotao, nomePerfil, mediaId) {
  const session = await getSession(phone);
  const estado = session.estado || 'novo';

  // Saudação sempre reinicia (só quando NÃO é resposta de botão)
  if (!opcaoBotao && !mediaId && typeof msg === 'string' && isSaudacao(msg)) {
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
      return tratarNota(phone, msg, mediaId, session);

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
    await sendText(phone, 'Ótimo! Me passa seu *e-mail* que alguém do nosso time já entra em contato. 😊');
    await setSession(phone, { estado: 'lead_contato' });
    return;
  }

  if (escolha === 'testar_leitura' || escolha.indexOf('testar') !== -1 || escolha === '2') {
    await sendText(phone, 'Que bom que quer testar! 🎯\n\nPara liberar sua participação, me informe seu *e-mail*:');
    await setSession(phone, { estado: 'cadastro_email' });
    return;
  }

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
async function tratarCadastroEmail(phone, msg, nomePerfil) {
  const email = (msg || '').trim();
  if (!isEmail(email)) {
    await sendText(phone, 'Esse e-mail não parece válido. 🤔\n\nTente novamente (ex: nome@email.com):');
    return;
  }

  const userAtual = await getUser(phone);
  await setUser(phone, {
    email: email,
    nome: (userAtual && userAtual.nome) || null,
    cadastradoEm: new Date().toISOString()
  });

  await sendText(
    phone,
    '✅ Cadastro feito!\n\nAgora é só mandar sua nota fiscal. ' + textoComoEnviar(phone) + '\n\nPode mandar quando quiser! 🎯'
  );
  await setSession(phone, { estado: 'aguardando_nota', tentativasFoto: 0 });
}

// ===== TRATAR NOTA (3 caminhos) =====
async function tratarNota(phone, msg, mediaId, session) {
  // CAMINHO 1: foto (chegou uma imagem)
  if (mediaId) {
    return tratarFoto(phone, mediaId, session);
  }

  // CAMINHO 2: chave digitada (44 dígitos no texto)
  const chave = extrairChave(msg);
  if (chave) {
    if (!isValidChave(chave)) {
      await sendText(phone, 'Essa chave não parece válida. 🤔\n\nConfira os *44 números* embaixo do QR code e tente de novo, ou mande uma *foto* da nota.');
      return;
    }
    return processarChave(phone, chave, session);
  }

  // Não identificou nada útil
  await sendText(
    phone,
    'Não consegui identificar sua nota. 🤔\n\n' + textoComoEnviar(phone)
  );
}

// ===== PROCESSAR CHAVE (caminhos 2 e 3, e usado pela foto após o OCR) =====
// Trata as duas camadas de duplicidade.
async function processarChave(phone, chave, session) {
  // CAMADA 2: esse telefone já mandou essa chave este mês?
  const jaEnviou = await jaEnviouNota(phone, chave);
  if (jaEnviou) {
    const total = await contarNotasMes(phone);
    await sendText(phone, '🔁 Você já enviou essa nota!\n\nVocê tem *' + total + (total === 1 ? ' nota' : ' notas') + '* este mês.\n\nManda outra nota fiscal para continuar participando. 🎯');
    await setSession(phone, { estado: 'aguardando_nota', tentativasFoto: 0 });
    return;
  }

  // Submete na Tera (camada 1)
  const r = await submeterChave(phone, chave);
  const chaveReal = r.accessKey || chave;

  if (r.status === 'RECEIVED') {
    // Nota nova na Tera. Guarda associação chave->telefone para o webhook achar o dono.
    await associarChaveTelefone(chaveReal, phone);
    await sendText(phone, '📥 *Nota recebida!*\n\nEstamos validando sua nota fiscal. Em alguns minutos te aviso aqui se sua participação foi confirmada. 🎯');
    await setSession(phone, { estado: 'aguardando_nota', tentativasFoto: 0 });

  } else if (r.status === 'DUPLICATED') {
    // CASO B: já existe na Tera, mas é nova para este telefone (camada 2 passou).
    // Busca os dados direto pela chave (sem esperar webhook) e confirma na hora.
    const dados = await buscarDadosNota(chaveReal);
    if (dados.ok) {
      await confirmarNotaComDados(phone, chaveReal, dados);
    } else {
      // Não conseguiu os dados agora; registra e dá uma confirmação simples
      await associarChaveTelefone(chaveReal, phone);
      await sendText(phone, '📥 *Nota recebida!*\n\nEstamos validando sua nota fiscal. Em instantes te confirmo. 🎯');
    }
    await setSession(phone, { estado: 'aguardando_nota', tentativasFoto: 0 });

  } else if (r.status === 'INVALID') {
    await sendText(phone, 'Essa nota não passou na validação. 🤔\n\nConfira se a nota está correta e tente de novo, ou mande outra.');
  } else {
    await sendText(phone, 'Tive um problema ao registrar sua nota. 😕 Tente de novo em instantes.');
  }
}

// ===== CAMINHO 1: FOTO =====
async function tratarFoto(phone, mediaId, session) {
  await sendText(phone, '📷 Recebi sua foto! Estou lendo o QR code, um instante...');

  // Baixa a imagem do WhatsApp
  const imagem = await baixarImagemWhatsapp(mediaId);
  if (!imagem) {
    await sendText(phone, 'Tive um problema ao baixar sua foto. 😕 Tente enviar de novo.');
    return;
  }

  // Envia para a API de imagem da Tera (OCR)
  const imageId = await enviarImagemParaTera(imagem.buffer, imagem.mimeType);
  if (!imageId) {
    await sendText(phone, 'Tive um problema ao processar sua foto. 😕 Tente enviar de novo ou digite os *44 números* da chave.');
    return;
  }

  // Aguarda o resultado do OCR (polling até ~28s)
  const resultado = await aguardarResultadoImagem(imageId);

  // Sucesso do OCR: a API DE IMAGEM já registrou a chave (não reenviar, senão duplica).
  if (resultado.status === 'OK' && resultado.chave) {
    await tratarChaveDaFoto(phone, resultado.chave, resultado.itemStatus, session);
    return;
  }

  // TIMEOUT: o OCR demorou mais que o nosso limite. NÃO é falha de leitura.
  // A imagem pode terminar de processar depois. Avisamos sem assustar.
  if (resultado.status === 'TIMEOUT') {
    await sendText(
      phone,
      '⏳ Sua foto está sendo processada e pode levar um instante.\n\nSe preferir agilizar, você pode digitar os *44 números* da chave de acesso (ficam embaixo do QR code).'
    );
    await setSession(phone, { estado: 'aguardando_nota', tentativasFoto: (session.tentativasFoto || 0) });
    return;
  }

  // Falha real de leitura (INVALID/ERROR): aplica fallback inteligente por nº de tentativas
  const tentativas = (session.tentativasFoto || 0) + 1;
  await setSession(phone, { ...session, estado: 'aguardando_nota', tentativasFoto: tentativas });

  if (tentativas === 1) {
    // Primeira falha: pede foto mais nítida
    await sendText(
      phone,
      'Não consegui ler o QR code dessa foto. 😕\n\nTente tirar uma *foto mais nítida*, com o QR code bem focado e iluminado. Ou, se preferir, digite os *44 números* da chave de acesso.'
    );
  } else {
    // Segunda falha ou mais: oferece digitar ou usar o site
    await sendText(
      phone,
      'Ainda não consegui ler. 😕\n\nVamos tentar de outro jeito:\n\n' +
      '🔢 Digite os *44 números* da chave de acesso (ficam embaixo do QR code)\n\n' +
      '🔗 Ou leia o QR code pelo nosso site: ' + linkPortal(phone)
    );
  }
}

// ===== TRATAR A CHAVE QUE VEIO DA FOTO =====
// A chave JÁ foi registrada pela API de imagem. Aqui aplicamos as duas camadas
// sem reenviar: checamos se o telefone já mandou (camada 2) e usamos o itemStatus.
async function tratarChaveDaFoto(phone, chave, itemStatus, session) {
  // CAMADA 2: esse telefone já mandou essa chave este mês?
  const jaEnviou = await jaEnviouNota(phone, chave);
  if (jaEnviou) {
    const total = await contarNotasMes(phone);
    await sendText(phone, '🔁 Você já enviou essa nota!\n\nVocê tem *' + total + (total === 1 ? ' nota' : ' notas') + '* este mês.\n\nManda outra nota fiscal para continuar participando. 🎯');
    await setSession(phone, { estado: 'aguardando_nota', tentativasFoto: 0 });
    return;
  }

  // itemStatus é o status que a própria API de imagem retornou para a chave.
  if (itemStatus === 'RECEIVED') {
    // Nota nova: guarda associação para o webhook achar o dono (foto não manda meta.wa)
    await associarChaveTelefone(chave, phone);
    await sendText(phone, '📥 *Nota recebida!*\n\nEstamos validando sua nota fiscal. Em alguns minutos te aviso aqui se sua participação foi confirmada. 🎯');
    await setSession(phone, { estado: 'aguardando_nota', tentativasFoto: 0 });

  } else if (itemStatus === 'DUPLICATED') {
    // CASO B: já existe na Tera, nova para este telefone. Busca dados e confirma na hora.
    const dados = await buscarDadosNota(chave);
    if (dados.ok) {
      await confirmarNotaComDados(phone, chave, dados);
    } else {
      await associarChaveTelefone(chave, phone);
      await sendText(phone, '📥 *Nota recebida!*\n\nEstamos validando sua nota fiscal. Em instantes te confirmo. 🎯');
    }
    await setSession(phone, { estado: 'aguardando_nota', tentativasFoto: 0 });

  } else if (itemStatus === 'INVALID') {
    await sendText(phone, 'Essa nota não passou na validação. 🤔\n\nConfira se a nota está correta e tente de novo, ou mande outra.');
  } else {
    // itemStatus desconhecido: trata como recebida para não travar o usuário
    await associarChaveTelefone(chave, phone);
    await sendText(phone, '📥 *Nota recebida!*\n\nEstamos validando sua nota fiscal. 🎯');
    await setSession(phone, { estado: 'aguardando_nota', tentativasFoto: 0 });
  }
}
