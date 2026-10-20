// Servidor HTTP: webhook do WhatsApp, API do painel e arquivos do painel.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { UFS, agoraLocal, carimbo, normalizarData, normalizarDataHora, normalizarTelefone, somarMinutos } from "./util.js";
import { lerWebhookEvolution } from "./whatsapp.js";

const PASTA_PUBLICA = "public";
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
const LIMITE_CORPO = 20 * 1024 * 1024;

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

function iguais(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

async function lerJson(req) {
  let tamanho = 0;
  const partes = [];
  for await (const parte of req) {
    tamanho += parte.length;
    if (tamanho > LIMITE_CORPO) throw new ErroHttp(413, "Corpo grande demais");
    partes.push(parte);
  }
  if (!partes.length) return {};
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8"));
  } catch {
    throw new ErroHttp(400, "JSON inválido");
  }
}

function responder(res, status, dados) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(dados));
}

function exigir(condicao, mensagem) {
  if (!condicao) throw new ErroHttp(400, mensagem);
}

function validarPessoa(corpo, parcial = false) {
  if (!parcial || corpo.tipo !== undefined) exigir(["mentorada", "mentor"].includes(corpo.tipo), "tipo deve ser mentorada ou mentor");
  if (!parcial || corpo.nome !== undefined) exigir(String(corpo.nome || "").trim(), "nome é obrigatório");
  if (corpo.estado) exigir(UFS.includes(corpo.estado), "estado inválido");
  if (corpo.status) exigir(["ativa", "pausada", "finalizada"].includes(corpo.status), "status inválido");
  if (corpo.telefone) exigir(normalizarTelefone(corpo.telefone), "telefone inválido (use DDD + número)");
}

export function criarApp({ repo, secretaria, whatsapp, config }) {
  const rotas = [];
  const rota = (metodo, padrao, fn) => rotas.push({ metodo, padrao: new RegExp(`^${padrao}$`), fn });

  // ---------- WhatsApp ----------

  rota("POST", "/webhook/evolution", async ({ corpo, url }) => {
    if (!config.tokenWebhook || !iguais(url.searchParams.get("token") || "", config.tokenWebhook)) throw new ErroHttp(401, "token inválido");
    const msg = lerWebhookEvolution(corpo);
    if (msg) secretaria.receber(msg).catch((e) => console.error("[mensagem]", e));
    return { ok: true };
  });

  // ---------- Conexão do WhatsApp ----------

  rota("GET", "/api/whatsapp", async () => {
    if (!whatsapp?.configurado) return { configurado: false };
    try {
      return { configurado: true, estado: await whatsapp.estado(), instancia: config.evolution.instancia };
    } catch (e) {
      return { configurado: true, estado: "erro", erro: `Não consegui falar com a Evolution API: ${e.message}` };
    }
  });

  rota("POST", "/api/whatsapp/conectar", async ({ corpo }) => {
    if (!whatsapp?.configurado) throw new ErroHttp(400, "Preencha EVOLUTION_URL, EVOLUTION_CHAVE e EVOLUTION_INSTANCIA antes de conectar.");
    if (!config.urlPublica) throw new ErroHttp(400, "Preencha URL_PUBLICA com o endereço desta aplicação antes de conectar.");
    if (!config.tokenWebhook) throw new ErroHttp(400, "Preencha WEBHOOK_TOKEN antes de conectar.");
    const numero = corpo.telefone ? normalizarTelefone(corpo.telefone) : null;
    if (corpo.telefone) exigir(numero, "telefone inválido (use DDD + número)");
    const urlWebhook = `${config.urlPublica}/webhook/evolution?token=${encodeURIComponent(config.tokenWebhook)}`;
    try {
      return await whatsapp.conectar({ urlWebhook, numero });
    } catch (e) {
      throw new ErroHttp(502, `A Evolution API recusou o pedido: ${e.message}`);
    }
  });

  // ---------- Painel ----------

  rota("GET", "/api/resumo", () => {
    const hoje = agoraLocal().slice(0, 10);
    return {
      estados: repo.resumoPorEstado(),
      tickets: repo.contagemTickets(),
      sem_resposta: repo.ticketsSemResposta(carimbo()).length,
      hoje: repo.agenda({ de: `${hoje}T00:00`, ate: somarMinutos(`${hoje}T00:00`, 24 * 60) }),
      integracoes: {
        whatsapp: secretaria.whatsappConfigurado,
        transcricao: Boolean(config.transcricao.chave),
        claude: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
        equipe: config.numerosEquipe.length,
      },
    };
  });

  rota("GET", "/api/pessoas", ({ url }) => {
    const p = Object.fromEntries(url.searchParams);
    return repo.buscarPessoas({ texto: p.q, tipo: p.tipo, estado: p.estado, cidade: p.cidade, status: p.status, limite: 500 });
  });

  rota("POST", "/api/pessoas", ({ corpo }) => {
    validarPessoa(corpo);
    if (corpo.telefone && repo.pessoaPorTelefone(corpo.telefone)) throw new ErroHttp(409, "Já existe uma pessoa com esse telefone");
    return repo.criarPessoa(corpo);
  });

  rota("PATCH", "/api/pessoas/(\\d+)", ({ corpo, params }) => {
    validarPessoa(corpo, true);
    return repo.atualizarPessoa(Number(params[0]), corpo) || Promise.reject(new ErroHttp(404, "não encontrada"));
  });

  rota("GET", "/api/agenda", ({ url }) => {
    const de = normalizarData(url.searchParams.get("de")) || agoraLocal().slice(0, 10);
    const ate = normalizarData(url.searchParams.get("ate")) || somarMinutos(`${de}T00:00`, 13 * 24 * 60).slice(0, 10);
    return repo.agenda({ de: `${de}T00:00`, ate: somarMinutos(`${ate}T00:00`, 24 * 60), incluirCancelados: true });
  });

  rota("POST", "/api/agenda", ({ corpo }) => {
    const inicio = normalizarDataHora(corpo.inicio);
    exigir(inicio, "inicio inválido (AAAA-MM-DDTHH:MM)");
    exigir(repo.pessoa(Number(corpo.pessoa_id)), "pessoa não encontrada");
    return repo.criarAgendamento({ ...corpo, pessoa_id: Number(corpo.pessoa_id), inicio });
  });

  rota("PATCH", "/api/agenda/(\\d+)", ({ corpo, params }) => {
    const inicio = corpo.inicio ? normalizarDataHora(corpo.inicio) : undefined;
    if (corpo.inicio) exigir(inicio, "inicio inválido");
    if (corpo.status) exigir(["marcado", "cancelado", "realizado", "faltou"].includes(corpo.status), "status inválido");
    return repo.atualizarAgendamento(Number(params[0]), { inicio, status: corpo.status, notas: corpo.notas }) || Promise.reject(new ErroHttp(404, "não encontrado"));
  });

  rota("GET", "/api/eventos", ({ url }) => repo.eventos({ estado: url.searchParams.get("estado") || undefined }));

  rota("POST", "/api/eventos", ({ corpo }) => {
    exigir(String(corpo.titulo || "").trim(), "título é obrigatório");
    exigir(UFS.includes(corpo.estado), "estado inválido");
    exigir(String(corpo.cidade || "").trim(), "cidade é obrigatória");
    const data = normalizarData(corpo.data);
    exigir(data, "data inválida");
    return repo.criarEvento({ ...corpo, data });
  });

  rota("GET", "/api/tickets", ({ url }) => repo.tickets({ status: url.searchParams.get("status") || "abertos", limite: 300 }));

  rota("GET", "/api/tickets/(\\d+)", ({ params }) => {
    const ticket = repo.ticket(Number(params[0]));
    if (!ticket) throw new ErroHttp(404, "não encontrado");
    if (ticket.nao_lidas) repo.atualizarTicket(ticket.id, { nao_lidas: 0 });
    return { ticket, mensagens: repo.mensagensDoTicket(ticket.id) };
  });

  rota("PATCH", "/api/tickets/(\\d+)", ({ corpo, params }) => {
    if (corpo.status) exigir(["aberto", "em_atendimento", "resolvido"].includes(corpo.status), "status inválido");
    if (corpo.prioridade) exigir(["baixa", "media", "alta", "urgente"].includes(corpo.prioridade), "prioridade inválida");
    const { status, prioridade, responsavel } = corpo;
    return repo.atualizarTicket(Number(params[0]), { status, prioridade, responsavel });
  });

  rota("POST", "/api/tickets/(\\d+)/responder", async ({ corpo, params }) => {
    const ticket = repo.ticket(Number(params[0]));
    if (!ticket) throw new ErroHttp(404, "não encontrado");
    const texto = String(corpo.texto || "").trim();
    exigir(texto, "escreva a resposta");
    const autor = String(corpo.autor || "Equipe").slice(0, 60);
    await secretaria.enviarWhatsapp(ticket.telefone, texto, { ticket_id: ticket.id, autor });
    return repo.atualizarTicket(ticket.id, { status: corpo.resolver ? "resolvido" : "em_atendimento", responsavel: ticket.responsavel || autor });
  });

  // Testar sem WhatsApp: as respostas voltam para o painel em vez de irem para o celular.
  rota("POST", "/api/simular", async ({ corpo }) => {
    const telefone = normalizarTelefone(corpo.telefone);
    exigir(telefone, "telefone inválido");
    exigir(corpo.texto || corpo.audioBase64, "mande um texto ou um áudio");
    const respostas = [];
    const enviar = secretaria.criarEnvio(async (para, texto) => respostas.push({ para, texto }));
    const msg = corpo.audioBase64
      ? { telefone, nome: corpo.nome, tipo: "audio", audioBase64: corpo.audioBase64, mimetype: corpo.mimetype || "audio/webm" }
      : { telefone, nome: corpo.nome, tipo: "texto", texto: String(corpo.texto) };
    await secretaria.receber(msg, { enviar, comoEquipe: corpo.como === "equipe", semEspera: true });
    return { respostas };
  });

  async function servirArquivo(caminho, res) {
    const relativo = normalize(caminho === "/" ? "/index.html" : caminho).replace(/^(\.\.[/\\])+/, "");
    try {
      const conteudo = await readFile(join(PASTA_PUBLICA, relativo));
      res.writeHead(200, { "Content-Type": TIPOS[extname(relativo)] || "application/octet-stream" });
      res.end(conteudo);
    } catch {
      responder(res, 404, { erro: "não encontrado" });
    }
  }

  async function tratar(req, res) {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/saude") return responder(res, 200, { ok: true });
      if (req.method === "GET" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/webhook/")) {
        return await servirArquivo(url.pathname, res);
      }
      const encontrada = rotas.find((r) => r.metodo === req.method && r.padrao.test(url.pathname));
      if (!encontrada) throw new ErroHttp(404, "rota não encontrada");

      if (url.pathname.startsWith("/api/")) {
        if (!config.senhaPainel) throw new ErroHttp(503, "Defina PAINEL_SENHA no .env para usar o painel");
        if (!iguais(req.headers["x-painel-senha"] || "", config.senhaPainel)) throw new ErroHttp(401, "senha incorreta");
      }

      const corpo = req.method === "GET" ? {} : await lerJson(req);
      const params = encontrada.padrao.exec(url.pathname).slice(1);
      responder(res, 200, await encontrada.fn({ corpo, url, params }));
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(`[${req.method} ${url.pathname}]`, e);
      responder(res, status, { erro: status === 500 ? `Erro interno: ${e.message}` : e.message });
    }
  }

  return createServer(tratar);
}
