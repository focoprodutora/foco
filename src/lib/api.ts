import { supabase } from "./supabase";
import { comprimirFoto } from "./imagem";
import { normalizar, pedidoComFormato } from "../../supabase/functions/_shared/analise";
import type { Analise, Perfil, Resultado } from "../types";

export class SemCreditosError extends Error {}

/** A foto não mostra um procedimento analisável. Nada é cobrado nem salvo. */
export class NaoAnalisavelError extends Error {
  constructor(public motivo: string, public dicaFoto: string, public visto: string) { super(motivo); }
}

const BUCKET = "procedimentos";

async function urlAssinada(path: string) {
  const { data } = await supabase!.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl;
}

export async function carregarPerfil(): Promise<Perfil> {
  if (!supabase) return { id: "teste", nome: "", studio: "", plano: "gratis", creditos: 5 };
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user!.id).single();
  if (error) throw error;
  return data as Perfil;
}

export async function salvarPerfil(nome: string, studio: string) {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  await supabase.from("profiles").update({ nome, studio }).eq("id", u.user!.id);
}

export async function analisarFoto(arquivo: File, segmento: string, observacoes: string): Promise<{ analise: Analise; creditos?: number }> {
  const foto = await comprimirFoto(arquivo);

  if (!supabase) {
    const resultado = await analisarPeloClaude(foto, segmento, observacoes);
    return {
      analise: { id: crypto.randomUUID(), segmento, observacoes, foto_path: "", foto_url: URL.createObjectURL(foto),
        resultado, nota_geral: resultado.nota_geral, created_at: new Date().toISOString() },
    };
  }

  const { data: u } = await supabase.auth.getUser();
  const path = `${u.user!.id}/${crypto.randomUUID()}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, foto, { contentType: "image/jpeg" });
  if (up.error) throw new Error("Falha ao enviar a foto. Verifique sua internet.");

  const { data, error } = await supabase.functions.invoke("analyze", { body: { foto_path: path, segmento, observacoes } });
  if (error) {
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
    if (corpo?.codigo === "sem_creditos") throw new SemCreditosError(corpo.erro);
    throw new Error(corpo?.erro ?? "Não foi possível analisar agora. Tente novamente.");
  }
  if (data.nao_analisavel) throw new NaoAnalisavelError(data.motivo, data.dica_para_foto, data.visto);
  return { analise: { ...data.analise, foto_url: await urlAssinada(path) }, creditos: data.creditos };
}

// ---------------------------------------------------------------------------
// Modo de teste (link publicado no Claude): a análise é feita de verdade,
// usando a conta do Claude de quem está testando. Nada é inventado.
// ---------------------------------------------------------------------------
type Sample = { json: (input: string, opts: object) => Promise<unknown> };
type ClaudeRuntime = { use: (nome: string) => Promise<Sample | null> };

const MENSAGENS: Record<string, string> = {
  not_granted: "Para analisar, toque em permitir quando o Claude perguntar. Esta versão de teste usa a sua conta do Claude.",
  rate_limited: "Muitas análises seguidas. Espere um pouco e tente de novo.",
  image_rejected: "Não consegui ler esta imagem. Tente outra foto (JPG ou PNG).",
  images_unavailable: "Este aparelho não consegue enviar imagens para a análise.",
  refused: "A IA não analisou esta foto. Tente outra imagem.",
  session_expired: "Sua sessão expirou. Entre de novo no Claude.",
};

async function analisarPeloClaude(foto: Blob, segmento: string, observacoes: string): Promise<Resultado> {
  const runtime = (window as unknown as { claude?: ClaudeRuntime }).claude;
  const sample = runtime ? await runtime.use("sample") : null;
  if (!sample) throw new Error("Esta versão de teste só analisa quando aberta dentro do Claude, com uma conta do Claude logada. Nenhum resultado foi inventado.");
  try {
    const bruto = await sample.json(pedidoComFormato(segmento, observacoes), { images: [foto], cache: false });
    const r = normalizar(bruto) as Resultado;
    if (!r.procedimento_visivel) throw new NaoAnalisavelError(r.motivo_nao_analisavel, r.foto.dica_para_foto, r.procedimento_identificado);
    return r;
  } catch (e) {
    if (e instanceof Error) throw e;
    const code = (e as { code?: string })?.code ?? "";
    throw new Error(MENSAGENS[code] ?? "Não foi possível analisar agora. Tente novamente.");
  }
}

export async function listarAnalises(): Promise<Analise[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("analyses").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  const paths = (data ?? []).map((a) => a.foto_path);
  const { data: urls } = paths.length
    ? await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60)
    : { data: [] as { signedUrl: string }[] };
  return (data ?? []).map((a, i) => ({ ...a, foto_url: urls?.[i]?.signedUrl })) as Analise[];
}

export async function apagarAnalise(a: Analise) {
  if (!supabase) return;
  await supabase.from("analyses").delete().eq("id", a.id);
  await supabase.storage.from(BUCKET).remove([a.foto_path]);
}
