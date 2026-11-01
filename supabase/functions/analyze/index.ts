// Edge Function: recebe a foto do procedimento, pede a análise para a IA (Claude)
// e salva o resultado no banco. Deploy: supabase functions deploy analyze
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { encodeBase64 } from "@std/encoding/base64";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// O que a IA deve observar em cada segmento
const SEGMENTOS: Record<string, { nome: string; criterios: string[] }> = {
  cilios: {
    nome: "Extensão de cílios (lash)",
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
    criterios: ["Preparação e textura da pele", "Uniformidade da base", "Esfumado e transições", "Simetria", "Harmonia de cores", "Acabamento e durabilidade aparente"],
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
    criterios: ["Aspecto geral da pele", "Uniformidade do tom", "Sinais de irritação", "Hidratação aparente", "Resultado vs. objetivo", "Cuidados pós-procedimento"],
  },
  outro: {
    nome: "Outro procedimento de beleza",
    criterios: ["Técnica", "Simetria", "Acabamento", "Naturalidade", "Apresentação da foto"],
  },
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["procedimento_identificado", "nota_geral", "resumo", "pontos_fortes", "melhorias", "criterios", "dica_de_ouro", "foto"],
  properties: {
    procedimento_identificado: { type: "string", description: "O que você identificou na foto, ex.: 'Volume russo 4D'" },
    nota_geral: { type: "number", description: "Nota de 0 a 10, uma casa decimal" },
    resumo: { type: "string", description: "2 a 3 frases, tom acolhedor e profissional" },
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
          como_melhorar: { type: "string", description: "Passo a passo prático" },
          prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
        },
      },
    },
    criterios: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "nota", "comentario"],
        properties: {
          nome: { type: "string" },
          nota: { type: "number", description: "0 a 10" },
          comentario: { type: "string" },
        },
      },
    },
    dica_de_ouro: { type: "string", description: "Uma dica marcante para a próxima cliente" },
    foto: {
      type: "object",
      additionalProperties: false,
      required: ["adequada", "dica_para_foto"],
      properties: {
        adequada: { type: "boolean", description: "A foto permite uma análise confiável?" },
        dica_para_foto: { type: "string", description: "Como fotografar melhor (luz, ângulo, foco) para portfólio" },
      },
    },
  },
} as const;

const SYSTEM = `Você é uma educadora sênior da área da beleza, com anos de experiência formando profissionais de cílios, unhas, sobrancelhas, maquiagem, cabelo, micropigmentação e estética.
Sua função é analisar a foto de um procedimento feito por uma profissional e devolver um feedback técnico, honesto e didático, como uma mentora faria.

Regras:
- Escreva em português do Brasil, tom acolhedor, respeitoso e motivador, sem ser bajuladora.
- Seja específica: cite a região da foto (ex.: "canto externo do olho esquerdo", "lateral da unha do anelar").
- Em "como_melhorar", dê instruções práticas e aplicáveis no próximo atendimento (técnica, material, posicionamento).
- Liste de 2 a 5 melhorias, ordenadas da mais importante para a menos importante.
- Avalie cada critério informado com nota de 0 a 10.
- Não invente o que não dá para ver. Se a foto estiver escura, desfocada ou em ângulo ruim, diga isso, reduza a confiança e marque foto.adequada = false.
- Não faça diagnóstico médico. Se notar sinais de reação alérgica, inflamação ou lesão, recomende avaliação de um profissional de saúde.
- Analise apenas o procedimento; não comente aparência física, corpo ou idade da cliente.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1) Quem está chamando?
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ erro: "Faça login novamente." }, 401);

  const { foto_path, segmento, observacoes } = await req.json().catch(() => ({}));
  const seg = SEGMENTOS[segmento as string];
  if (!seg || typeof foto_path !== "string" || !foto_path.startsWith(`${user.id}/`)) {
    return json({ erro: "Dados inválidos." }, 400);
  }

  // 2) Desconta 1 crédito (atômico)
  const { data: restantes } = await admin.rpc("consumir_credito", { p_user: user.id });
  if (restantes === -1) return json({ erro: "Seus créditos acabaram. Escolha um plano para continuar.", codigo: "sem_creditos" }, 402);

  try {
    // 3) Baixa a foto do Storage
    const { data: arquivo, error: errFoto } = await admin.storage.from("procedimentos").download(foto_path);
    if (errFoto || !arquivo) throw new Error("Não consegui abrir a foto.");
    const tipo = (arquivo.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
    const base64 = encodeBase64(new Uint8Array(await arquivo.arrayBuffer()));

    // 4) Pede a análise para a IA
    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
    const pedido = `Segmento: ${seg.nome}
Critérios para avaliar: ${seg.criterios.join("; ")}
${observacoes ? `Observações da profissional: ${String(observacoes).slice(0, 600)}` : ""}

Analise a foto acima e responda no formato pedido.`;

    const resposta = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: tipo, data: base64 } },
            { type: "text", text: pedido },
          ],
        },
      ],
    });

    if (resposta.stop_reason === "refusal") throw new Error("A IA não conseguiu analisar esta foto. Tente outra imagem.");
    const texto = resposta.content.find((b) => b.type === "text");
    if (!texto || texto.type !== "text") throw new Error("Resposta vazia da IA.");
    const resultado = JSON.parse(texto.text);

    // 5) Salva no histórico
    const { data: salvo, error: errSalvar } = await admin
      .from("analyses")
      .insert({
        user_id: user.id,
        segmento,
        observacoes: observacoes || null,
        foto_path,
        resultado,
        nota_geral: Math.max(0, Math.min(10, Number(resultado.nota_geral) || 0)),
      })
      .select()
      .single();
    if (errSalvar) throw errSalvar;

    return json({ analise: salvo, creditos: restantes });
  } catch (e) {
    console.error(e);
    await admin.rpc("devolver_credito", { p_user: user.id }); // não cobra se der erro
    const msg = e instanceof Anthropic.RateLimitError
      ? "Muitas análises ao mesmo tempo. Tente de novo em alguns segundos."
      : e instanceof Error ? e.message : "Erro inesperado.";
    return json({ erro: msg }, 500);
  }
});
