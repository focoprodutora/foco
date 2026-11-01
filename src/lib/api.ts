import { supabase } from "./supabase";
import { comprimirFoto } from "./imagem";
import type { Analise, Perfil, Resultado } from "../types";

export class SemCreditosError extends Error {}

const BUCKET = "procedimentos";

async function urlAssinada(path: string) {
  const { data } = await supabase!.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl;
}

export async function carregarPerfil(): Promise<Perfil> {
  if (!supabase) return { id: "demo", nome: "Profissional", studio: "Seu Studio", plano: "gratis", creditos: 5 };
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

export async function analisarFoto(arquivo: File, segmento: string, observacoes: string): Promise<{ analise: Analise; creditos: number }> {
  const foto = await comprimirFoto(arquivo);

  if (!supabase) {
    await new Promise((r) => setTimeout(r, 3500));
    return {
      analise: { id: crypto.randomUUID(), segmento, observacoes, foto_path: "", foto_url: URL.createObjectURL(foto),
        resultado: exemplo(segmento), nota_geral: 8.2, created_at: new Date().toISOString() },
      creditos: 4,
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
  return { analise: { ...data.analise, foto_url: await urlAssinada(path) }, creditos: data.creditos };
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

/** Resultado de exemplo para o modo demonstração */
function exemplo(segmento: string): Resultado {
  const lash = segmento === "cilios";
  return {
    procedimento_identificado: lash ? "Volume brasileiro (Y)" : "Procedimento identificado (exemplo)",
    nota_geral: 8.2,
    resumo: "Trabalho bonito e bem executado, com acabamento limpo na maior parte da área. Com dois ajustes de técnica, o resultado fica com padrão de portfólio.",
    pontos_fortes: ["Boa simetria geral", "Acabamento limpo e sem excessos", "Escolha de curvatura/formato coerente com a cliente"],
    melhorias: [
      { titulo: lash ? "Direcionamento no canto externo" : "Simetria entre os lados", prioridade: "alta",
        o_que_observei: lash ? "No canto externo do olho esquerdo alguns fios estão cruzando para baixo." : "O lado direito está levemente mais alto que o esquerdo.",
        como_melhorar: lash ? "Faça o mapping antes de começar e cole os fios do canto externo apontando para a têmpora. Use fita para levantar a pálpebra." : "Marque pontos de referência antes de começar e confira com a cliente sentada, de frente." },
      { titulo: "Preenchimento uniforme", prioridade: "media",
        o_que_observei: "Há uma pequena falha de densidade na parte central.",
        como_melhorar: "Revise a área com pinça de isolamento e luz de frente antes de finalizar." },
      { titulo: "Qualidade da foto para portfólio", prioridade: "baixa",
        o_que_observei: "A luz amarelada esconde detalhes e muda a cor real.",
        como_melhorar: "Use luz branca de frente e fotografe sem filtros." },
    ],
    criterios: [
      { nome: "Técnica", nota: 8.5, comentario: "Boa execução" },
      { nome: "Simetria", nota: 7.8, comentario: "Pequena diferença entre os lados" },
      { nome: "Acabamento", nota: 8.6, comentario: "Limpo" },
      { nome: "Naturalidade", nota: 8.0, comentario: "Harmonioso" },
    ],
    dica_de_ouro: "Antes de liberar a cliente, tire uma foto de controle e compare os dois lados na tela: o celular mostra assimetrias que o olho não vê.",
    foto: { adequada: true, dica_para_foto: "Luz branca de frente, sem flash, e foco na área do procedimento." },
  };
}
