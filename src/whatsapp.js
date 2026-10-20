// Integração com a Evolution API (conector de WhatsApp de código aberto).
// Documentação: https://doc.evolution-api.com

/**
 * Converte o corpo do webhook "messages.upsert" da Evolution API numa mensagem simples.
 * Devolve null para o que não deve ser processado (grupos, status, mensagens enviadas por nós).
 */
export function lerWebhookEvolution(corpo) {
  const evento = String(corpo?.event || "").toLowerCase().replace("_", ".");
  if (evento !== "messages.upsert") return null;

  const dados = Array.isArray(corpo.data) ? corpo.data[0] : corpo.data;
  const chave = dados?.key;
  if (!chave || chave.fromMe) return null;

  // Em contas com "LID" o número real vem em senderPn/remoteJidAlt.
  let jid = chave.remoteJid || "";
  if (jid.endsWith("@lid")) jid = chave.senderPn || chave.remoteJidAlt || "";
  if (!jid.endsWith("@s.whatsapp.net")) return null; // grupos, status, canais

  const msg = dados.message || {};
  const base = {
    id: chave.id,
    telefone: jid.split("@")[0],
    nome: dados.pushName || null,
  };

  const texto = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption;
  if (texto) return { ...base, tipo: "texto", texto };

  if (msg.audioMessage) {
    return {
      ...base,
      tipo: "audio",
      audioBase64: msg.base64 || dados.base64 || null, // vem preenchido se o webhook estiver com "base64" ligado
      mimetype: msg.audioMessage.mimetype || "audio/ogg",
      chaveMensagem: chave,
    };
  }

  if (msg.imageMessage || msg.documentMessage || msg.videoMessage || msg.stickerMessage) {
    return { ...base, tipo: "texto", texto: "[a pessoa enviou um arquivo/imagem sem texto]" };
  }
  return null;
}

export function criarClienteEvolution({ url, chave, instancia }) {
  const configurado = Boolean(url && chave && instancia);

  async function chamar(caminho, corpo) {
    const resposta = await fetch(`${url}${caminho}/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: chave },
      body: JSON.stringify(corpo),
    });
    if (!resposta.ok) {
      throw new Error(`Evolution API ${caminho} respondeu ${resposta.status}: ${await resposta.text()}`);
    }
    return resposta.json();
  }

  return {
    configurado,

    async enviarTexto(telefone, texto) {
      if (!configurado) throw new Error("WhatsApp não configurado (EVOLUTION_URL, EVOLUTION_CHAVE, EVOLUTION_INSTANCIA).");
      return chamar("/message/sendText", { number: String(telefone).replace(/\D/g, ""), text: texto });
    },

    /** Baixa o áudio de uma mensagem recebida e devolve { base64, mimetype }. */
    async baixarMidia(chaveMensagem) {
      const r = await chamar("/chat/getBase64FromMediaMessage", { message: { key: chaveMensagem }, convertToMp4: false });
      return { base64: r.base64, mimetype: r.mimetype || "audio/ogg" };
    },
  };
}
