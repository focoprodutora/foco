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

  const base64 = msg.base64 || dados.base64 || null; // vem preenchido se o webhook estiver com "base64" ligado

  // Foto ou documento (PDF etc.), com ou sem legenda.
  const imagem = msg.imageMessage;
  const documento = msg.documentMessage || msg.documentWithCaptionMessage?.message?.documentMessage;
  if (imagem || documento) {
    const m = imagem || documento;
    return {
      ...base,
      tipo: "midia",
      midiaBase64: base64,
      mimetype: m.mimetype || (imagem ? "image/jpeg" : "application/octet-stream"),
      nomeArquivo: documento?.fileName || documento?.title || null,
      legenda: m.caption || "",
      chaveMensagem: chave,
    };
  }

  const texto = msg.conversation || msg.extendedTextMessage?.text || msg.videoMessage?.caption;
  if (texto) return { ...base, tipo: "texto", texto };

  if (msg.audioMessage) {
    return {
      ...base,
      tipo: "audio",
      audioBase64: base64,
      mimetype: msg.audioMessage.mimetype || "audio/ogg",
      chaveMensagem: chave,
    };
  }

  if (msg.videoMessage || msg.stickerMessage) {
    return { ...base, tipo: "texto", texto: "[a pessoa enviou um vídeo ou figurinha sem texto]" };
  }
  return null;
}

export function criarClienteEvolution({ url, chave, instancia }) {
  const configurado = Boolean(url && chave && instancia);

  async function chamar(caminho, corpo, { metodo = "POST", semInstancia = false, consulta = "" } = {}) {
    const alvo = semInstancia ? caminho : `${caminho}/${encodeURIComponent(instancia)}`;
    const resposta = await fetch(`${url}${alvo}${consulta}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", apikey: chave },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    if (!resposta.ok) {
      const erro = new Error(`Evolution API ${caminho} respondeu ${resposta.status}: ${await resposta.text()}`);
      erro.status = resposta.status;
      throw erro;
    }
    return resposta.json();
  }

  function exigirConfiguracao() {
    if (!configurado) throw new Error("WhatsApp não configurado (EVOLUTION_URL, EVOLUTION_CHAVE, EVOLUTION_INSTANCIA).");
  }

  const webhook = (urlWebhook) => ({ enabled: true, url: urlWebhook, byEvents: false, base64: true, events: ["MESSAGES_UPSERT"] });

  return {
    configurado,

    async enviarTexto(telefone, texto) {
      exigirConfiguracao();
      return chamar("/message/sendText", { number: String(telefone).replace(/\D/g, ""), text: texto });
    },

    /** Baixa o áudio, foto ou documento de uma mensagem recebida e devolve { base64, mimetype }. */
    async baixarMidia(chaveMensagem) {
      const r = await chamar("/chat/getBase64FromMediaMessage", { message: { key: chaveMensagem }, convertToMp4: false });
      return { base64: r.base64, mimetype: r.mimetype || null };
    },

    /** Envia uma foto ou documento. `base64` sem o prefixo "data:". */
    async enviarArquivo(telefone, { base64, mimetype, nome, legenda }) {
      exigirConfiguracao();
      return chamar("/message/sendMedia", {
        number: String(telefone).replace(/\D/g, ""),
        mediatype: String(mimetype).startsWith("image/") ? "image" : "document",
        mimetype,
        media: base64,
        fileName: nome,
        caption: legenda || "",
      });
    },

    /** "open" (conectado), "connecting", "close" ou "inexistente" (instância ainda não criada). */
    async estado() {
      exigirConfiguracao();
      try {
        const r = await chamar("/instance/connectionState", null, { metodo: "GET" });
        return r?.instance?.state || "inexistente";
      } catch (e) {
        if (e.status === 404 || e.status === 400) return "inexistente";
        throw e;
      }
    },

    /**
     * Cria a instância (se preciso), aponta o webhook para esta aplicação e pede a conexão.
     * Com `numero`, a Evolution devolve um código de pareamento para digitar no celular;
     * sem número, devolve o QR Code. Retorna { estado, qrBase64, codigoPareamento }.
     */
    async conectar({ urlWebhook, numero }) {
      exigirConfiguracao();
      if ((await this.estado()) === "inexistente") {
        await chamar("/instance/create", {
          instanceName: instancia,
          integration: "WHATSAPP-BAILEYS",
          qrcode: false,
          groupsIgnore: true,
          webhook: webhook(urlWebhook),
        }, { semInstancia: true });
      }
      await chamar("/webhook/set", { webhook: webhook(urlWebhook) });
      if ((await this.estado()) === "open") return { estado: "open" };
      const consulta = numero ? `?number=${encodeURIComponent(numero)}` : "";
      const r = await chamar("/instance/connect", null, { metodo: "GET", consulta });
      return { estado: r?.instance?.state || "connecting", qrBase64: r?.base64 || null, codigoPareamento: r?.pairingCode || null };
    },
  };
}
