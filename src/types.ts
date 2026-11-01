export type Prioridade = "alta" | "media" | "baixa";

export interface Resultado {
  procedimento_visivel: boolean;
  motivo_nao_analisavel: string;
  confianca: "alta" | "media" | "baixa";
  procedimento_identificado: string;
  nota_geral: number;
  resumo: string;
  pontos_fortes: string[];
  melhorias: { titulo: string; o_que_observei: string; como_melhorar: string; prioridade: Prioridade }[];
  criterios: { nome: string; avaliavel: boolean; nota: number; comentario: string }[];
  dica_de_ouro: string;
  foto: { adequada: boolean; dica_para_foto: string };
}

export interface Analise {
  id: string;
  segmento: string;
  observacoes: string | null;
  foto_path: string;
  foto_url?: string;
  resultado: Resultado;
  nota_geral: number;
  created_at: string;
}

export interface Perfil {
  id: string;
  nome: string | null;
  studio: string | null;
  plano: "gratis" | "pro" | "studio";
  creditos: number;
}
