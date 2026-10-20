// Secretária da equipe: entende o pedido (texto ou áudio transcrito) e usa as ferramentas.
import { DEFINICOES, executarFerramenta } from "./ferramentas.js";
import { IMAGENS_LEGIVEIS } from "../arquivos.js";
import { agoraLocal, dataHumana, diaDaSemana, somarMinutos } from "../util.js";

const MAX_RODADAS = 10;

function instrucoes(nomeNegocio) {
  return `Você é a secretária eletrônica de ${nomeNegocio}, uma mentoria que faz palestras em vários estados do Brasil.
Quem fala com você pelo WhatsApp é sempre alguém da equipe, quase sempre por áudio transcrito.
Seu trabalho, como uma assessora executiva:
- Cadastro de mentoradas e mentores (nome, telefone, estado, cidade) e registro de palestras por estado.
- Agenda de sessões com as mentoradas (os lembretes para elas saem sozinhos 24h e 1h antes).
- Tarefas e lembretes da própria equipe ("me lembra amanhã às 9 de ligar para a Juliana").
- Financeiro das mentoradas: cobranças (o que cada uma deve e quando vence) e pagamentos recebidos.
- Anotações e arquivos de cada mentorada (contratos, fichas, comprovantes, prints).
- Ajudar a equipe a dar conta das mensagens do suporte.

Como trabalhar:
- Transcrições de áudio têm erros. Corrija nomes de cidades e estados ("Uberlândia, Minas" = Uberlândia/MG) e
  telefones ditos por extenso. Se algo essencial estiver ambíguo, pergunte em vez de adivinhar.
- Datas são sempre no horário de Brasília. Resolva "terça que vem", "amanhã às 3 da tarde" a partir da data atual
  informada na mensagem. "3 da tarde" = 15:00.
- Antes de agendar, cobrar ou anotar algo de alguém, encontre a pessoa com buscar_pessoas. Se não existir e a equipe
  deu os dados, cadastre primeiro.
- Se faltar telefone, estado ou cidade num cadastro, cadastre com o que tem e pergunte o que falta numa frase.
- "Me lembra", "não me deixa esquecer", "preciso fazer" = criar_tarefa. Sem horário dito, crie sem horário.
  Se a pessoa responder "feito" ou "adia para…" sem dizer qual tarefa, é a do lembrete que ela acabou de receber:
  ache com listar_tarefas (atrasadas) e confirme qual foi.
- Valores em reais: "quinhentos" = 500, "1,5 mil" = 1500. "Pagou" = registrar_pagamento; se houver cobrança aberta
  de mesmo valor dessa pessoa, informe a cobranca_id para dar baixa. Nunca diga que um pagamento foi feito se a equipe não disse.
- Quando chegar foto ou documento: ele já fica guardado (o número do arquivo vem na mensagem). Leia o conteúdo.
  Se for ficha de inscrição, cadastre a pessoa; se for comprovante, registre o pagamento com o arquivo_id;
  se for de uma mentorada, ligue o arquivo a ela com guardar_arquivo. Se não der para saber o que fazer, pergunte.
- Nunca envie mensagem ou arquivo para mentoradas ou para o suporte sem a equipe ter pedido. Se for útil, ofereça.
- Nunca invente dados. Tudo o que você confirmar precisa ter vindo das ferramentas.

Como responder (vai para o WhatsApp):
- Curto e direto, em português do Brasil, tom simpático e profissional.
- Use *negrito* do WhatsApp com moderação e listas com "•". Nada de tabelas nem markdown de títulos.
- Confirme o que foi feito com os dados principais, ex.: "✅ Juliana Martins · (31) 98877-6655 · Uberlândia/MG · terça, 27/10 às 10h".`;
}

function contextoDeData() {
  const agora = agoraLocal();
  const proximos = Array.from({ length: 7 }, (_, i) => {
    const d = somarMinutos(agora, (i + 1) * 24 * 60);
    return `${diaDaSemana(d)} ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  });
  return `[Agora: ${dataHumana(agora)} de ${agora.slice(0, 4)} (${agora.slice(0, 10)}), horário de Brasília. Próximos dias: ${proximos.join("; ")}]`;
}

/**
 * Processa um pedido da equipe e devolve o texto de resposta.
 * ctx: { repo, claude, config, enviar, enviarArquivo, autor, telefone }
 * `anexo` ({ registro, base64 }) é uma foto ou documento que acabou de chegar.
 */
function blocosDoAnexo({ registro, base64 }) {
  const aviso = `[Arquivo recebido e já guardado: arquivo #${registro.id}, "${registro.nome_arquivo}", ${registro.mimetype}]`;
  if (IMAGENS_LEGIVEIS.includes(registro.mimetype)) {
    return [{ type: "image", source: { type: "base64", media_type: registro.mimetype, data: base64 } }, aviso];
  }
  if (registro.mimetype === "application/pdf") {
    return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }, aviso];
  }
  return [null, `${aviso} (formato que não consigo ler, mas está guardado)`];
}

export async function atenderEquipe({ texto, veioDeAudio, anexo }, ctx) {
  const { repo, claude, config } = ctx;
  const historico = repo.historicoConversa(ctx.telefone, somarMinutos(agoraLocal(), -6 * 60));
  while (historico[0]?.papel === "assistant") historico.shift(); // a conversa precisa começar pela equipe

  const [blocoAnexo, avisoAnexo] = anexo ? blocosDoAnexo(anexo) : [null, null];
  const comoFalou = anexo ? "mandou um arquivo" : veioDeAudio ? "mandou um áudio, transcrito" : "escreveu";
  const entrada = `${contextoDeData()}\n${avisoAnexo ? `${avisoAnexo}\n` : ""}${ctx.autor} (equipe) ${comoFalou}: ${texto || "(sem legenda)"}`;
  const messages = [
    ...historico.map((h) => ({ role: h.papel, content: h.texto })),
    { role: "user", content: blocoAnexo ? [blocoAnexo, { type: "text", text: entrada }] : entrada },
  ];

  let resposta = "";
  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const msg = await claude.beta.messages.create({
      model: config.claude.modelo,
      max_tokens: 16000,
      output_config: { effort: config.claude.esforco },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: instrucoes(config.nomeNegocio), cache_control: { type: "ephemeral" } }],
      tools: DEFINICOES,
      messages,
    });

    if (msg.stop_reason === "refusal") {
      resposta = "Desculpe, não consegui fazer isso. Pode reformular o pedido?";
      break;
    }

    messages.push({ role: "assistant", content: msg.content });
    const textos = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

    if (msg.stop_reason === "pause_turn") continue;

    const chamadas = msg.content.filter((b) => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || chamadas.length === 0) {
      resposta = textos;
      break;
    }

    const resultados = [];
    for (const chamada of chamadas) {
      const { conteudo, erro } = await executarFerramenta(chamada.name, chamada.input, ctx);
      resultados.push({ type: "tool_result", tool_use_id: chamada.id, content: conteudo, ...(erro && { is_error: true }) });
    }
    messages.push({ role: "user", content: resultados });
  }

  resposta ||= "Feito, mas não consegui montar a confirmação. Confira no painel.";
  repo.salvarConversa(ctx.telefone, "user", entrada);
  repo.salvarConversa(ctx.telefone, "assistant", resposta);
  return resposta;
}
