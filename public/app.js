const ESTADOS = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const $ = (sel) => document.querySelector(sel);

// ---------- utilidades ----------

function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function lerSenha() {
  try { return localStorage.getItem("senha-painel") || ""; } catch { return ""; }
}
function gravarSenha(s) {
  try { s ? localStorage.setItem("senha-painel", s) : localStorage.removeItem("senha-painel"); } catch { /* sem armazenamento */ }
}
let senha = lerSenha();

async function api(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(caminho, {
    method: metodo,
    headers: { "Content-Type": "application/json", "x-painel-senha": senha },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401) { mostrarLogin("Senha incorreta."); throw new Error("401"); }
  if (!r.ok) throw new Error(dados.erro || `Erro ${r.status}`);
  return dados;
}

function telefone(t) {
  const d = String(t || "").replace(/\D/g, "");
  if (!d.startsWith("55") || d.length < 12) return t || "";
  const n = d.slice(4);
  return `(${d.slice(2, 4)}) ${n.slice(0, -4)}-${n.slice(-4)}`;
}

function quando(local) {
  if (!local) return "";
  const d = new Date(`${local.slice(0, 16)}:00-03:00`);
  const dia = DIAS[new Date(d.getTime() - 3 * 3600e3).getUTCDay()];
  return `${dia} ${local.slice(8, 10)}/${local.slice(5, 7)} ${local.slice(11, 16)}`;
}

function haQuanto(local) {
  if (!local) return "";
  const min = Math.round((Date.now() - new Date(`${local.slice(0, 16)}:00-03:00`).getTime()) / 60000);
  if (min < 60) return `há ${Math.max(min, 0)} min`;
  if (min < 48 * 60) return `há ${Math.round(min / 60)}h`;
  return `há ${Math.round(min / 1440)} dias`;
}

function hojeLocal(somaDias = 0) {
  return new Date(Date.now() - 3 * 3600e3 + somaDias * 86400e3).toISOString().slice(0, 10);
}

function opcoesEstados(selecionado = "", vazio = "Estado") {
  return `<option value="">${vazio}</option>` + Object.entries(ESTADOS)
    .map(([uf, nome]) => `<option value="${uf}" ${uf === selecionado ? "selected" : ""}>${uf} · ${esc(nome)}</option>`).join("");
}

function plural(n = 0, um, varios = `${um}s`) {
  return `${n} ${n === 1 ? um : varios}`;
}

function toast(msg) {
  alert(msg);
}

// ---------- login e abas ----------

function mostrarLogin(erro = "") {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#erro-login").textContent = erro;
}

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  senha = $("#senha").value;
  try {
    await api("/api/resumo");
    gravarSenha(senha);
    iniciar();
  } catch (err) {
    if (err.message !== "401") $("#erro-login").textContent = err.message;
  }
});

$("#sair").addEventListener("click", () => { gravarSenha(""); senha = ""; mostrarLogin(); });

let abaAtual = "geral";
$("#abas").addEventListener("click", (e) => {
  const botao = e.target.closest("button[data-aba]");
  if (botao) abrirAba(botao.dataset.aba);
});

function abrirAba(aba) {
  abaAtual = aba;
  for (const b of document.querySelectorAll("#abas button")) b.classList.toggle("ativa", b.dataset.aba === aba);
  for (const s of document.querySelectorAll("main section")) s.hidden = s.dataset.secao !== aba;
  ({
    geral: carregarGeral, suporte: carregarTickets, pessoas: carregarPessoas, agenda: carregarAgenda,
    tarefas: carregarTarefas, financeiro: carregarFinanceiro, palestras: carregarPalestras,
  })[aba]?.();
}

// ---------- visão geral ----------

async function carregarGeral() {
  const r = await api("/api/resumo");
  const est = r.estados;
  const total = (campo) => Object.values(est).reduce((s, e) => s + (e[campo] || 0), 0);
  const estadosAtivos = Object.keys(est).filter((uf) => ESTADOS[uf] && (est[uf].mentoradas || est[uf].mentores || est[uf].eventos)).length;

  const avisos = [];
  if (!r.integracoes.whatsapp) avisos.push("WhatsApp ainda não configurado (EVOLUTION_URL, EVOLUTION_CHAVE, EVOLUTION_INSTANCIA). Use a aba <b>Testar</b> enquanto isso.");
  if (!r.integracoes.transcricao) avisos.push("Transcrição de áudio não configurada (TRANSCRICAO_CHAVE).");
  if (!r.integracoes.claude) avisos.push("Chave da IA não configurada (ANTHROPIC_API_KEY).");
  if (!r.integracoes.equipe) avisos.push("Nenhum número da equipe cadastrado (NUMEROS_EQUIPE): tudo vai para o suporte.");
  $("#avisos").innerHTML = avisos.map((a) => `<div class="aviso">${a}</div>`).join("");

  if (r.integracoes.whatsapp) carregarWhatsapp();

  $("#kpis").innerHTML = [
    [total("mentoradas_ativas"), "mentoradas ativas"],
    [total("mentores"), "mentores"],
    [estadosAtivos, "estados com presença"],
    [r.tickets.aberto + r.tickets.em_atendimento, "atendimentos em aberto"],
    [r.sem_resposta, "esperando a equipe", r.sem_resposta > 0],
  ].map(([n, rotulo, alerta]) => `<div class="kpi ${alerta ? "alerta" : ""}"><b>${n}</b><span>${rotulo}</span></div>`).join("");

  $("#mapa-estados").innerHTML = Object.keys(ESTADOS).map((uf) => {
    const e = est[uf] || {};
    const tem = e.mentoradas || e.mentores || e.eventos;
    const linhas = tem
      ? [plural(e.mentoradas, "mentorada"), plural(e.mentores, "mentor", "mentores"), plural(e.eventos, "palestra")]
      : ["—"];
    return `<button class="estado ${tem ? "tem" : ""}" data-uf="${uf}" title="${esc(ESTADOS[uf])}">
      <b>${uf}</b>${linhas.map((l) => `<small>${l}</small>`).join("")}
    </button>`;
  }).join("");

  $("#hoje").innerHTML = r.hoje.length
    ? r.hoje.map((a) => `<li><b>${a.inicio.slice(11, 16)}</b> ${esc(a.pessoa_nome)}
        <div class="sutil">${esc([a.cidade, a.estado].filter(Boolean).join("/"))}${a.mentor_nome ? ` · com ${esc(a.mentor_nome)}` : ""} · ${esc(a.status)}</div></li>`).join("")
    : `<li class="sutil">Nenhuma sessão hoje.</li>`;
}

$("#mapa-estados").addEventListener("click", (e) => {
  const b = e.target.closest("[data-uf]");
  if (!b) return;
  $("#filtro-estado").value = b.dataset.uf;
  abrirAba("pessoas");
});

// ---------- conexão do WhatsApp ----------

let esperaConexao = null;
let ultimaConexao = null; // mantém o código na tela quando o painel se atualiza sozinho

async function carregarWhatsapp(conexao = ultimaConexao) {
  ultimaConexao = conexao;
  const caixa = $("#whatsapp");
  const w = await api("/api/whatsapp");
  if (!w.configurado) { caixa.hidden = true; return; }
  caixa.hidden = false;

  if (w.estado === "open") {
    clearInterval(esperaConexao);
    esperaConexao = null;
    ultimaConexao = null;
    caixa.innerHTML = `<div class="status"><span class="ponto ok"></span>WhatsApp conectado</div>`;
    return;
  }
  if (w.estado === "erro") {
    caixa.innerHTML = `<div class="status"><span class="ponto erro"></span>WhatsApp com problema</div><p class="sutil">${esc(w.erro)}</p>`;
    return;
  }

  let instrucoes = "";
  if (conexao?.codigoPareamento) {
    instrucoes = `<p>No celular do número da secretária: <b>WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone</b> e digite:</p>
      <div class="codigo">${esc(conexao.codigoPareamento)}</div>`;
  } else if (conexao?.qrBase64) {
    const src = conexao.qrBase64.startsWith("data:") ? conexao.qrBase64 : `data:image/png;base64,${conexao.qrBase64}`;
    instrucoes = `<p>No celular do número da secretária: <b>WhatsApp → Aparelhos conectados → Conectar aparelho</b> e aponte para o código:</p>
      <img alt="QR Code do WhatsApp" src="${esc(src)}">`;
  }

  caixa.innerHTML = `<div class="status"><span class="ponto"></span>WhatsApp desconectado</div>
    ${instrucoes || `<p class="sutil">Use o celular com o chip da secretária. Digite o número para receber um código de 8 letras,
      ou deixe em branco para usar QR Code.</p>`}
    <form id="form-conectar" class="filtros" style="margin:0">
      <input name="telefone" placeholder="Número da secretária com DDD (opcional)" value="${esc(conexao?.telefone || "")}">
      <button type="submit">${instrucoes ? "Gerar outro código" : "Conectar WhatsApp"}</button>
    </form>
    <p class="erro" id="erro-conectar"></p>`;

  $("#form-conectar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const telefone = e.target.telefone.value.trim();
    e.submitter.disabled = true;
    try {
      const r = await api("/api/whatsapp/conectar", { metodo: "POST", corpo: { telefone: telefone || undefined } });
      await carregarWhatsapp({ ...r, telefone });
      // Confere a cada 5s se o celular já conectou.
      clearInterval(esperaConexao);
      esperaConexao = setInterval(() => carregarWhatsapp().catch(() => {}), 5000);
    } catch (err) {
      $("#erro-conectar").textContent = err.message;
      e.submitter.disabled = false;
    }
  });
}

// ---------- suporte ----------

let ticketAberto = null;

async function carregarTickets() {
  const lista = await api(`/api/tickets?status=${$("#filtro-ticket").value}`);
  $("#tickets").innerHTML = lista.length ? lista.map((t) => {
    const esperando = t.status !== "resolvido" && t.aguardando_equipe;
    return `<li data-id="${t.id}" class="${t.id === ticketAberto ? "selecionado" : ""}">
      <div class="linha"><b>${esc(t.nome || telefone(t.telefone))}</b><span class="etiqueta p-${esc(t.prioridade)}">${esc(t.prioridade)}</span></div>
      <div class="resumo">${esc(t.resumo || "Aguardando triagem…")}</div>
      <div class="linha"><span class="etiqueta">${esc(t.categoria)}</span>
        <span class="${esperando ? "espera" : "sutil"}">${esperando ? `esperando ${haQuanto(t.ultima_msg_cliente)}` : esc(t.status.replace("_", " "))}</span></div>
    </li>`;
  }).join("") : `<li class="sutil">Nada por aqui 🎉</li>`;
  atualizarBadge();
}

async function atualizarBadge() {
  try {
    const r = await api("/api/resumo");
    $("#badge-suporte").hidden = !r.sem_resposta;
    $("#badge-suporte").textContent = r.sem_resposta;
  } catch { /* ignora */ }
}

$("#filtro-ticket").addEventListener("change", carregarTickets);
$("#tickets").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (li) abrirTicket(Number(li.dataset.id));
});

async function abrirTicket(id) {
  ticketAberto = id;
  for (const li of document.querySelectorAll("#tickets li")) li.classList.toggle("selecionado", Number(li.dataset.id) === id);
  const { ticket: t, mensagens } = await api(`/api/tickets/${id}`);
  const local = [t.cidade, t.estado].filter(Boolean).join("/");
  $("#conversa").innerHTML = `
    <div class="linha" style="display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap">
      <div><h2>${esc(t.nome || "Sem nome")}</h2>
        <p class="sutil">${esc(telefone(t.telefone))}${local ? ` · ${esc(local)}` : " · não cadastrada"} · #${t.id}</p></div>
      <div class="filtros" style="margin:0">
        <select id="t-prioridade">${["urgente", "alta", "media", "baixa"].map((p) => `<option ${p === t.prioridade ? "selected" : ""}>${p}</option>`).join("")}</select>
        <select id="t-status">${[["aberto", "Ninguém assumiu"], ["em_atendimento", "Em atendimento"], ["resolvido", "Resolvido"]]
          .map(([v, n]) => `<option value="${v}" ${v === t.status ? "selected" : ""}>${n}</option>`).join("")}</select>
      </div>
    </div>
    ${t.resumo ? `<div class="aviso">📝 ${esc(t.resumo)}</div>` : ""}
    <div class="chat" id="t-chat">${mensagens.map((m) => `<div class="balao ${m.direcao}">${esc(m.texto)}<small>${m.tipo === "audio" ? "🎤 áudio · " : ""}${esc(m.direcao === "entrada" ? m.autor || "" : m.autor === "secretaria" ? "resposta automática" : m.autor || "equipe")} · ${quando(m.criado_em)}</small></div>`).join("")}</div>
    <form class="enviar" id="t-form">
      <textarea id="t-texto" rows="2" placeholder="Responder pelo WhatsApp…"></textarea>
      <div style="display:grid;gap:.35rem">
        <button type="submit" data-resolver="0">Enviar</button>
        <button type="submit" data-resolver="1" class="secundario">Enviar e resolver</button>
      </div>
    </form>`;
  const chat = $("#t-chat");
  chat.scrollTop = chat.scrollHeight;

  const salvar = async (campos) => { await api(`/api/tickets/${id}`, { metodo: "PATCH", corpo: campos }); carregarTickets(); };
  $("#t-prioridade").addEventListener("change", (e) => salvar({ prioridade: e.target.value }));
  $("#t-status").addEventListener("change", (e) => salvar({ status: e.target.value, responsavel: nomeEquipe() }));
  $("#t-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = $("#t-texto").value.trim();
    if (!texto) return;
    try {
      await api(`/api/tickets/${id}/responder`, { metodo: "POST", corpo: { texto, autor: nomeEquipe(), resolver: e.submitter?.dataset.resolver === "1" } });
      await abrirTicket(id);
      carregarTickets();
    } catch (err) { toast(err.message); }
  });
}

function nomeEquipe() {
  let nome = "";
  try { nome = localStorage.getItem("nome-equipe") || ""; } catch { /* sem armazenamento */ }
  if (!nome) {
    nome = (prompt("Seu nome (aparece para a equipe como responsável):") || "Equipe").trim();
    try { localStorage.setItem("nome-equipe", nome); } catch { /* sem armazenamento */ }
  }
  return nome;
}

// ---------- pessoas ----------

let atrasoBusca;
$("#busca-pessoa").addEventListener("input", () => { clearTimeout(atrasoBusca); atrasoBusca = setTimeout(carregarPessoas, 250); });
for (const id of ["#filtro-tipo", "#filtro-estado", "#filtro-status"]) $(id).addEventListener("change", carregarPessoas);
$("#filtro-estado").innerHTML = opcoesEstados("", "Todos os estados");

let pessoasCarregadas = [];
async function carregarPessoas() {
  const p = new URLSearchParams();
  if ($("#busca-pessoa").value) p.set("q", $("#busca-pessoa").value);
  if ($("#filtro-tipo").value) p.set("tipo", $("#filtro-tipo").value);
  if ($("#filtro-estado").value) p.set("estado", $("#filtro-estado").value);
  if ($("#filtro-status").value) p.set("status", $("#filtro-status").value);
  pessoasCarregadas = await api(`/api/pessoas?${p}`);
  $("#tabela-pessoas").innerHTML = `<thead><tr><th>Nome</th><th>Tipo</th><th>Telefone</th><th>Cidade/UF</th><th>Mentor</th><th>Status</th></tr></thead>
    <tbody>${pessoasCarregadas.map((x) => `<tr data-id="${x.id}">
      <td>${esc(x.nome)}</td><td>${esc(x.tipo)}</td><td>${esc(telefone(x.telefone))}</td>
      <td>${esc([x.cidade, x.estado].filter(Boolean).join("/"))}</td><td>${esc(x.mentor_nome || "")}</td><td>${esc(x.status)}</td>
    </tr>`).join("") || `<tr><td colspan="6" class="sutil">Ninguém encontrado.</td></tr>`}</tbody>`;
}

$("#tabela-pessoas").addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (tr) editarPessoa(pessoasCarregadas.find((p) => p.id === Number(tr.dataset.id)));
});
$("#nova-pessoa").addEventListener("click", () => editarPessoa(null));

function editarPessoa(p) {
  const f = $("#form-dialogo");
  f.innerHTML = `<h2>${p ? "Editar" : "Cadastrar"}</h2>
    <label>Tipo <select name="tipo"><option value="mentorada">Mentorada</option><option value="mentor">Mentor</option></select></label>
    <label>Nome <input name="nome" required value="${esc(p?.nome)}"></label>
    <label>Telefone (com DDD) <input name="telefone" value="${esc(p?.telefone)}"></label>
    <label>Estado <select name="estado">${opcoesEstados(p?.estado || "")}</select></label>
    <label>Cidade <input name="cidade" value="${esc(p?.cidade)}"></label>
    <label>Status <select name="status"><option>ativa</option><option>pausada</option><option>finalizada</option></select></label>
    <label>Observações <textarea name="observacoes" rows="3">${esc(p?.observacoes)}</textarea></label>
    <p class="erro" id="erro-dialogo"></p>
    <div class="acoes">${p ? `<button type="button" class="secundario" id="ver-historico" style="margin-right:auto">Histórico, notas e arquivos</button>` : ""}
      <button value="cancelar" class="secundario" formnovalidate>Cancelar</button><button value="salvar">Salvar</button></div>`;
  if (p) $("#ver-historico").addEventListener("click", () => { $("#dialogo").close(); abrirHistorico(p); });
  f.tipo.value = p?.tipo || "mentorada";
  f.status.value = p?.status || "ativa";
  abrirDialogo(async (dados) => {
    if (p) await api(`/api/pessoas/${p.id}`, { metodo: "PATCH", corpo: dados });
    else await api("/api/pessoas", { metodo: "POST", corpo: dados });
    carregarPessoas();
  });
}

function abrirDialogo(aoSalvar) {
  const d = $("#dialogo");
  const f = $("#form-dialogo");
  f.onsubmit = async (e) => {
    if (e.submitter?.value !== "salvar") return;
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(f));
    for (const k of Object.keys(dados)) if (dados[k] === "") dados[k] = null;
    try { await aoSalvar(dados); d.close(); } catch (err) { $("#erro-dialogo").textContent = err.message; }
  };
  d.showModal();
}

// ---------- histórico da pessoa ----------

function reais(centavos) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function etiquetaLancamento(l) {
  const st = l.tipo === "cobranca" && l.status === "aberta" && l.data < hojeLocal() ? "atrasada" : l.status;
  return `<span class="etiqueta st-${esc(st)}">${esc(st)}</span>`;
}

function dataBr(aaaammdd) {
  return String(aaaammdd || "").slice(0, 10).split("-").reverse().join("/");
}

async function abrirArquivo(id) {
  const r = await fetch(`/api/arquivos/${id}`, { headers: { "x-painel-senha": senha } });
  if (!r.ok) { toast("Arquivo não encontrado."); return; }
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-arquivo]");
  if (link) { e.preventDefault(); abrirArquivo(link.dataset.arquivo); }
});

async function abrirHistorico(p) {
  const d = $("#dialogo");
  const f = $("#form-dialogo");
  const h = await api(`/api/pessoas/${p.id}/historico`);
  const notas = h.registros.filter((r) => r.tipo === "nota");
  const arqs = h.registros.filter((r) => r.tipo === "arquivo");
  const item = (conteudo, rodape) => `<li>${conteudo}${rodape ? `<p class="sutil">${rodape}</p>` : ""}</li>`;
  const vazio = (txt) => `<li class="sutil">${txt}</li>`;
  f.onsubmit = null;
  f.innerHTML = `<h2>${esc(p.nome)}</h2>
    <p class="sutil">${esc(telefone(p.telefone))} · ${esc([p.cidade, p.estado].filter(Boolean).join("/") || "sem cidade")} · ${esc(p.status)}</p>
    <div class="historico">
      <section><h3>Anotações</h3><ul>${notas.map((n) => item(esc(n.texto), `${esc(n.autor || "")} · ${quando(n.criado_em)}`)).join("") || vazio("Nenhuma anotação.")}</ul>
        <div class="enviar" style="margin-top:.5rem"><input id="nova-nota" placeholder="Nova anotação"><button type="button" id="salvar-nota">Anotar</button></div></section>
      <section><h3>Arquivos</h3><ul>${arqs.map((a) => item(`<a href="#" data-arquivo="${a.id}">📎 ${esc(a.titulo || a.nome_arquivo)}</a>`, `${esc(a.nome_arquivo)} · ${quando(a.criado_em)}`)).join("") || vazio("Nenhum arquivo. Mande foto ou PDF no WhatsApp e peça para guardar.")}</ul></section>
      <section><h3>Financeiro</h3><ul>${h.lancamentos.map((l) => item(`${l.tipo === "cobranca" ? "Cobrança" : "Pagamento"} ${reais(l.valor_centavos)} · ${dataBr(l.data)} · ${etiquetaLancamento(l)}`, esc(l.descricao || ""))).join("") || vazio("Nada lançado.")}</ul></section>
      <section><h3>Sessões</h3><ul>${h.sessoes.map((s) => item(`${quando(s.inicio)} · ${esc(s.status)}${s.mentor_nome ? ` · com ${esc(s.mentor_nome)}` : ""}`, esc(s.notas || ""))).join("") || vazio("Nenhuma sessão.")}</ul></section>
      <section><h3>Tarefas</h3><ul>${h.tarefas.map((t) => item(`${esc(t.titulo)} · ${esc(t.status)}`, t.quando ? quando(t.quando) : "")).join("") || vazio("Nenhuma tarefa.")}</ul></section>
    </div>
    <div class="acoes"><button value="fechar" class="secundario">Fechar</button></div>`;
  $("#salvar-nota").addEventListener("click", async () => {
    const texto = $("#nova-nota").value.trim();
    if (!texto) return;
    try {
      await api(`/api/pessoas/${p.id}/anotacoes`, { metodo: "POST", corpo: { texto, autor: nomeEquipe() } });
      abrirHistorico(p);
    } catch (err) { toast(err.message); }
  });
  if (!d.open) {
    d.classList.add("largo");
    d.showModal();
    d.addEventListener("close", () => d.classList.remove("largo"), { once: true });
  }
}

// ---------- tarefas ----------

$("#filtro-tarefas").addEventListener("change", carregarTarefas);

async function carregarTarefas() {
  const lista = await api(`/api/tarefas?filtro=${$("#filtro-tarefas").value}`);
  const agora = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 16);
  $("#lista-tarefas").innerHTML = lista.map((t) => {
    const atrasada = t.status === "pendente" && t.quando && t.quando < agora;
    return `<li class="${t.status === "feita" ? "feita" : ""} ${atrasada ? "atrasada" : ""}">
      <input type="checkbox" data-tarefa="${t.id}" ${t.status === "feita" ? "checked" : ""} aria-label="Concluir">
      <div><div class="titulo">${esc(t.titulo)}</div>
        <div class="meta">${t.quando ? `${atrasada ? "atrasada · " : "⏰ "}${quando(t.quando)}` : "sem horário"}${t.pessoa_nome ? ` · ${esc(t.pessoa_nome)}` : ""}${t.criado_por ? ` · pedida por ${esc(t.criado_por)}` : ""}</div></div>
      <span class="etiqueta p-${t.prioridade === "media" ? "media" : esc(t.prioridade)}">${esc(t.prioridade)}</span>
    </li>`;
  }).join("") || `<li class="sutil" style="display:block">Nenhuma tarefa aqui.</li>`;
}

$("#lista-tarefas").addEventListener("change", async (e) => {
  const id = e.target.dataset.tarefa;
  if (!id) return;
  try {
    await api(`/api/tarefas/${id}`, { metodo: "PATCH", corpo: { status: e.target.checked ? "feita" : "pendente" } });
    carregarTarefas();
  } catch (err) { toast(err.message); }
});

$("#form-tarefa").addEventListener("submit", async (e) => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(e.target));
  try {
    await api("/api/tarefas", { metodo: "POST", corpo: { ...dados, quando: dados.quando || null, autor: nomeEquipe() } });
    e.target.reset();
    carregarTarefas();
  } catch (err) { toast(err.message); }
});

// ---------- financeiro ----------

$("#filtro-financeiro").addEventListener("change", carregarFinanceiro);

async function carregarFinanceiro() {
  const r = await api(`/api/financeiro?situacao=${$("#filtro-financeiro").value}`);
  $("#kpis-financeiro").innerHTML = [
    [r.totais.atrasado, "em atraso", true],
    [r.totais.a_receber, "a receber"],
    [r.totais.recebido_mes, "recebido este mês"],
  ].map(([v, rotulo, alerta]) => `<div class="kpi ${alerta && v !== reais(0) ? "alerta" : ""}"><b>${esc(v)}</b><span>${rotulo}</span></div>`).join("");
  $("#tabela-financeiro").innerHTML = `<thead><tr><th>Data</th><th>Mentorada</th><th>Tipo</th><th class="valor">Valor</th><th>Situação</th><th>Descrição</th><th></th></tr></thead>
    <tbody>${r.itens.map((l) => {
      return `<tr>
        <td>${dataBr(l.data)}</td><td>${esc(l.pessoa_nome)}</td><td>${l.tipo === "cobranca" ? "Cobrança" : "Pagamento"}${l.forma ? ` · ${esc(l.forma)}` : ""}</td>
        <td class="valor">${reais(l.valor_centavos)}</td><td>${etiquetaLancamento(l)}</td>
        <td class="sutil">${esc(l.descricao || "")}${l.arquivo_id ? ` <a href="#" data-arquivo="${l.arquivo_id}">📎 comprovante</a>` : ""}</td>
        <td>${l.tipo === "cobranca" && l.status === "aberta" ? `<button class="secundario" data-baixa="${l.id}">Dar baixa</button>` : ""}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="7" class="sutil">Nada por aqui.</td></tr>`}</tbody>`;
}

$("#tabela-financeiro").addEventListener("click", async (e) => {
  const id = e.target.dataset.baixa;
  if (!id) return;
  try {
    await api(`/api/financeiro/${id}`, { metodo: "PATCH", corpo: { status: "paga" } });
    carregarFinanceiro();
  } catch (err) { toast(err.message); }
});

$("#novo-lancamento").addEventListener("click", async () => {
  const pessoas = await api("/api/pessoas?tipo=mentorada");
  const f = $("#form-dialogo");
  f.innerHTML = `<h2>Lançar no financeiro</h2>
    <label>Tipo <select name="tipo"><option value="pagamento">Pagamento recebido</option><option value="cobranca">Cobrança (a receber)</option></select></label>
    <label>Mentorada <select name="pessoa_id" required>${pessoas.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select></label>
    <label>Valor (R$) <input name="valor" inputmode="decimal" placeholder="500,00" required></label>
    <label>Data (pagamento) ou vencimento (cobrança) <input name="data" type="date" value="${hojeLocal()}"></label>
    <label>Forma <select name="forma"><option value="">—</option><option>pix</option><option>cartao</option><option>boleto</option><option>dinheiro</option><option>transferencia</option></select></label>
    <label>Descrição <input name="descricao" placeholder="Ex.: Parcela 2/6"></label>
    <p class="erro" id="erro-dialogo"></p>
    <div class="acoes"><button value="cancelar" class="secundario" formnovalidate>Cancelar</button><button value="salvar">Salvar</button></div>`;
  abrirDialogo(async (dados) => {
    await api("/api/financeiro", { metodo: "POST", corpo: dados });
    carregarFinanceiro();
  });
});

// ---------- agenda ----------

$("#agenda-de").value = hojeLocal();
$("#agenda-ate").value = hojeLocal(13);
$("#agenda-de").addEventListener("change", carregarAgenda);
$("#agenda-ate").addEventListener("change", carregarAgenda);

async function carregarAgenda() {
  const itens = await api(`/api/agenda?de=${$("#agenda-de").value}&ate=${$("#agenda-ate").value}`);
  const porDia = Map.groupBy ? Map.groupBy(itens, (a) => a.inicio.slice(0, 10)) : agrupar(itens);
  $("#agenda").innerHTML = itens.length ? [...porDia].map(([dia, lista]) => `<div class="cartao" style="margin-bottom:.75rem">
      <h2>${quando(`${dia}T00:00`).slice(0, 9)}</h2>
      <div class="tabela-rolagem" style="border:0"><table><tbody>${lista.map((a) => `<tr data-id="${a.id}">
        <td><b>${a.inicio.slice(11, 16)}</b></td><td>${esc(a.pessoa_nome)}</td>
        <td>${esc([a.cidade, a.estado].filter(Boolean).join("/"))}</td><td>${esc(a.mentor_nome || "")}</td>
        <td><select data-agendamento="${a.id}">${["marcado", "realizado", "faltou", "cancelado"].map((s) => `<option ${s === a.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
        <td class="sutil">${esc(a.notas || "")}</td></tr>`).join("")}</tbody></table></div></div>`).join("")
    : `<div class="cartao sutil">Nenhuma sessão nesse período. Mande um áudio para a secretária: "agenda a Fulana quinta às 15h".</div>`;
}

function agrupar(itens) {
  const m = new Map();
  for (const a of itens) { const k = a.inicio.slice(0, 10); m.set(k, [...(m.get(k) || []), a]); }
  return m;
}

$("#agenda").addEventListener("change", async (e) => {
  const id = e.target.dataset.agendamento;
  if (!id) return;
  try { await api(`/api/agenda/${id}`, { metodo: "PATCH", corpo: { status: e.target.value } }); } catch (err) { toast(err.message); }
});

// ---------- palestras ----------

$("#form-palestra").estado.innerHTML = opcoesEstados();
$("#form-palestra").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/eventos", { metodo: "POST", corpo: Object.fromEntries(new FormData(e.target)) });
    e.target.reset();
    carregarPalestras();
  } catch (err) { toast(err.message); }
});

async function carregarPalestras() {
  const lista = await api("/api/eventos");
  $("#tabela-palestras").innerHTML = `<thead><tr><th>Data</th><th>Palestra</th><th>Cidade/UF</th><th>Local</th></tr></thead>
    <tbody>${lista.map((e) => `<tr><td>${esc(e.data.split("-").reverse().join("/"))}</td><td>${esc(e.titulo)}</td>
      <td>${esc(e.cidade)}/${esc(e.estado)}</td><td>${esc(e.local || "")}</td></tr>`).join("")
      || `<tr><td colspan="4" class="sutil">Nenhuma palestra registrada.</td></tr>`}</tbody>`;
}

// ---------- simulador ----------

function balao(texto, lado, rodape) {
  const div = document.createElement("div");
  div.className = `balao ${lado}`;
  div.innerHTML = `${esc(texto)}${rodape ? `<small>${esc(rodape)}</small>` : ""}`;
  $("#sim-chat").append(div);
  $("#sim-chat").scrollTop = $("#sim-chat").scrollHeight;
  return div;
}

async function simular(corpo, rotulo) {
  balao(rotulo, "saida", "você");
  const espera = balao("…", "entrada");
  try {
    const r = await api("/api/simular", {
      metodo: "POST",
      corpo: { ...corpo, como: $("#sim-como").value, nome: $("#sim-nome").value, telefone: $("#sim-telefone").value },
    });
    espera.remove();
    if (!r.respostas.length) balao("(nenhuma resposta enviada: a mensagem foi registrada para a equipe)", "entrada", "secretária");
    for (const m of r.respostas) balao(m.texto, "entrada", `para ${telefone(m.para)}`);
  } catch (err) {
    espera.remove();
    balao(`Erro: ${err.message}`, "entrada");
  }
}

$("#form-sim").addEventListener("submit", (e) => {
  e.preventDefault();
  const texto = $("#sim-texto").value.trim();
  if (!texto) return;
  $("#sim-texto").value = "";
  simular({ texto }, texto);
});

let gravador = null;
$("#sim-gravar").addEventListener("click", async () => {
  if (gravador) { gravador.stop(); return; }
  let fluxo;
  try { fluxo = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast("Não consegui acessar o microfone."); return; }
  const partes = [];
  gravador = new MediaRecorder(fluxo);
  gravador.ondataavailable = (e) => partes.push(e.data);
  gravador.onstop = async () => {
    fluxo.getTracks().forEach((t) => t.stop());
    $("#sim-gravar").classList.remove("gravando");
    const blob = new Blob(partes, { type: gravador.mimeType || "audio/webm" });
    gravador = null;
    const base64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
    simular({ audioBase64: base64, mimetype: blob.type }, "🎤 áudio");
  };
  gravador.start();
  $("#sim-gravar").classList.add("gravando");
});

$("#sim-arquivo").addEventListener("change", async (e) => {
  const arquivo = e.target.files[0];
  e.target.value = "";
  if (!arquivo) return;
  if (arquivo.size > 10 * 1024 * 1024) { toast("Arquivo grande demais para o teste (máx. 10 MB)."); return; }
  const base64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.readAsDataURL(arquivo); });
  const legenda = $("#sim-texto").value.trim();
  $("#sim-texto").value = "";
  simular({ arquivoBase64: base64, mimetype: arquivo.type, nomeArquivo: arquivo.name, texto: legenda }, `📎 ${arquivo.name}${legenda ? `\n${legenda}` : ""}`);
});

// ---------- início ----------

function iniciar() {
  $("#login").hidden = true;
  $("#app").hidden = false;
  abrirAba(abaAtual);
}

// Atualiza a tela aberta a cada 30s para ninguém perder mensagem nova.
setInterval(() => {
  if ($("#app").hidden || document.hidden) return;
  if (abaAtual === "suporte") { carregarTickets(); if (ticketAberto && !$("#t-texto")?.value) abrirTicket(ticketAberto); }
  else if (abaAtual === "geral") carregarGeral();
  else atualizarBadge();
}, 30_000);

// Permite instalar o painel como aplicativo no celular.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

if (senha) api("/api/resumo").then(iniciar, () => {}); else mostrarLogin();
