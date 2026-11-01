import icone from "../assets/icon.svg";
import { useEffect, useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { SEGMENTOS } from "../lib/segmentos";
import type { Perfil } from "../types";
import type { Tela } from "../App";

type EventoInstalar = Event & { prompt: () => Promise<void> };

export default function Inicio({ perfil, ir }: { perfil: Perfil | null; ir: (t: Tela) => void }) {
  const [instalar, setInstalar] = useState<EventoInstalar | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstalar(e as EventoInstalar); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  const primeiroNome = perfil?.nome?.split(" ")[0] ?? "";

  return (
    <div className="pagina pilha">
      <div className="topo">
        <div className="marca"><img src={icone} alt="" /> Foco Beauty</div>
        <button className="chip-creditos" onClick={() => ir({ nome: "planos" })}>
          <b>{perfil?.creditos ?? "–"}</b> análises
        </button>
      </div>

      <div>
        <p className="eyebrow">Olá{primeiroNome ? `, ${primeiroNome}` : ""} ✦</p>
        <h1 style={{ marginTop: 6 }}>O que vamos <span className="destaque">aperfeiçoar</span> hoje?</h1>
      </div>

      <div className="cartao-escuro">
        <h3>Como funciona</h3>
        <div className="passos">
          <div className="passo"><i>1</i>Escolha o segmento</div>
          <div className="passo"><i>2</i>Tire ou envie a foto</div>
          <div className="passo"><i>3</i>Receba as melhorias</div>
        </div>
      </div>

      <div className="linha entre" style={{ marginTop: 24 }}>
        <h2>Segmentos</h2>
        <span className="sub">toque para começar</span>
      </div>
      <div className="grade">
        {SEGMENTOS.map((s) => (
          <button key={s.id} className="segmento" onClick={() => ir({ nome: "capturar", segmento: s.id })}>
            <div className="ic"><s.icone size={20} /></div>
            <strong>{s.nome}</strong>
            <span>{s.exemplo}</span>
          </button>
        ))}
      </div>

      {instalar && (
        <div className="cartao banner-instalar">
          <Download size={22} color="var(--cobre-escuro)" />
          <div style={{ flex: 1 }}>
            <strong style={{ color: "var(--preto)" }}>Instale o app</strong>
            <p className="sub">Acesso rápido direto da tela inicial.</p>
          </div>
          <button className="btn btn-primario" style={{ width: "auto", padding: "10px 14px" }} onClick={() => instalar.prompt().then(() => setInstalar(null))}>
            Instalar <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
