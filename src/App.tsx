import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Home, Camera, Clock, Crown } from "lucide-react";
import { supabase, MODO_DEMO } from "./lib/supabase";
import { carregarPerfil } from "./lib/api";
import type { Analise, Perfil } from "./types";
import Login from "./screens/Login";
import Inicio from "./screens/Inicio";
import Capturar from "./screens/Capturar";
import ResultadoTela from "./screens/Resultado";
import Historico from "./screens/Historico";
import Planos from "./screens/Planos";

export type Tela =
  | { nome: "inicio" }
  | { nome: "capturar"; segmento: string }
  | { nome: "resultado"; analise: Analise }
  | { nome: "historico" }
  | { nome: "planos" };

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(MODO_DEMO ? null : undefined);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [tela, setTela] = useState<Tela>({ nome: "inicio" });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const logado = MODO_DEMO || !!sessao;
  const atualizarPerfil = useCallback(() => { carregarPerfil().then(setPerfil).catch(console.error); }, []);
  useEffect(() => { if (logado) atualizarPerfil(); }, [logado, atualizarPerfil]);

  const ir = (t: Tela) => { setTela(t); window.scrollTo({ top: 0 }); };

  if (sessao === undefined) return null; // carregando sessão
  if (!logado) return <Login />;

  return (
    <div className="app">
      {MODO_DEMO && <div className="banner-demo">Modo de teste · análise real com IA · o histórico não é salvo</div>}

      {tela.nome === "inicio" && <Inicio perfil={perfil} ir={ir} />}
      {tela.nome === "capturar" && (
        <Capturar
          segmentoInicial={tela.segmento}
          perfil={perfil}
          voltar={() => ir({ nome: "inicio" })}
          concluido={(analise, creditos) => {
            if (creditos !== undefined) setPerfil((p) => (p ? { ...p, creditos } : p));
            ir({ nome: "resultado", analise });
          }}
          semCreditos={() => ir({ nome: "planos" })}
        />
      )}
      {tela.nome === "resultado" && <ResultadoTela analise={tela.analise} ir={ir} />}
      {tela.nome === "historico" && <Historico ir={ir} />}
      {tela.nome === "planos" && <Planos perfil={perfil} aoSalvar={atualizarPerfil} />}

      <nav className="nav">
        <button className={tela.nome === "inicio" ? "ativo" : ""} onClick={() => ir({ nome: "inicio" })}><Home size={22} />Início</button>
        <button className={tela.nome === "historico" ? "ativo" : ""} onClick={() => ir({ nome: "historico" })}><Clock size={22} />Histórico</button>
        <button className="central" aria-label="Nova análise" onClick={() => ir({ nome: "capturar", segmento: "cilios" })}><Camera size={24} /></button>
        <button className={tela.nome === "planos" ? "ativo" : ""} onClick={() => ir({ nome: "planos" })}><Crown size={22} />Plano</button>
      </nav>
    </div>
  );
}
