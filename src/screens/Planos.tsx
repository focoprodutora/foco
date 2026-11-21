import { useEffect, useState } from "react";
import { LogOut, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { salvarPerfil } from "../lib/api";
import type { Perfil } from "../types";

// Valores sugeridos. A cobrança (Stripe / Mercado Pago) entra na próxima etapa.
const PLANOS = [
  { id: "gratis", nome: "Grátis", preco: "R$ 0", desc: "Para conhecer", itens: ["5 análises de presente", "Todos os segmentos", "Histórico de evolução"] },
  { id: "pro", nome: "Pro", preco: "R$ 39,90", desc: "Para a profissional que quer evoluir", itens: ["60 análises por mês", "Plano de evolução detalhado", "Dicas de foto para portfólio", "Suporte prioritário"] },
  { id: "studio", nome: "Studio", preco: "R$ 99,90", desc: "Para studios e cursos", itens: ["250 análises por mês", "Até 5 profissionais", "Ideal para educadoras avaliarem alunas"] },
] as const;

export default function Planos({ perfil, aoSalvar }: { perfil: Perfil | null; aoSalvar: () => void }) {
  const [nome, setNome] = useState("");
  const [studio, setStudio] = useState("");
  const [salvo, setSalvo] = useState(false);
  const [aviso, setAviso] = useState("");
  useEffect(() => { setNome(perfil?.nome ?? ""); setStudio(perfil?.studio ?? ""); }, [perfil]);

  return (
    <div className="pagina pilha">
      <div>
        <p className="eyebrow">Seu plano</p>
        <h1 style={{ marginTop: 6 }}>Evolua com <span className="destaque">constância</span></h1>
      </div>

      <div className="cartao-escuro">
        <p style={{ opacity: 0.7, fontSize: 13 }}>Análises disponíveis</p>
        <h1 style={{ fontSize: 44 }}>{perfil?.creditos ?? "–"}</h1>
        <p style={{ fontSize: 13, opacity: 0.7 }}>Plano atual: {PLANOS.find((p) => p.id === perfil?.plano)?.nome ?? "Grátis"}</p>
      </div>

      {PLANOS.map((p) => (
        <div key={p.id} className={`cartao plano ${p.id === "pro" ? "top" : ""}`}>
          <div className="linha entre">
            <div><h3>{p.nome}</h3><p className="sub" style={{ fontSize: 13 }}>{p.desc}</p></div>
            <div className="preco">{p.preco}{p.id !== "gratis" && <small>/mês</small>}</div>
          </div>
          <ul>{p.itens.map((i) => <li key={i}>{i}</li>)}</ul>
          {p.id !== "gratis" && (
            <button className={`btn ${p.id === "pro" ? "btn-dourado" : "btn-claro"}`} style={{ marginTop: 14 }}
              onClick={() => setAviso(p.id)}>
              {perfil?.plano === p.id ? <><Check size={18} /> Seu plano</> : `Assinar ${p.nome}`}
            </button>
          )}
          {aviso === p.id && <p className="sub" style={{ marginTop: 10, color: "var(--dourado-escuro)" }}>Pagamentos em breve! Fale com a gente para liberar seu plano.</p>}
        </div>
      ))}

      <section className="cartao pilha">
        <h3>Seus dados</h3>
        <div><label className="rotulo">Nome</label><input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        <div><label className="rotulo">Studio / marca</label><input className="campo" value={studio} onChange={(e) => setStudio(e.target.value)} placeholder="Ex.: Studio Bella Lash" /></div>
        <button className="btn btn-primario" onClick={async () => { await salvarPerfil(nome, studio); aoSalvar(); setSalvo(true); setTimeout(() => setSalvo(false), 2000); }}>
          {salvo ? "Salvo ✓" : "Salvar"}
        </button>
        {supabase && <button className="btn btn-claro" onClick={() => supabase!.auth.signOut()}><LogOut size={18} /> Sair</button>}
      </section>
    </div>
  );
}
