import { abrirBanco } from "../src/db.js";
import { criarSecretaria } from "../src/secretaria.js";

/** Claude falso: devolve respostas roteirizadas, na ordem, e guarda os pedidos recebidos. */
export function claudeFalso(roteiro) {
  const pedidos = [];
  return {
    pedidos,
    beta: {
      messages: {
        async create(params) {
          pedidos.push(structuredClone(params));
          const proximo = roteiro.shift();
          if (!proximo) throw new Error("roteiro do Claude falso acabou");
          return typeof proximo === "function" ? proximo(params) : proximo;
        },
      },
    },
  };
}

export const usarFerramenta = (name, input, id = `t_${name}`) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id, name, input }],
});

export const textoFinal = (text) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });

export const triagem = (dados) => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(dados) }] });

export function montar({ roteiro = [], equipe = ["31999990000"], transcrever } = {}) {
  const repo = abrirBanco(":memory:");
  const claude = claudeFalso(roteiro);
  const enviados = [];
  const whatsapp = {
    configurado: true,
    async enviarTexto(telefone, texto) { enviados.push({ telefone, texto }); },
    async baixarMidia() { return { base64: "AAAA", mimetype: "audio/ogg" }; },
  };
  const config = {
    numerosEquipe: equipe,
    nomeNegocio: "Mentoria Teste",
    claude: { modelo: "claude-opus-5-5", esforco: "medium" },
    suporte: { aguardarSegundos: 0, alertaHoras: 2 },
    transcricao: { chave: "x" },
    senhaPainel: "segredo",
    tokenWebhook: "tok",
    resumoDiarioHora: 7,
  };
  const secretaria = criarSecretaria({
    repo, claude, whatsapp, config,
    transcrever: transcrever || (async () => "texto transcrito"),
  });
  return { repo, claude, enviados, secretaria, config };
}
