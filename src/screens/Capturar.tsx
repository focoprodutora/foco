import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Images, Lightbulb, Sparkles, AlertCircle } from "lucide-react";
import { SEGMENTOS, segmentoPorId } from "../lib/segmentos";
import { analisarFoto, SemCreditosError, NaoAnalisavelError } from "../lib/api";
import type { Analise, Perfil } from "../types";

const ETAPAS = ["Enviando sua foto com segurança…", "Identificando o procedimento…", "Avaliando técnica e simetria…", "Comparando com padrões profissionais…", "Escrevendo suas recomendações…"];

interface Props {
  segmentoInicial: string;
  perfil: Perfil | null;
  voltar: () => void;
  concluido: (a: Analise, creditos?: number) => void;
  semCreditos: () => void;
}

export default function Capturar({ segmentoInicial, perfil, voltar, concluido, semCreditos }: Props) {
  const [segmento, setSegmento] = useState(segmentoInicial);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [obs, setObs] = useState("");
  const [analisando, setAnalisando] = useState(false);
  const [etapa, setEtapa] = useState(0);
  const [erro, setErro] = useState("");
  const [recusa, setRecusa] = useState<NaoAnalisavelError | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const seg = segmentoPorId(segmento);

  useEffect(() => {
    if (!analisando) return;
    const t = setInterval(() => setEtapa((e) => Math.min(e + 1, ETAPAS.length - 1)), 2200);
    return () => clearInterval(t);
  }, [analisando]);

  function escolher(f?: File) {
    if (!f) return;
    setArquivo(f); setErro(""); setRecusa(null);
    setPreview(URL.createObjectURL(f));
  }

  async function analisar() {
    if (!arquivo) return;
    if (perfil && perfil.creditos <= 0) return semCreditos();
    setAnalisando(true); setEtapa(0); setErro(""); setRecusa(null);
    try {
      const { analise, creditos } = await analisarFoto(arquivo, segmento, obs);
      concluido(analise, creditos);
    } catch (e) {
      if (e instanceof SemCreditosError) return semCreditos();
      if (e instanceof NaoAnalisavelError) setRecusa(e);
      else
      setErro(e instanceof Error ? e.message : "Algo deu errado.");
      setAnalisando(false);
    }
  }

  if (analisando) {
    return (
      <div className="pagina analisando">
        <div>
          <div className="scanner"><img src={preview} alt="" /></div>
          <p className="eyebrow">Analisando {seg.nome.toLowerCase()}</p>
          <h2 style={{ margin: "8px 0 10px" }}>Sua mentora está olhando<br />cada detalhe ✦</h2>
          <p className="etapa">{ETAPAS[etapa]}</p>
          <p className="sub" style={{ fontSize: 12, marginTop: 8 }}>Pode levar até 1 minuto. A IA está olhando a sua foto de verdade.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pagina pilha">
      <div className="linha">
        <button className="voltar" onClick={voltar} aria-label="Voltar"><ArrowLeft size={18} /></button>
        <div>
          <p className="eyebrow">Nova análise</p>
          <h2>{seg.nome}</h2>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {SEGMENTOS.map((s) => (
          <button key={s.id} onClick={() => setSegmento(s.id)} className={`segmento ${s.id === segmento ? "ativo" : ""}`}
            style={{ padding: "8px 14px", borderRadius: 999, whiteSpace: "nowrap", fontSize: 13, fontWeight: 600, color: "var(--preto)" }}>
            {s.nome}
          </button>
        ))}
      </div>

      <div className="area-foto">
        {preview ? (
          <>
            <img src={preview} alt="Foto do procedimento" />
            <div className="trocar-grupo">
              <button className="trocar" onClick={() => camera.current?.click()}><Camera size={14} /> Câmera</button>
              <button className="trocar" onClick={() => galeria.current?.click()}><Images size={14} /> Galeria</button>
            </div>
          </>
        ) : (
          <div className="vazio">
            <div className="bola"><Camera size={30} /></div>
            <h3>Tire ou envie uma foto</h3>
            <p className="sub" style={{ marginTop: 4 }}>Use a câmera ou escolha da galeria</p>
            <div className="botoes-foto">
              <button className="btn btn-primario" onClick={() => camera.current?.click()}><Camera size={18} /> Tirar foto</button>
              <button className="btn btn-claro" onClick={() => galeria.current?.click()}><Images size={18} /> Escolher da galeria</button>
            </div>
          </div>
        )}
        {/* Câmera: abre direto a câmera traseira. Galeria: sem "capture", o celular mostra fotos e arquivos. */}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={galeria} type="file" accept="image/*" hidden onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      <div className="dicas">
        <div className="linha" style={{ gap: 8 }}><Lightbulb size={16} color="var(--cobre-escuro)" /><strong style={{ color: "var(--preto)", fontSize: 14 }}>Para uma análise precisa</strong></div>
        <ul>{seg.dicasFoto.map((d) => <li key={d}>{d}</li>)}</ul>
      </div>

      <div>
        <label className="rotulo">Quer contar algo? (opcional)</label>
        <textarea className="campo" rows={3} value={obs} onChange={(e) => setObs(e.target.value)}
          placeholder="Ex.: fiz volume 4D com fio 0.07 curvatura D, senti dificuldade no canto interno" />
      </div>

      {recusa && (
        <div className="cartao" style={{ borderLeft: "4px solid var(--ambar)" }}>
          <h3>Não consegui analisar esta foto</h3>
          {recusa.visto && <p className="sub" style={{ marginTop: 6 }}>O que eu vi: {recusa.visto}</p>}
          <p style={{ fontSize: 14, marginTop: 8 }}>{recusa.motivo}</p>
          {recusa.dicaFoto && <div className="como"><b>Como tirar uma foto que dá para analisar</b>{recusa.dicaFoto}</div>}
          <p className="sub" style={{ fontSize: 12, marginTop: 8 }}>Nenhuma análise foi descontada.</p>
        </div>
      )}

      {erro && <div className="aviso"><AlertCircle size={18} />{erro}</div>}

      <button className="btn btn-cobre" disabled={!arquivo} onClick={analisar}>
        <Sparkles size={18} /> Analisar procedimento
      </button>
      <p className="sub" style={{ textAlign: "center", fontSize: 12 }}>Usa 1 análise · você tem {perfil?.creditos ?? "–"}. Suas fotos ficam privadas.</p>
    </div>
  );
}
