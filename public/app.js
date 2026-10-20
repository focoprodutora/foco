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
  ({ geral: carregarGeral, suporte: carregarTickets, pessoas: carregarPessoas, agenda: carregarAgenda, palestras: carregarPalestras })[aba]?.();
}

// ---------- visão geral ----------

async function carregarGeral() {
  const r = await api("/api/resumo");
  const est = r.estados;
  const total = (campo) => Object.values(est).reduce((s, e) => s + (e[campo] || 0), 0);
  const estadosAtivos = Object.keys(est).filter((uf) => ESTADOS[uf] && (est[uf].mentoradas || est[uf].mentores || est[uf].eventos)).length;

  const avisos = [];
  if (!r.integracoes.whatsapp) avisos.push("WhatsApp ainda não conectado. Use a aba <b>Testar</b> enquanto isso.");
  if (!r.integracoes.transcricao) avisos.push("Transcrição de áudio não configurada (TRANSCRICAO_CHAVE).");
  if (!r.integracoes.claude) avisos.push("Chave da IA não configurada (ANTHROPIC_API_KEY).");
  if (!r.integracoes.equipe) avisos.push("Nenhum número da equipe cadastrado (NUMEROS_EQUIPE): tudo vai para o suporte.");
  $("#avisos").innerHTML = avisos.map((a) => `<div class="aviso">${a}</div>`).join("");

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
    <div class="acoes"><button value="cancelar" class="secundario" formnovalidate>Cancelar</button><button value="salvar">Salvar</button></div>`;
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

if (senha) api("/api/resumo").then(iniciar, () => {}); else mostrarLogin();
