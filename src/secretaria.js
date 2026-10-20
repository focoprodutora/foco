// Recebe cada mensagem do WhatsApp e decide o caminho:
// número da equipe -> secretária (comandos por áudio/texto); qualquer outro -> fila de suporte.
import { atenderEquipe } from "./ia/assistente.js";
import { triarTicket } from "./ia/suporte.js";
import { chaveTelefone, telefoneHumano } from "./util.js";

export function criarSecretaria({ repo, claude, transcrever, whatsapp, config }) {
  const equipe = new Set(config.numerosEquipe.map(chaveTelefone).filter(Boolean));
  const esperas = new Map(); // telefone -> timer da triagem do suporte

  function ehEquipe(telefone) {
    return equipe.has(chaveTelefone(telefone));
  }

  /** Envia pelo WhatsApp e, se for de um atendimento, guarda no histórico dele. */
  function criarEnvio(transporte) {
    return async (telefone, texto, { ticket_id, autor } = {}) => {
      await transporte(telefone, texto);
      if (ticket_id) repo.registrarMensagem({ ticket_id, telefone, direcao: "saida", autor: autor || "equipe", texto });
    };
  }

  const enviarWhatsapp = criarEnvio((tel, texto) => whatsapp.enviarTexto(tel, texto));

  async function avisarEquipe(texto, enviar = enviarWhatsapp) {
    for (const numero of config.numerosEquipe) {
      try {
        await enviar(numero, texto);
      } catch (e) {
        console.error(`[aviso equipe ${numero}]`, e.message);
      }
    }
  }

  async function obterTexto(msg) {
    if (msg.tipo !== "audio") return msg.texto;
    let { audioBase64, mimetype } = msg;
    if (!audioBase64 && msg.chaveMensagem) ({ base64: audioBase64, mimetype } = await whatsapp.baixarMidia(msg.chaveMensagem));
    if (!audioBase64) throw new Error("áudio sem conteúdo");
    return transcrever(audioBase64, mimetype);
  }

  async function triar(telefone, enviar) {
    const ticket = repo.ticketAbertoPorTelefone(telefone);
    if (!ticket) return;
    const r = await triarTicket(ticket, { repo, claude, config });
    repo.atualizarTicket(ticket.id, {
      categoria: r.categoria,
      prioridade: r.prioridade,
      resumo: r.resumo,
      status: r.precisa_humano || ticket.status === "em_atendimento" ? ticket.status : "resolvido",
    });
    // Se alguém da equipe já assumiu o atendimento, a secretária não responde por cima.
    if (r.resposta && ticket.status === "aberto") {
      await enviar(ticket.telefone, r.resposta, { ticket_id: ticket.id, autor: "secretaria" });
    }
    if (r.prioridade === "urgente" && r.precisa_humano && !repo.lerKv(`urgente:${ticket.id}`)) {
      repo.gravarKv(`urgente:${ticket.id}`, "1");
      await avisarEquipe(`🚨 *Suporte urgente* #${ticket.id}\n${ticket.nome || "Sem nome"} · ${telefoneHumano(ticket.telefone)}\n${r.resumo}`, enviar);
    }
  }

  async function receberSuporte(msg, texto, enviar, semEspera) {
    const pessoa = repo.pessoaPorTelefone(msg.telefone);
    let ticket = repo.ticketAbertoPorTelefone(msg.telefone);
    if (!ticket) ticket = repo.criarTicket({ telefone: msg.telefone, nome: pessoa?.nome || msg.nome, pessoa_id: pessoa?.id });
    repo.registrarMensagem({ ticket_id: ticket.id, telefone: msg.telefone, direcao: "entrada", autor: msg.nome, tipo: msg.tipo, texto });

    // Espera alguns segundos para juntar mensagens picadas e responder uma vez só.
    const espera = semEspera ? 0 : config.suporte.aguardarSegundos * 1000;
    if (espera <= 0) return triar(msg.telefone, enviar);
    const chave = chaveTelefone(msg.telefone);
    clearTimeout(esperas.get(chave));
    esperas.set(chave, setTimeout(() => {
      esperas.delete(chave);
      triar(msg.telefone, enviar).catch((e) => console.error("[triagem]", e));
    }, espera));
  }

  /**
   * Processa uma mensagem recebida: { telefone, nome, tipo: "texto"|"audio", texto?, audioBase64?, mimetype?, chaveMensagem? }.
   * O simulador do painel troca `enviar` por um destino de teste, força o papel com `comoEquipe`
   * e pede `semEspera` para ver a resposta do suporte na hora.
   */
  async function receber(msg, { enviar = enviarWhatsapp, comoEquipe, semEspera = false } = {}) {
    const daEquipe = comoEquipe ?? ehEquipe(msg.telefone);
    let texto;
    try {
      texto = await obterTexto(msg);
    } catch (e) {
      console.error("[transcrição]", e.message);
      if (daEquipe) return enviar(msg.telefone, "Não consegui ouvir esse áudio 😕 Pode mandar de novo ou escrever?");
      texto = "[áudio que não pôde ser transcrito: ouvir no WhatsApp]";
    }
    if (!texto) return;

    if (!daEquipe) return receberSuporte(msg, texto, enviar, semEspera);

    const autor = msg.nome || "Equipe";
    const resposta = await atenderEquipe(
      { texto, veioDeAudio: msg.tipo === "audio" },
      { repo, claude, config, enviar, autor, telefone: msg.telefone },
    );
    const prefixo = msg.tipo === "audio" ? `🎤 _"${texto.length > 160 ? `${texto.slice(0, 160)}…` : texto}"_\n\n` : "";
    await enviar(msg.telefone, prefixo + resposta);
  }

  return { receber, ehEquipe, criarEnvio, enviarWhatsapp, avisarEquipe, whatsappConfigurado: whatsapp.configurado };
}
