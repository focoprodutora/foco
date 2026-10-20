// Triagem do suporte: classifica a conversa, resume para a equipe e, quando dá, já responde.
import { existsSync, readFileSync } from "node:fs";
import { agoraLocal, dataHumana } from "../util.js";

const CATEGORIAS = ["agendamento", "duvida", "financeiro", "acesso", "reclamacao", "evento", "parceria", "outro"];
const PRIORIDADES = ["baixa", "media", "alta", "urgente"];

const FORMATO = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      categoria: { type: "string", enum: CATEGORIAS },
      prioridade: { type: "string", enum: PRIORIDADES },
      resumo: { type: "string", description: "Uma linha para a equipe: quem é e o que precisa." },
      resposta: { type: "string", description: "Mensagem para enviar agora à pessoa, ou \"\" para não enviar nada." },
      precisa_humano: { type: "boolean" },
    },
    required: ["categoria", "prioridade", "resumo", "resposta", "precisa_humano"],
    additionalProperties: false,
  },
};

export function lerFaq(caminho = "faq.md") {
  return existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
}

function instrucoes(nomeNegocio, faq) {
  return `Você faz a triagem do WhatsApp de suporte de ${nomeNegocio}. Chegam muitas mensagens e a equipe
não pode perder nenhuma. Para cada conversa, você devolve uma classificação e, se fizer sentido, uma resposta curta.

Prioridade:
- urgente: problema que impede a pessoa hoje (evento/sessão de hoje, cobrança indevida, acesso bloqueado antes de aula), ou pessoa muito insatisfeita.
- alta: pagamento, cancelamento, reclamação, remarcação para os próximos dias.
- media: dúvidas que precisam da equipe.
- baixa: agradecimentos, elogios, dúvidas respondidas pelas informações abaixo.

Resposta para a pessoa:
- Responda a dúvida só se a resposta estiver nas informações oficiais abaixo. Nunca invente preços, datas, links ou promessas.
- Se precisar da equipe, agradeça, diga em uma frase que a mensagem foi registrada e que a equipe vai responder.
- Se a última mensagem enviada por nós já avisou isso e a pessoa só complementou, devolva resposta "" (não repita).
- Máximo de 3 frases, tom acolhedor, português do Brasil, sem markdown além de *negrito* do WhatsApp.
- precisa_humano = false apenas quando a sua resposta resolve tudo (ou a mensagem não pede nada, ex.: "obrigada!").

Informações oficiais:
${faq || "(nenhuma informação cadastrada: encaminhe tudo para a equipe)"}`;
}

/**
 * Classifica o ticket a partir das últimas mensagens.
 * Devolve { categoria, prioridade, resumo, resposta, precisa_humano }.
 */
export async function triarTicket(ticket, ctx) {
  const { repo, claude, config } = ctx;
  const mensagens = repo.mensagensDoTicket(ticket.id).slice(-20);
  const pessoa = ticket.pessoa_id ? repo.pessoa(ticket.pessoa_id) : null;

  const quem = pessoa
    ? `${pessoa.tipo === "mentor" ? "Mentor" : "Mentorada"} cadastrada: ${pessoa.nome}, ${pessoa.cidade || "?"}/${pessoa.estado || "?"}, status ${pessoa.status}.`
    : `Contato não cadastrado. Nome no WhatsApp: ${ticket.nome || "desconhecido"}.`;
  const proximas = pessoa
    ? repo.agenda({ de: agoraLocal(), ate: "9999", pessoa_id: pessoa.id }).slice(0, 3)
    : [];
  const agenda = proximas.length ? `Próximas sessões: ${proximas.map((a) => dataHumana(a.inicio)).join("; ")}.` : "";

  const conversa = mensagens
    .map((m) => `[${m.criado_em.replace("T", " ")}] ${m.direcao === "entrada" ? "PESSOA" : `NÓS (${m.autor || "equipe"})`}${m.tipo === "audio" ? " (áudio)" : ""}: ${m.texto}`)
    .join("\n");

  const msg = await claude.beta.messages.create({
    model: config.claude.modelo,
    max_tokens: 4000,
    output_config: { effort: "low", format: FORMATO },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: instrucoes(config.nomeNegocio, lerFaq()), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `${quem} ${agenda}\nStatus do atendimento: ${ticket.status}.\n\nConversa:\n${conversa}` }],
  });

  const texto = msg.content.find((b) => b.type === "text")?.text;
  if (msg.stop_reason === "refusal" || !texto) {
    return { categoria: "outro", prioridade: "media", resumo: "Mensagem precisa de leitura da equipe.", resposta: "", precisa_humano: true };
  }
  const r = JSON.parse(texto);
  return {
    categoria: CATEGORIAS.includes(r.categoria) ? r.categoria : "outro",
    prioridade: PRIORIDADES.includes(r.prioridade) ? r.prioridade : "media",
    resumo: String(r.resumo || "").slice(0, 300),
    resposta: String(r.resposta || "").trim(),
    precisa_humano: r.precisa_humano !== false,
  };
}
