import { useEffect, useState } from "react";
import { ImageOff, TrendingUp } from "lucide-react";
import { listarAnalises } from "../lib/api";
import { segmentoPorId } from "../lib/segmentos";
import { MODO_DEMO } from "../lib/supabase";
import type { Analise } from "../types";
import type { Tela } from "../App";

export default function Historico({ ir }: { ir: (t: Tela) => void }) {
  const [itens, setItens] = useState<Analise[] | null>(null);
  useEffect(() => { listarAnalises().then(setItens).catch(() => setItens([])); }, []);

  const media = itens?.length ? itens.reduce((s, a) => s + Number(a.nota_geral), 0) / itens.length : 0;

  return (
    <div className="pagina pilha">
      <div>
        <p className="eyebrow">Sua evolução</p>
        <h1 style={{ marginTop: 6 }}>Histórico</h1>
      </div>

      {!!itens?.length && (
        <div className="cartao-escuro linha entre">
          <div><p style={{ opacity: 0.7, fontSize: 13 }}>Média das suas análises</p><h1>{media.toFixed(1)}</h1></div>
          <div style={{ textAlign: "right" }}><TrendingUp color="var(--pessego)" /><p style={{ fontSize: 13, opacity: 0.7 }}>{itens.length} procedimentos</p></div>
        </div>
      )}

      {itens === null && <p className="sub">Carregando…</p>}
      {itens?.length === 0 && (
        <div className="vazio-hist">
          <ImageOff size={36} />
          <h3 style={{ marginTop: 12 }}>Nenhuma análise ainda</h3>
          <p className="sub" style={{ marginTop: 6 }}>{MODO_DEMO ? "No modo demonstração o histórico não é salvo." : "Suas análises aparecem aqui para você acompanhar sua evolução."}</p>
        </div>
      )}
      {itens?.map((a) => (
        <button key={a.id} className="item-hist" onClick={() => ir({ nome: "resultado", analise: a })}>
          {a.foto_url ? <img src={a.foto_url} alt="" /> : <div className="ph" />}
          <div>
            <strong style={{ color: "var(--preto)" }}>{a.resultado.procedimento_identificado}</strong>
            <p className="sub" style={{ fontSize: 12 }}>{segmentoPorId(a.segmento).nome} · {new Date(a.created_at).toLocaleDateString("pt-BR")}</p>
          </div>
          <span className="n">{Number(a.nota_geral).toFixed(1)}</span>
        </button>
      ))}
    </div>
  );
}
