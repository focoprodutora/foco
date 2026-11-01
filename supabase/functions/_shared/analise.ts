// Regras da análise, compartilhadas entre a Edge Function (app real) e o app (modo de teste).
// Sem dependências: roda no Deno e no navegador.

export const SEGMENTOS: Record<string, { nome: string; criterios: string[] }> = {
  cilios: {
    nome: "Extensão de cílios (lash) / lash lifting",
    criterios: ["Isolamento dos fios", "Direcionamento e mapping", "Simetria entre os olhos", "Densidade e preenchimento", "Distância da raiz / colagem", "Acabamento dos cantos"],
  },
  unhas: {
    nome: "Unhas (alongamento, esmaltação, nail art)",
    criterios: ["Cutilagem e limpeza", "Estrutura e curvatura (ápice)", "Formato e simetria", "Espessura e nivelamento", "Acabamento de esmaltação e bordas", "Brilho e finalização"],
  },
  sobrancelhas: {
    nome: "Design de sobrancelhas / brow lamination / henna",
    criterios: ["Simetria", "Proporção com o rosto (visagismo)", "Início, arco e cauda", "Limpeza dos fios", "Uniformidade da cor", "Naturalidade"],
  },
  maquiagem: {
    nome: "Maquiagem",
    criterios: ["Preparação e textura da pele", "Uniformidade da base", "Esfumado e transições", "Simetria", "Harmonia de cores", "Acabamento"],
  },
  cabelo: {
    nome: "Cabelo (corte, coloração, mechas, penteado)",
    criterios: ["Uniformidade da cor", "Transição / degradê", "Linha e simetria do corte", "Saúde e brilho dos fios", "Finalização", "Harmonia com o rosto"],
  },
  micropigmentacao: {
    nome: "Micropigmentação (sobrancelha, lábios, olhos)",
    criterios: ["Simetria", "Uniformidade da pigmentação", "Definição de contorno", "Escolha de cor", "Naturalidade", "Sinais de trauma na pele"],
  },
  estetica: {
    nome: "Estética facial (limpeza de pele, peeling, skincare)",
    criterios: ["Aspecto geral da pele", "Uniformidade do tom", "Sinais de irritação", "Hidratação aparente", "Resultado visível", "Cuidados pós-procedimento"],
  },
  outro: {
    nome: "Outro procedimento de beleza",
    criterios: ["Técnica", "Simetria", "Acabamento", "Naturalidade"],
  },
};

export const INSTRUCOES = `Você é uma educadora sênior da área da beleza, que forma profissionais de cílios, unhas, sobrancelhas, maquiagem, cabelo, micropigmentação e estética.
Analise a foto de um procedimento feito por uma profissional e dê um feedback técnico, como uma mentora exigente e justa.

HONESTIDADE VEM PRIMEIRO. Seu valor está em dizer a verdade sobre o que está NA FOTO:
- Descreva apenas o que você realmente vê. Nunca invente detalhes, defeitos ou qualidades que a foto não mostra.
- Primeiro confira se a foto mostra mesmo um procedimento do segmento informado. Se não mostrar (outra coisa na foto, outro segmento, área do procedimento fora de quadro, foto escura ou borrada demais), marque procedimento_visivel = false, explique o motivo em motivo_nao_analisavel e NÃO dê notas (use 0 e avaliavel = false em todos os critérios).
- Se um critério não dá para julgar nesta foto (ângulo, distância, resolução), marque avaliavel = false e diga por quê no comentário, em vez de chutar uma nota.
- Notas calibradas, sem nota de consolação: 9-10 = nível de referência/portfólio de educadora; 7-8 = bom, com ajustes pontuais; 5-6 = mediano, problemas visíveis; 3-4 = problemas sérios de técnica; 0-2 = precisa refazer. Um trabalho com falhas claras NÃO recebe 8.
- pontos_fortes: só o que for realmente bom. Se não houver nada a elogiar com sinceridade, deixe a lista vazia.
- melhorias: liste os problemas reais, do mais importante para o menos importante (de 1 a 5). Se o trabalho estiver excelente, pode haver só ajustes finos. Cite a região exata (ex.: "canto externo do olho esquerdo", "lateral da unha do anelar").
- confianca: "alta" se a foto permite avaliar bem; "media" se há limitações; "baixa" se quase tudo é incerto.
- Tom: respeitoso e construtivo, nunca humilhante, mas sem suavizar a verdade técnica.
- Não faça diagnóstico médico; se vir sinal de alergia, inflamação ou lesão, recomende avaliação de um profissional de saúde.
- Avalie só o procedimento; não comente aparência física, corpo ou idade da cliente.
- Escreva em português do Brasil.`;

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["procedimento_visivel", "motivo_nao_analisavel", "confianca", "procedimento_identificado", "nota_geral", "resumo", "pontos_fortes", "melhorias", "criterios", "dica_de_ouro", "foto"],
  properties: {
    procedimento_visivel: { type: "boolean", description: "A foto mostra um procedimento do segmento informado, de forma analisável?" },
    motivo_nao_analisavel: { type: "string", description: "Se não for analisável, o motivo. Senão, string vazia." },
    confianca: { type: "string", enum: ["alta", "media", "baixa"] },
    procedimento_identificado: { type: "string", description: "O que você vê na foto, ex.: 'Volume russo' ou 'Foto de uma paisagem'" },
    nota_geral: { type: "number", description: "0 a 10, uma casa decimal, calibrada" },
    resumo: { type: "string", description: "2 a 3 frases honestas" },
    pontos_fortes: { type: "array", items: { type: "string" } },
    melhorias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titulo", "o_que_observei", "como_melhorar", "prioridade"],
        properties: {
          titulo: { type: "string" },
          o_que_observei: { type: "string" },
          como_melhorar: { type: "string", description: "Passo a passo prático para a próxima cliente" },
          prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
        },
      },
    },
    criterios: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "avaliavel", "nota", "comentario"],
        properties: {
          nome: { type: "string" },
          avaliavel: { type: "boolean", description: "Dá para julgar este critério nesta foto?" },
          nota: { type: "number", description: "0 a 10 (0 se não avaliável)" },
          comentario: { type: "string" },
        },
      },
    },
    dica_de_ouro: { type: "string" },
    foto: {
      type: "object",
      additionalProperties: false,
      required: ["adequada", "dica_para_foto"],
      properties: {
        adequada: { type: "boolean" },
        dica_para_foto: { type: "string", description: "Como fotografar melhor (luz, ângulo, foco)" },
      },
    },
  },
} as const;

export function montarPedido(segmento: string, observacoes?: string | null) {
  const seg = SEGMENTOS[segmento] ?? SEGMENTOS.outro;
  return `Segmento informado pela profissional: ${seg.nome}
Critérios para avaliar: ${seg.criterios.join("; ")}
${observacoes ? `Observações da profissional (contexto, não prova): ${String(observacoes).slice(0, 600)}` : ""}

Analise a foto enviada seguindo as regras de honestidade.`;
}

const clamp = (n: unknown) => Math.max(0, Math.min(10, Math.round((Number(n) || 0) * 10) / 10));

/** Garante o formato esperado mesmo se algum campo vier faltando. */
// deno-lint-ignore no-explicit-any
export function normalizar(r: any) {
  const visivel = r?.procedimento_visivel !== false;
  return {
    procedimento_visivel: visivel,
    motivo_nao_analisavel: String(r?.motivo_nao_analisavel ?? ""),
    confianca: ["alta", "media", "baixa"].includes(r?.confianca) ? r.confianca : "media",
    procedimento_identificado: String(r?.procedimento_identificado ?? "Procedimento"),
    nota_geral: visivel ? clamp(r?.nota_geral) : 0,
    resumo: String(r?.resumo ?? ""),
    pontos_fortes: Array.isArray(r?.pontos_fortes) ? r.pontos_fortes.map(String) : [],
    // deno-lint-ignore no-explicit-any
    melhorias: (Array.isArray(r?.melhorias) ? r.melhorias : []).map((m: any) => ({
      titulo: String(m?.titulo ?? ""),
      o_que_observei: String(m?.o_que_observei ?? ""),
      como_melhorar: String(m?.como_melhorar ?? ""),
      prioridade: ["alta", "media", "baixa"].includes(m?.prioridade) ? m.prioridade : "media",
    })),
    // deno-lint-ignore no-explicit-any
    criterios: (Array.isArray(r?.criterios) ? r.criterios : []).map((c: any) => ({
      nome: String(c?.nome ?? ""),
      avaliavel: visivel && c?.avaliavel !== false,
      nota: clamp(c?.nota),
      comentario: String(c?.comentario ?? ""),
    })),
    dica_de_ouro: String(r?.dica_de_ouro ?? ""),
    foto: { adequada: r?.foto?.adequada !== false, dica_para_foto: String(r?.foto?.dica_para_foto ?? "") },
  };
}

/** Versão para quando não dá para usar JSON Schema (modo de teste): descreve o formato no texto. */
export function pedidoComFormato(segmento: string, observacoes?: string | null) {
  return `${INSTRUCOES}

${montarPedido(segmento, observacoes)}

Responda SOMENTE com um objeto JSON neste formato (sem texto antes ou depois):
{"procedimento_visivel": true, "motivo_nao_analisavel": "", "confianca": "alta|media|baixa",
 "procedimento_identificado": "...", "nota_geral": 0.0, "resumo": "...",
 "pontos_fortes": ["..."],
 "melhorias": [{"titulo": "...", "o_que_observei": "...", "como_melhorar": "...", "prioridade": "alta|media|baixa"}],
 "criterios": [{"nome": "...", "avaliavel": true, "nota": 0.0, "comentario": "..."}],
 "dica_de_ouro": "...", "foto": {"adequada": true, "dica_para_foto": "..."}}`;
}
