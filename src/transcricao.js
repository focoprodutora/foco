// Transcrição de áudio (voz -> texto) com Whisper.
// Funciona com a OpenAI (padrão) ou qualquer serviço compatível, como a Groq
// (TRANSCRICAO_URL=https://api.groq.com/openai/v1, TRANSCRICAO_MODELO=whisper-large-v3-turbo).

const EXTENSOES = { "audio/ogg": "ogg", "audio/webm": "webm", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav" };

export function criarTranscritor({ url, chave, modelo }) {
  return async function transcrever(base64, mimetype = "audio/ogg") {
    if (!chave) throw new Error("Transcrição não configurada (TRANSCRICAO_CHAVE).");
    const tipo = mimetype.split(";")[0].trim();
    const arquivo = new Blob([Buffer.from(base64, "base64")], { type: tipo });

    const form = new FormData();
    form.append("file", arquivo, `audio.${EXTENSOES[tipo] || "ogg"}`);
    form.append("model", modelo);
    form.append("language", "pt");

    const resposta = await fetch(`${url}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}` },
      body: form,
    });
    if (!resposta.ok) throw new Error(`Transcrição falhou (${resposta.status}): ${await resposta.text()}`);
    const { text } = await resposta.json();
    return String(text || "").trim();
  };
}
