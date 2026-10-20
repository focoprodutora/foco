// Rotinas automáticas: lembrete para mentoradas, resumo diário e alerta de suporte parado.
import { agoraLocal, dataHumana, somarMinutos, telefoneHumano } from "./util.js";

function primeiroNome(nome) {
  return String(nome || "").split(" ")[0];
}

export async function enviarLembretes({ repo, enviar, agora = agoraLocal() }) {
  const proximas = repo.agenda({ de: agora, ate: somarMinutos(agora, 24 * 60) })
    .filter((a) => a.status === "marcado" && a.pessoa_telefone);
  let enviados = 0;
  for (const a of proximas) {
    const faltaUmaHora = a.inicio <= somarMinutos(agora, 60);
    const campo = faltaUmaHora ? "lembrete_1h" : "lembrete_24h";
    if (a[campo] || (!faltaUmaHora && a.lembrete_1h)) continue;
    const quando = faltaUmaHora ? `daqui a pouco, às ${a.inicio.slice(11, 16)}` : dataHumana(a.inicio);
    const comQuem = a.mentor_nome ? ` com ${a.mentor_nome}` : "";
    const texto = `Oi, ${primeiroNome(a.pessoa_nome)}! 💛 Passando para lembrar da sua sessão${comQuem} ${quando}. Se precisar remarcar, é só responder aqui.`;
    try {
      await enviar(a.pessoa_telefone, texto);
      repo.marcarLembrete(a.id, campo);
      if (faltaUmaHora) repo.marcarLembrete(a.id, "lembrete_24h");
      enviados++;
    } catch (e) {
      console.error(`[lembrete ${a.id}]`, e.message);
    }
  }
  return enviados;
}

export function montarResumoDiario({ repo, agora = agoraLocal() }) {
  const hoje = agora.slice(0, 10);
  const sessoes = repo.agenda({ de: `${hoje}T00:00`, ate: somarMinutos(`${hoje}T00:00`, 24 * 60) });
  const abertos = repo.tickets({ status: "abertos" });
  const semResposta = repo.ticketsSemResposta(agora);

  const linhas = [`☀️ *Bom dia! Resumo de ${dataHumana(`${hoje}T00:00`).split(" às")[0]}*`, ""];
  if (sessoes.length) {
    linhas.push(`*Sessões de hoje (${sessoes.length}):*`);
    for (const s of sessoes) {
      linhas.push(`• ${s.inicio.slice(11, 16)} ${s.pessoa_nome}${s.cidade ? ` (${s.cidade}/${s.estado})` : ""}${s.mentor_nome ? ` com ${s.mentor_nome}` : ""}`);
    }
  } else {
    linhas.push("Nenhuma sessão marcada para hoje.");
  }
  linhas.push("", `*Suporte:* ${abertos.length} em aberto, ${semResposta.length} esperando resposta da equipe.`);
  for (const t of abertos.filter((t) => ["urgente", "alta"].includes(t.prioridade)).slice(0, 5)) {
    linhas.push(`• #${t.id} ${t.nome || telefoneHumano(t.telefone)}: ${t.resumo || "sem resumo"}`);
  }
  return linhas.join("\n");
}

export async function alertarSuporteParado({ repo, avisar, horas, agora = agoraLocal() }) {
  const limite = somarMinutos(agora, -horas * 60);
  const parados = repo.ticketsSemResposta(limite).filter((t) => !t.alertado);
  if (!parados.length) return 0;
  const linhas = [`⏰ *${parados.length} atendimento(s) sem resposta há mais de ${horas}h:*`];
  for (const t of parados.slice(0, 10)) {
    linhas.push(`• #${t.id} ${t.nome || telefoneHumano(t.telefone)} (${t.prioridade}): ${t.resumo || "sem resumo"}`);
  }
  await avisar(linhas.join("\n"));
  for (const t of parados) repo.atualizarTicket(t.id, { alertado: 1 });
  return parados.length;
}

/** Roda as rotinas uma vez por minuto. */
export function iniciarRotinas({ repo, secretaria, config }) {
  async function rodar() {
    const agora = agoraLocal();
    try {
      await enviarLembretes({ repo, enviar: secretaria.enviarWhatsapp, agora });
      await alertarSuporteParado({ repo, avisar: secretaria.avisarEquipe, horas: config.suporte.alertaHoras, agora });

      const hoje = agora.slice(0, 10);
      const hora = Number(agora.slice(11, 13));
      if (config.resumoDiarioHora >= 0 && hora >= config.resumoDiarioHora && repo.lerKv("resumo_diario") !== hoje) {
        repo.gravarKv("resumo_diario", hoje);
        await secretaria.avisarEquipe(montarResumoDiario({ repo, agora }));
      }
    } catch (e) {
      console.error("[rotinas]", e);
    }
  }
  const timer = setInterval(rodar, 60_000);
  rodar();
  return () => clearInterval(timer);
}
