import { Eye, Hand, Sparkles, Palette, Scissors, PenTool, Flower2, Star, type LucideIcon } from "lucide-react";

export interface Segmento {
  id: string;
  nome: string;
  exemplo: string;
  icone: LucideIcon;
  dicasFoto: string[];
}

export const SEGMENTOS: Segmento[] = [
  { id: "cilios", nome: "Cílios", exemplo: "Fio a fio, volume, lash lifting", icone: Eye,
    dicasFoto: ["Cliente de olhos fechados, rosto relaxado", "Foto de cima e de frente, um olho por vez", "Luz branca de frente (ring light), sem flash"] },
  { id: "unhas", nome: "Unhas", exemplo: "Alongamento, gel, nail art", icone: Hand,
    dicasFoto: ["Mão apoiada em fundo neutro", "Uma foto de cima e outra de perfil (curvatura)", "Limpe resíduos antes de fotografar"] },
  { id: "sobrancelhas", nome: "Sobrancelhas", exemplo: "Design, henna, brow lamination", icone: Sparkles,
    dicasFoto: ["Rosto de frente, olhando para a câmera", "As duas sobrancelhas na mesma foto", "Cabelo preso, sem sombra no rosto"] },
  { id: "maquiagem", nome: "Maquiagem", exemplo: "Social, noiva, editorial", icone: Palette,
    dicasFoto: ["Luz natural de frente, perto da janela", "Rosto inteiro, de frente", "Sem filtros de beleza"] },
  { id: "cabelo", nome: "Cabelo", exemplo: "Corte, coloração, mechas", icone: Scissors,
    dicasFoto: ["Cabelo finalizado e penteado", "Foto de costas e de lado", "Luz natural mostra a cor real"] },
  { id: "micropigmentacao", nome: "Micropigmentação", exemplo: "Sobrancelha, lábios, olhos", icone: PenTool,
    dicasFoto: ["Foto logo após e, se possível, na cicatrização", "Rosto de frente, bem iluminado", "Foco nítido na área"] },
  { id: "estetica", nome: "Estética facial", exemplo: "Limpeza, peeling, skincare", icone: Flower2,
    dicasFoto: ["Mesma luz e ângulo do antes", "Rosto limpo, sem maquiagem", "Evite luz amarelada"] },
  { id: "outro", nome: "Outro", exemplo: "Qualquer procedimento", icone: Star,
    dicasFoto: ["Área do procedimento bem enquadrada", "Boa luz, sem flash", "Foco nítido"] },
];

export const segmentoPorId = (id: string) => SEGMENTOS.find((s) => s.id === id) ?? SEGMENTOS[SEGMENTOS.length - 1];
