// Envio de mensagens via 360dialog WhatsApp Cloud API

const D360_URL = 'https://waba-v2.360dialog.io/messages';

// Envia mensagem de texto simples
export async function sendText(to, text) {
  return sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: { body: text }
  });
}

// Envia mensagem com botões interativos (até 3 botões)
// buttons = [{ id: 'opt1', title: 'Texto do botão' }, ...]
export async function sendButtons(to, bodyText, buttons) {
  return sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map(function (b) {
          return { type: 'reply', reply: { id: b.id, title: b.title } };
        })
      }
    }
  });
}

async function sendMessage(payload) {
  const apiKey = process.env.D360_API_KEY;
  if (!apiKey) {
    console.error('D360_API_KEY ausente');
    return { ok: false };
  }

  try {
    const resp = await fetch(D360_URL, {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await resp.text();
    console.log('360dialog send:', resp.status, data.substring(0, 200));
    return { ok: resp.ok, status: resp.status, data: data };
  } catch (err) {
    console.error('erro 360dialog:', err.message);
    return { ok: false, error: err.message };
  }
}
