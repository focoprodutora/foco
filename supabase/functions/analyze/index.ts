// Edge Function: recebe a foto do procedimento, pede a análise para a IA (Claude)
// e salva o resultado no banco. Deploy: supabase functions deploy analyze
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { encodeBase64 } from "@std/encoding/base64";
import { INSTRUCOES, SCHEMA, SEGMENTOS, montarPedido, normalizar } from "../_shared/analise.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1) Quem está chamando?
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ erro: "Faça login novamente." }, 401);

  const { foto_path, segmento, observacoes } = await req.json().catch(() => ({}));
  if (!SEGMENTOS[segmento as string] || typeof foto_path !== "string" || !foto_path.startsWith(`${user.id}/`)) {
    return json({ erro: "Dados inválidos." }, 400);
  }

  // 2) Desconta 1 crédito (atômico)
  const { data: restantes } = await admin.rpc("consumir_credito", { p_user: user.id });
  if (restantes === -1) return json({ erro: "Seus créditos acabaram. Escolha um plano para continuar.", codigo: "sem_creditos" }, 402);

  let devolver = true;
  try {
    // 3) Baixa a foto do Storage
    const { data: arquivo, error: errFoto } = await admin.storage.from("procedimentos").download(foto_path);
    if (errFoto || !arquivo) throw new Error("Não consegui abrir a foto.");
    const tipo = (arquivo.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
    const base64 = encodeBase64(new Uint8Array(await arquivo.arrayBuffer()));

    // 4) Pede a análise para a IA
    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
    const resposta = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: INSTRUCOES,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: tipo, data: base64 } },
            { type: "text", text: montarPedido(segmento, observacoes) },
          ],
        },
      ],
    });

    if (resposta.stop_reason === "refusal") throw new Error("A IA não conseguiu analisar esta foto. Tente outra imagem.");
    const texto = resposta.content.find((b) => b.type === "text");
    if (!texto || texto.type !== "text") throw new Error("Resposta vazia da IA.");
    const resultado = normalizar(JSON.parse(texto.text));

    // 5) Foto sem procedimento analisável: não cobra e não salva
    if (!resultado.procedimento_visivel) {
      await admin.storage.from("procedimentos").remove([foto_path]);
      return json({ nao_analisavel: true, motivo: resultado.motivo_nao_analisavel, dica_para_foto: resultado.foto.dica_para_foto, visto: resultado.procedimento_identificado, creditos: restantes + 1 });
    }

    // 6) Salva no histórico
    const { data: salvo, error: errSalvar } = await admin
      .from("analyses")
      .insert({ user_id: user.id, segmento, observacoes: observacoes || null, foto_path, resultado, nota_geral: resultado.nota_geral })
      .select()
      .single();
    if (errSalvar) throw errSalvar;

    devolver = false;
    return json({ analise: salvo, creditos: restantes });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Anthropic.RateLimitError
      ? "Muitas análises ao mesmo tempo. Tente de novo em alguns segundos."
      : e instanceof Error ? e.message : "Erro inesperado.";
    return json({ erro: msg }, 500);
  } finally {
    if (devolver) await admin.rpc("devolver_credito", { p_user: user.id }); // não cobra se não houve análise válida
  }
});
