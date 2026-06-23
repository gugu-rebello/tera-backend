// Copys compartilhadas do chatbot (usadas pelo fluxo do WhatsApp e pelo endpoint do portal).
// Centralizadas aqui para a mensagem do usuário ser igual em todos os caminhos
// (foto, digitação e portal web) e fácil de ajustar num lugar só.

// Formata a chave de 44 dígitos em blocos de 4 para facilitar a leitura/conferência.
export function formatarChave(chave) {
  const limpa = String(chave || '').replace(/\D/g, '');
  if (!limpa) return '';
  return limpa.replace(/(\d{4})(?=\d)/g, '$1 ');
}

// Linha com a chave de acesso lida (monospace do WhatsApp), só quando há chave.
export function linhaChave(chave) {
  const fmt = formatarChave(chave);
  return fmt ? '🔑 Chave de acesso lida:\n```' + fmt + '```\n\n' : '';
}

// Confirmação de que a chave foi lida/aceita e os dados completos estão na fila.
// Mensagem clara para quem não conhece o processo: a leitura deu certo, o que falta
// é buscar os detalhes da nota, e isso pode demorar.
export function msgNotaNaFila(chave) {
  return '🧾 *Recebi sua nota!*\n\n' +
    'A chave de acesso foi lida e está válida. ✅\n\n' +
    linhaChave(chave) +
    'Agora estou buscando os dados completos da nota (loja, itens e valor). Isso entra em uma fila e pode levar alguns minutos, às vezes um pouco mais.\n\n' +
    'Pode deixar comigo, você não precisa fazer mais nada: assim que terminar, te aviso aqui com a confirmação da sua participação. 🎯';
}

// Quando a nota já existe no sistema e os dados completos vêm em seguida.
export function msgNotaJaNoSistema(chave) {
  return '🧾 *Recebi sua nota!*\n\n' +
    linhaChave(chave) +
    'Ela já está no nosso sistema. Estou puxando os dados completos e te confirmo aqui em instantes. 🎯';
}
