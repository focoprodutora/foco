import { ArrowLeft, CheckCircle2, Sparkles, Share2, Camera, AlertTriangle } from "lucide-react";
import { segmentoPorId } from "../lib/segmentos";
import type { Analise } from "../types";
import type { Tela } from "../App";

const CONFIANCA = {
  alta: "Confiança alta: a foto permite avaliar bem",
  media: "Confiança média: a foto tem limitações",
  baixa: "Confiança baixa: a foto dificulta a avaliação, trate como indicativo",
} as const;

// Mesma régua usada nas instruções da IA (supabase/functions/_shared/analise.ts)
function nivel(n: number) {
  if (n >= 9) return "Nível de referência";
  if (n >= 7) return "Bom, com ajustes pontuais";
  if (n >= 5) return "Mediano, com problemas visíveis";
  if (n >= 3) return "Problemas sérios de técnica";
  return "Precisa refazer";
}

const ROTULO = { alta: "Prioridade alta", media: "Prioridade média", baixa: "Ajuste fino" } as const;

export default function ResultadoTela({ analise, ir }: { analise: Analise; ir: (t: Tela) => void }) {
  const r = analise.resultado;
  const seg = segmentoPorId(analise.segmento);
  const nota = Number(r.nota_geral) || 0;

  function compartilhar() {
    const texto = `Minha análise no Capricha ✦ ${r.procedimento_identificado}: nota ${nota.toFixed(1)}\n\nPróximo passo: ${r.melhorias[0]?.titulo ?? ""}\n\nDica de ouro: ${r.dica_de_ouro}`;
    if (navigator.share) navigator.share({ title: "Minha análise", text: texto }).catch(() => {});
    else navigator.clipboard.writeText(texto);
  }

  return (
    <div className="pagina pilha">
      <div className="linha entre">
        <button className="voltar" onClick={() => ir({ nome: "historico" })} aria-label="Voltar"><ArrowLeft size={18} /></button>
        <button className="voltar" onClick={compartilhar} aria-label="Compartilhar"><Share2 size={18} /></button>
      </div>

      <div className="cartao-escuro">
        <p className="eyebrow" style={{ color: "var(--dourado-claro)" }}>{seg.nome}</p>
        <div className="hero-resultado" style={{ marginTop: 10 }}>
          {analise.foto_url && <img className="miniatura" src={analise.foto_url} alt="" />}
          <div className="hero-texto">
            <h2 style={{ fontSize: 20 }}>{r.procedimento_identificado}</h2>
            <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{new Date(analise.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</p>
          </div>
        </div>
        <div className="linha-nota">
          <div className="nota" style={{ ["--p" as string]: nota * 10 }}>
            <div>{nota.toFixed(1)}</div>
          </div>
          <div>
            <p style={{ fontSize: 12, opacity: 0.7, letterSpacing: "0.12em", textTransform: "uppercase" }}>Nota geral · de 0 a 10</p>
            <p className="nivel" style={{ marginTop: 4 }}>{nivel(nota)}</p>
          </div>
        </div>
        <p style={{ marginTop: 16, fontSize: 15, opacity: 0.9 }}>{r.resumo}</p>
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--dourado-claro)" }}>● {CONFIANCA[r.confianca] ?? CONFIANCA.media}</p>
      </div>

      {!r.foto.adequada && (
        <div className="aviso"><AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>A foto limita a precisão da análise. {r.foto.dica_para_foto}</span></div>
      )}

      {r.pontos_fortes.length > 0 && <section className="cartao">
        <h3>O que está bom</h3>
        <ul className="lista-fortes" style={{ marginTop: 8 }}>
          {r.pontos_fortes.map((p) => <li key={p}><CheckCircle2 size={18} />{p}</li>)}
        </ul>
      </section>}

      {r.melhorias.length > 0 && <div>
        <p className="eyebrow">Plano de evolução</p>
        <h2 style={{ marginTop: 4 }}>O que melhorar</h2>
      </div>}
      {r.melhorias.map((m, i) => (
        <section key={i} className={`cartao melhoria ${m.prioridade}`}>
          <div className="linha entre">
            <span className={`tag ${m.prioridade}`}>{ROTULO[m.prioridade] ?? m.prioridade}</span>
            <span className="sub">{i + 1}/{r.melhorias.length}</span>
          </div>
          <h3 style={{ marginTop: 10 }}>{m.titulo}</h3>
          <p style={{ fontSize: 14, marginTop: 6 }}>{m.o_que_observei}</p>
          <div className="como"><b>Como fazer na próxima cliente</b>{m.como_melhorar}</div>
        </section>
      ))}

      <section className="cartao">
        <h3>Avaliação por critério</h3>
        <div style={{ marginTop: 14 }}>
          {r.criterios.map((c) => (
            <div className="criterio" key={c.nome}>
              <div className="linha entre"><b>{c.nome}</b><span>{c.avaliavel === false ? "–" : Number(c.nota).toFixed(1)}</span></div>
              {c.avaliavel === false
                ? <p className="sub" style={{ fontSize: 12 }}>Não dá para avaliar nesta foto</p>
                : <div className="barra"><div style={{ width: `${Math.max(0, Math.min(10, c.nota)) * 10}%` }} /></div>}
              {c.comentario && <p className="sub" style={{ fontSize: 12, marginTop: 4 }}>{c.comentario}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="dica-ouro">
        <div className="linha" style={{ gap: 8 }}><Sparkles size={18} color="var(--dourado-escuro)" /><h3>Dica de ouro</h3></div>
        <p style={{ marginTop: 8, fontSize: 15 }}>{r.dica_de_ouro}</p>
      </section>

      {r.foto.adequada && r.foto.dica_para_foto && <p className="sub" style={{ fontSize: 13 }}><b>📸 Para o portfólio:</b> {r.foto.dica_para_foto}</p>}

      <button className="btn btn-primario" onClick={() => ir({ nome: "capturar", segmento: analise.segmento })}>
        <Camera size={18} /> Nova análise
      </button>
      <p className="sub" style={{ fontSize: 11, textAlign: "center" }}>Análise gerada por IA como apoio educativo. Use seu julgamento profissional.</p>
    </div>
  );
}
