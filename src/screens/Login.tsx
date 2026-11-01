import { useState } from "react";
import { Mail, Lock, User } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [modo, setModo] = useState<"entrar" | "criar">("criar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setAviso(""); setCarregando(true);
    try {
      if (modo === "criar") {
        const { data, error } = await supabase!.auth.signUp({ email, password: senha, options: { data: { nome } } });
        if (error) throw error;
        if (!data.session) setAviso("Enviamos um link de confirmação para o seu e-mail. ✨");
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email, password: senha });
        if (error) throw new Error("E-mail ou senha incorretos.");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Algo deu errado.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login app" style={{ paddingBottom: 0 }}>
      <div className="login-hero">
        <div className="marca" style={{ color: "var(--creme)" }}>
          <img src="/icons/icon.svg" alt="" /> Foco Beauty
        </div>
        <h1>Seu olhar técnico,<br /><span className="destaque" style={{ color: "var(--pessego)" }}>em segundos.</span></h1>
        <p style={{ marginTop: 12, opacity: 0.8 }}>Fotografe o procedimento e receba uma análise com o que está ótimo e o que dá para melhorar.</p>
      </div>

      <form className="login-form pilha" onSubmit={enviar}>
        <h2>{modo === "criar" ? "Crie sua conta grátis" : "Bem-vinda de volta"}</h2>
        <p className="sub">{modo === "criar" ? "5 análises de presente para você testar." : "Entre para continuar evoluindo."}</p>

        {modo === "criar" && (
          <div><label className="rotulo"><User size={13} /> Seu nome</label>
            <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como quer ser chamada?" required /></div>
        )}
        <div><label className="rotulo"><Mail size={13} /> E-mail</label>
          <input className="campo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" required /></div>
        <div><label className="rotulo"><Lock size={13} /> Senha</label>
          <input className="campo" type="password" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" required /></div>

        {erro && <p className="erro">{erro}</p>}
        {aviso && <p className="sub" style={{ color: "var(--verde)" }}>{aviso}</p>}

        <button className="btn btn-primario" disabled={carregando}>{carregando ? "Aguarde..." : modo === "criar" ? "Começar agora" : "Entrar"}</button>
        <p className="sub" style={{ textAlign: "center" }}>
          {modo === "criar" ? "Já tem conta? " : "Ainda não tem conta? "}
          <button type="button" className="btn-texto" onClick={() => setModo(modo === "criar" ? "entrar" : "criar")}>
            {modo === "criar" ? "Entrar" : "Criar conta"}
          </button>
        </p>
      </form>
    </div>
  );
}
