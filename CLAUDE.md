# CLAUDE.md - Contexto do projeto tera-backend

> Arquivo de duplo contexto: (1) vive em `tera/projects/chatbot-whatsapp/` no second-brain, dando contexto ao Claude Code ao trabalhar aqui; (2) ao commitar no repo, copiar este arquivo para a RAIZ de `gugu-rebello/tera-backend` sem alterações.
> Documentação completa: second-brain → `tera/projects/chatbot-whatsapp/`.

## O que é este projeto

Chatbot de WhatsApp da Tera para promoções com nota fiscal. O usuário envia notas (foto, 44 dígitos ou portal web), a Tera lê via SEFAZ e o bot confirma com dados ricos (estabelecimento, itens, valor) + contador mensal. Serve de demo comercial e esqueleto para campanhas de clientes.

## Stack e topologia

- **Runtime:** Vercel serverless, Node ESM (`"type": "module"`). Dependência única: `@upstash/redis`.
- **WhatsApp:** 360dialog (Cloud API by Meta). Envio: `POST https://waba-v2.360dialog.io/messages`, header `D360-API-KEY`. Número do bot: `5511980470391`.
- **Banco:** Upstash Redis (env `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
- **APIs Tera:** `https://api.terabr.com`, header `Authorization: Bearer {TERA_API_TOKEN}` (projeto "TERA | WHATSAPP COMERCIAL"). ATENÇÃO: é `Authorization`, não `Authentication` (typo em doc antiga).
- **Portal web:** repo separado `qrtera-demo` → `https://promo.terabr.com`.
- **Email:** SendGrid, remetente `contato@terabr.com`.

## Mapa de arquivos

- `api/whatsapp-360.js`: webhook do 360dialog. TODA mensagem entra aqui. Dedupe por messageId + log persistente, depois delega para `lib/flow.js`.
- `api/webhook-tera.js`: a Tera avisa nota processada (`RECEIPT_STATUS_UPDATED`). Busca dados, acha o dono (meta.wa OU KV `chaveWa:`), envia confirmação rica.
- `api/submit-chave.js`: endpoint do portal web (CORS aberto).
- `api/ver-log.js`: auditoria de mensagens (`?s={LOG_VIEW_SECRET}&n=200`).
- `api/fila-alertas.js`: fila de alertas internos (`?s={ALERTAS_SECRET}`). Consumida por um carteiro (`alertas-poller.mjs`, no second-brain `tera/tools/whatsapp-bridge/`) que roda na máquina da ponte e posta no grupo Comercial via o `/send` da ponte Baileys. NÃO está embutido no `bridge.js`. FIFO via Redis `fila:alertas`.
- `api/resumo-dia.js`: status diário de notas por contato (cron Vercel 21:00 UTC = 18:00 SP; auth por `CRON_SECRET` no header ou `?s={ALERTAS_SECRET}`). Lê `alertaDia:{dia SP}` e enfileira o resumo.
- `lib/flow.js`: state machine. Estados: novo, aguardando_menu_inicial, lead_contato, cadastro_email, aguardando_nota, concluido. A identidade vem do cadastro permanente (`usuario:{phone}`), não da sessão de 24h: cadastrado que manda nota processa direto em qualquer estado e saudação dá boas-vindas de volta; menu só com pedido explícito (menu, voltar, tera, atendente...). Novato que manda nota antes do cadastro tem a nota guardada em `notaPendente` e processada após informar o e-mail. O `nomePerfil` (vem em TODA mensagem) faz backfill do `usuario.nome` no início de `processarMensagem`: cadastros antigos sem nome se corrigem na próxima mensagem, e o meta da foto (que lê o nome gravado) passa a ter o nome.
- `lib/store.js`: todas as operações KV (esquema de chaves documentado no cabeçalho de cada função).
- `lib/whatsapp.js`: sendText / sendButtons (trunca títulos em 20 chars, limite Meta).
- `lib/nota.js`: isValidChave (DV módulo 11) / submeterChave (com meta {wa, email, nome}) / buscarDadosNota.
- `lib/imagem.js`: download de foto (2 passos 360dialog com reescrita de host) + OCR Tera + polling 45s. Envia `meta {wa, email, nome}` e `reprocess=false` no form-data: desde 06/2026 a API de imagem tem paridade de parâmetros com o POST /qr-code, e o webhook acha o dono da foto por `meta.wa` (o `chaveWa:` no KV é fallback).
- `lib/confirmacao.js`: confirmação rica + contador mensal (compartilhada).
- `lib/alerta.js`: alerta de lead (WhatsApp individual + email; API não manda para grupos).
- Alertas internos (cadastro novo + status diário) NÃO usam a API oficial: vão pela fila `fila:alertas` no Redis, drenada por um carteiro cliente (`alertas-poller.mjs`) que chama o `/send` da ponte Baileys. Motivo: API oficial não manda para grupo e exige janela de 24h para mensagem livre.

## Invariantes que NÃO podem ser quebradas

1. **A foto NUNCA re-submete a chave.** A API de imagem da Tera já registra a chave durante o OCR. Re-submeter gera DUPLICATED falso. Usar o `itemStatus` retornado pelo OCR.
2. **Itens DUPLICATED do OCR não trazem `accessKey`**: extrair a chave da `url` com regex `[?&]p=(\d{44})`.
3. **Duas camadas de duplicidade:** o KV (telefone já mandou esta chave?) decide a EXPERIÊNCIA e o contador; a Tera (chave existe?) fornece DADOS. Checar camada 2 ANTES de submeter.
4. **Webhook acha o dono nesta ordem:** `meta.wa` da nota → `chaveWa:{accessKey}` no KV → ignora.
5. **Títulos de botão ≤ 20 caracteres** (erro Meta 131009).
6. **Webhooks sempre respondem 200**, mesmo em erro interno (evita loop de retry do provedor).
7. **Mídia do WhatsApp:** baixar reescrevendo o host da url da Meta para `waba-v2.360dialog.io` (direto dá 401).
8. **maxDuration 60** em `vercel.json` para `whatsapp-360.js` (polling do OCR vai até 45s; precisa de folga para download + POST + envios). Confirmar que o plano Vercel aceita 60s; se reclamar no deploy, reduzir polling e maxDuration juntos.
9. **Não mexer no leitor de QR do portal** (`qrtera-demo/index.html`) sem teste incremental em iPhone real: BarcodeDetector e videoConstraints quebraram o Safari e foram revertidos.
10. **Conta Twilio não pode ser cancelada** (SendGrid depende dela).
11. **Cadastrado nunca refaz o funil.** A identidade é o cadastro permanente (`usuario:{phone}`); sessão expirada não pode mandar quem já tem e-mail de volta ao menu ou ao cadastro. Nota de cadastrado processa direto; menu só com pedido explícito.

## Convenções do projeto

- Comentários e mensagens de usuário em pt-BR. "Tera" sempre com T maiúsculo.
- Sem travessões em copys (padrão editorial Tera): usar vírgulas, dois pontos ou parênteses.
- Funções de banco nunca lançam: try/catch com fallback que não derruba o fluxo.
- Logs de integração com prefixo identificável (`360dialog send:`, `tera imagem POST:`, `webhook tera:`...).
- Toda mudança de comportamento testável localmente antes do push (sintaxe: `node --input-type=module --check < arquivo`).

## Fluxo de deploy

Push no GitHub (`gugu-rebello/tera-backend`) → deploy automático no Vercel. Env vars no painel do Vercel (lista completa em `tera/projects/chatbot-whatsapp/02_infraestrutura.md` (second-brain)).

## Debug rápido

- Mensagens recebidas: `https://tera-backend.vercel.app/api/ver-log?s={LOG_VIEW_SECRET}`
- Log Vercel: painel (últimos ~30 min no free).
- Log do servidor Tera: `aws logs tail /ecs/client-api --follow`.
- Runbook completo de sintomas: `tera/projects/chatbot-whatsapp/07_operacao.md` (second-brain).

## Estado atual e próximos passos

- Fase 1 e 2 entregues e validadas end-to-end em 12/06/2026 (menu, lead, cadastro, 3 caminhos de nota, 2 camadas de duplicidade, confirmação rica, contador, usuário recorrente sem refazer o funil, meta no caminho da foto, maxDuration 30 aceito).
- Em curso: monitoramento de mensagens fantasma via ver-log (Coexistence).
- Fase 3 desenhada (agente IA híbrido com tool use via API Anthropic, protótipo isolado primeiro): ver `tera/projects/chatbot-whatsapp/09_roadmap.md` (second-brain).
