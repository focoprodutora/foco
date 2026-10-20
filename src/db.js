import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { agoraLocal, carimbo, chaveTelefone, normalizarTelefone, semAcento, somarMinutos } from "./util.js";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS pessoas (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('mentorada', 'mentor')),
  nome TEXT NOT NULL,
  nome_busca TEXT NOT NULL,
  telefone TEXT,
  chave_tel TEXT,
  estado TEXT,
  cidade TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'pausada', 'finalizada')),
  mentor_id INTEGER REFERENCES pessoas(id),
  observacoes TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pessoas_tel ON pessoas(chave_tel);
CREATE INDEX IF NOT EXISTS pessoas_estado ON pessoas(estado);

CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY,
  pessoa_id INTEGER NOT NULL REFERENCES pessoas(id),
  mentor_id INTEGER REFERENCES pessoas(id),
  inicio TEXT NOT NULL,
  duracao_min INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'marcado' CHECK (status IN ('marcado', 'cancelado', 'realizado', 'faltou')),
  notas TEXT,
  lembrete_24h INTEGER NOT NULL DEFAULT 0,
  lembrete_1h INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agendamentos_inicio ON agendamentos(inicio);

CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY,
  titulo TEXT NOT NULL,
  estado TEXT NOT NULL,
  cidade TEXT NOT NULL,
  data TEXT NOT NULL,
  local TEXT,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  telefone TEXT NOT NULL,
  chave_tel TEXT NOT NULL,
  nome TEXT,
  pessoa_id INTEGER REFERENCES pessoas(id),
  categoria TEXT NOT NULL DEFAULT 'outro',
  prioridade TEXT NOT NULL DEFAULT 'media',
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_atendimento', 'resolvido')),
  resumo TEXT,
  responsavel TEXT,
  nao_lidas INTEGER NOT NULL DEFAULT 0,
  aguardando_equipe INTEGER NOT NULL DEFAULT 0,
  alertado INTEGER NOT NULL DEFAULT 0,
  ultima_msg_cliente TEXT,
  ultima_resposta_equipe TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tickets_tel ON tickets(chave_tel, status);

CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER REFERENCES tickets(id),
  telefone TEXT NOT NULL,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  autor TEXT,
  tipo TEXT NOT NULL DEFAULT 'texto',
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mensagens_ticket ON mensagens(ticket_id);

CREATE TABLE IF NOT EXISTS conversas (
  id INTEGER PRIMARY KEY,
  chave_tel TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('user', 'assistant')),
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS conversas_tel ON conversas(chave_tel);

CREATE TABLE IF NOT EXISTS tarefas (
  id INTEGER PRIMARY KEY,
  titulo TEXT NOT NULL,
  notas TEXT,
  quando TEXT,
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'feita', 'cancelada')),
  pessoa_id INTEGER REFERENCES pessoas(id),
  avisar_telefone TEXT,
  criado_por TEXT,
  lembrete_enviado INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  concluida_em TEXT
);
CREATE INDEX IF NOT EXISTS tarefas_quando ON tarefas(status, quando);

CREATE TABLE IF NOT EXISTS lancamentos (
  id INTEGER PRIMARY KEY,
  pessoa_id INTEGER NOT NULL REFERENCES pessoas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('cobranca', 'pagamento')),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  data TEXT NOT NULL,
  descricao TEXT,
  forma TEXT,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga', 'cancelada', 'recebido')),
  cobranca_id INTEGER REFERENCES lancamentos(id),
  arquivo_id INTEGER,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lancamentos_pessoa ON lancamentos(pessoa_id, tipo);

CREATE TABLE IF NOT EXISTS registros (
  id INTEGER PRIMARY KEY,
  pessoa_id INTEGER REFERENCES pessoas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('nota', 'arquivo')),
  titulo TEXT,
  texto TEXT,
  mimetype TEXT,
  nome_arquivo TEXT,
  caminho TEXT,
  tamanho INTEGER,
  origem_telefone TEXT,
  autor TEXT,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS registros_pessoa ON registros(pessoa_id);

CREATE TABLE IF NOT EXISTS kv (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
`;

const PRIORIDADE_ORDEM = `CASE prioridade WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END`;

export function abrirBanco(caminho) {
  if (caminho !== ":memory:") mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(ESQUEMA);
  return criarRepositorio(db);
}

function criarRepositorio(db) {
  const q = (sql) => db.prepare(sql);

  const repo = {
    db,

    // ---------- Pessoas (mentoradas e mentores) ----------

    criarPessoa({ tipo, nome, telefone, estado, cidade, mentor_id, observacoes }) {
      const agora = agoraLocal();
      const tel = normalizarTelefone(telefone);
      const r = q(`INSERT INTO pessoas (tipo, nome, nome_busca, telefone, chave_tel, estado, cidade, mentor_id, observacoes, criado_em, atualizado_em)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        tipo, nome.trim(), semAcento(nome), tel, chaveTelefone(tel), estado || null, cidade || null,
        mentor_id || null, observacoes || null, agora, agora,
      );
      return repo.pessoa(Number(r.lastInsertRowid));
    },

    atualizarPessoa(id, campos) {
      const atual = repo.pessoa(id);
      if (!atual) return null;
      const novo = { ...atual };
      for (const [k, v] of Object.entries(campos)) {
        if (v !== undefined && v !== null && v !== "") novo[k] = v;
      }
      const tel = normalizarTelefone(novo.telefone);
      q(`UPDATE pessoas SET tipo = ?, nome = ?, nome_busca = ?, telefone = ?, chave_tel = ?, estado = ?, cidade = ?, status = ?,
           mentor_id = ?, observacoes = ?, atualizado_em = ? WHERE id = ?`).run(
        novo.tipo, novo.nome, semAcento(novo.nome), tel, chaveTelefone(tel), novo.estado, novo.cidade, novo.status,
        novo.mentor_id, novo.observacoes, agoraLocal(), id,
      );
      return repo.pessoa(id);
    },

    pessoa(id) {
      return q(`SELECT p.*, m.nome AS mentor_nome FROM pessoas p LEFT JOIN pessoas m ON m.id = p.mentor_id WHERE p.id = ?`).get(id) || null;
    },

    pessoaPorTelefone(telefone) {
      const chave = chaveTelefone(telefone);
      if (!chave) return null;
      return q(`SELECT * FROM pessoas WHERE chave_tel = ? ORDER BY id LIMIT 1`).get(chave) || null;
    },

    buscarPessoas({ texto, tipo, estado, cidade, status, limite = 50 } = {}) {
      const onde = [];
      const args = [];
      if (texto) {
        const digitos = String(texto).replace(/\D/g, "");
        if (digitos.length >= 8) {
          onde.push("p.chave_tel LIKE ?");
          args.push(`%${digitos.slice(-8)}`);
        } else {
          onde.push("p.nome_busca LIKE ?");
          args.push(`%${semAcento(texto)}%`);
        }
      }
      if (tipo) { onde.push("p.tipo = ?"); args.push(tipo); }
      if (estado) { onde.push("p.estado = ?"); args.push(estado); }
      if (status) { onde.push("p.status = ?"); args.push(status); }
      const where = onde.length ? `WHERE ${onde.join(" AND ")}` : "";
      // Cidade é filtrada aqui para ignorar acentos ("Sao Paulo" = "São Paulo").
      const alvo = cidade ? semAcento(cidade) : null;
      return q(`SELECT p.*, m.nome AS mentor_nome FROM pessoas p LEFT JOIN pessoas m ON m.id = p.mentor_id
                ${where} ORDER BY p.nome_busca`).all(...args)
        .filter((p) => !alvo || semAcento(p.cidade).includes(alvo))
        .slice(0, limite)
        .map(({ nome_busca, chave_tel, ...resto }) => resto);
    },

    resumoPorEstado() {
      const linhas = q(`SELECT estado,
                          SUM(tipo = 'mentorada' AND status = 'ativa') AS mentoradas_ativas,
                          SUM(tipo = 'mentorada') AS mentoradas,
                          SUM(tipo = 'mentor') AS mentores
                        FROM pessoas GROUP BY estado`).all();
      const eventos = q(`SELECT estado, COUNT(*) AS eventos, MAX(data) AS ultimo_evento FROM eventos GROUP BY estado`).all();
      const porEstado = {};
      for (const l of linhas) {
        porEstado[l.estado || "sem_estado"] = {
          mentoradas: Number(l.mentoradas), mentoradas_ativas: Number(l.mentoradas_ativas), mentores: Number(l.mentores),
          eventos: 0, ultimo_evento: null,
        };
      }
      for (const e of eventos) {
        porEstado[e.estado] ??= { mentoradas: 0, mentoradas_ativas: 0, mentores: 0 };
        porEstado[e.estado].eventos = Number(e.eventos);
        porEstado[e.estado].ultimo_evento = e.ultimo_evento;
      }
      return porEstado;
    },

    // ---------- Agenda ----------

    criarAgendamento({ pessoa_id, mentor_id, inicio, duracao_min = 60, notas }) {
      const r = q(`INSERT INTO agendamentos (pessoa_id, mentor_id, inicio, duracao_min, notas, criado_em) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(pessoa_id, mentor_id || null, inicio, duracao_min || 60, notas || null, agoraLocal());
      return repo.agendamento(Number(r.lastInsertRowid));
    },

    agendamento(id) {
      return q(`SELECT a.*, p.nome AS pessoa_nome, p.telefone AS pessoa_telefone, p.cidade, p.estado, m.nome AS mentor_nome
                FROM agendamentos a JOIN pessoas p ON p.id = a.pessoa_id LEFT JOIN pessoas m ON m.id = a.mentor_id
                WHERE a.id = ?`).get(id) || null;
    },

    atualizarAgendamento(id, campos) {
      const atual = repo.agendamento(id);
      if (!atual) return null;
      const novo = { ...atual };
      for (const [k, v] of Object.entries(campos)) if (v !== undefined && v !== null) novo[k] = v;
      const remarcado = novo.inicio !== atual.inicio;
      q(`UPDATE agendamentos SET inicio = ?, duracao_min = ?, status = ?, notas = ?, mentor_id = ?,
           lembrete_24h = ?, lembrete_1h = ? WHERE id = ?`).run(
        novo.inicio, novo.duracao_min, novo.status, novo.notas, novo.mentor_id,
        remarcado ? 0 : novo.lembrete_24h, remarcado ? 0 : novo.lembrete_1h, id,
      );
      return repo.agendamento(id);
    },

    agenda({ de, ate, pessoa_id, incluirCancelados = false }) {
      const onde = ["a.inicio >= ?", "a.inicio < ?"];
      const args = [de, ate];
      if (pessoa_id) { onde.push("a.pessoa_id = ?"); args.push(pessoa_id); }
      if (!incluirCancelados) onde.push("a.status != 'cancelado'");
      return q(`SELECT a.*, p.nome AS pessoa_nome, p.telefone AS pessoa_telefone, p.cidade, p.estado, m.nome AS mentor_nome
                FROM agendamentos a JOIN pessoas p ON p.id = a.pessoa_id LEFT JOIN pessoas m ON m.id = a.mentor_id
                WHERE ${onde.join(" AND ")} ORDER BY a.inicio`).all(...args);
    },

    /** Agendamentos marcados que se sobrepõem ao intervalo (mesmo mentor, ou qualquer um se não houver mentor). */
    conflitos({ inicio, duracao_min = 60, mentor_id, ignorarId }) {
      const fim = somarMinutos(inicio, duracao_min);
      const candidatos = repo.agenda({ de: somarMinutos(inicio, -24 * 60), ate: fim })
        .filter((a) => a.status === "marcado" && a.id !== ignorarId)
        .filter((a) => (mentor_id ? a.mentor_id === mentor_id : true));
      return candidatos.filter((a) => somarMinutos(a.inicio, a.duracao_min) > inicio && a.inicio < fim);
    },

    marcarLembrete(id, campo) {
      if (!["lembrete_24h", "lembrete_1h"].includes(campo)) throw new Error("campo inválido");
      q(`UPDATE agendamentos SET ${campo} = 1 WHERE id = ?`).run(id);
    },

    // ---------- Eventos / palestras ----------

    criarEvento({ titulo, estado, cidade, data, local }) {
      const r = q(`INSERT INTO eventos (titulo, estado, cidade, data, local, criado_em) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(titulo, estado, cidade, data, local || null, agoraLocal());
      return q(`SELECT * FROM eventos WHERE id = ?`).get(Number(r.lastInsertRowid));
    },

    eventos({ estado } = {}) {
      return estado
        ? q(`SELECT * FROM eventos WHERE estado = ? ORDER BY data DESC`).all(estado)
        : q(`SELECT * FROM eventos ORDER BY data DESC`).all();
    },

    // ---------- Suporte ----------

    ticketAbertoPorTelefone(telefone) {
      return q(`SELECT * FROM tickets WHERE chave_tel = ? AND status != 'resolvido' ORDER BY id DESC LIMIT 1`)
        .get(chaveTelefone(telefone)) || null;
    },

    criarTicket({ telefone, nome, pessoa_id }) {
      const agora = carimbo();
      const tel = normalizarTelefone(telefone) || telefone;
      const r = q(`INSERT INTO tickets (telefone, chave_tel, nome, pessoa_id, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(tel, chaveTelefone(tel) || tel, nome || null, pessoa_id || null, agora, agora);
      return repo.ticket(Number(r.lastInsertRowid));
    },

    ticket(id) {
      return q(`SELECT t.*, p.cidade, p.estado, p.tipo AS pessoa_tipo FROM tickets t LEFT JOIN pessoas p ON p.id = t.pessoa_id WHERE t.id = ?`).get(id) || null;
    },

    atualizarTicket(id, campos) {
      const permitidos = ["categoria", "prioridade", "status", "resumo", "responsavel", "nome", "pessoa_id", "nao_lidas", "alertado"];
      const sets = [];
      const args = [];
      for (const k of permitidos) {
        if (campos[k] !== undefined) { sets.push(`${k} = ?`); args.push(campos[k]); }
      }
      if (!sets.length) return repo.ticket(id);
      sets.push("atualizado_em = ?");
      args.push(carimbo(), id);
      q(`UPDATE tickets SET ${sets.join(", ")} WHERE id = ?`).run(...args);
      return repo.ticket(id);
    },

    tickets({ status, limite = 100 } = {}) {
      const onde = status === "abertos" ? "WHERE t.status != 'resolvido'" : status ? "WHERE t.status = ?" : "";
      const args = status && status !== "abertos" ? [status] : [];
      return q(`SELECT t.*, p.cidade, p.estado FROM tickets t LEFT JOIN pessoas p ON p.id = t.pessoa_id ${onde}
                ORDER BY t.status = 'resolvido', ${PRIORIDADE_ORDEM.replaceAll("prioridade", "t.prioridade")}, t.ultima_msg_cliente
                LIMIT ?`).all(...args, limite);
    },

    contagemTickets() {
      const linhas = q(`SELECT status, COUNT(*) AS n FROM tickets GROUP BY status`).all();
      const r = { aberto: 0, em_atendimento: 0, resolvido: 0 };
      for (const l of linhas) r[l.status] = Number(l.n);
      return r;
    },

    /** Tickets em que a última mensagem da pessoa (até `desdeLocal`) ainda não teve resposta da equipe. */
    ticketsSemResposta(desdeLocal) {
      if (desdeLocal.length === 16) desdeLocal += ":59.999"; // inclui o minuto inteiro
      return q(`SELECT * FROM tickets WHERE status != 'resolvido' AND aguardando_equipe = 1 AND ultima_msg_cliente <= ?
                ORDER BY ultima_msg_cliente`).all(desdeLocal);
    },

    registrarMensagem({ ticket_id, telefone, direcao, autor, tipo = "texto", texto }) {
      const agora = carimbo();
      q(`INSERT INTO mensagens (ticket_id, telefone, direcao, autor, tipo, texto, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(ticket_id || null, telefone, direcao, autor || null, tipo, texto, agora);
      if (ticket_id && direcao === "entrada") {
        q(`UPDATE tickets SET ultima_msg_cliente = ?, nao_lidas = nao_lidas + 1, aguardando_equipe = 1, alertado = 0, atualizado_em = ? WHERE id = ?`).run(agora, agora, ticket_id);
      } else if (ticket_id && direcao === "saida" && autor !== "secretaria") {
        q(`UPDATE tickets SET ultima_resposta_equipe = ?, nao_lidas = 0, aguardando_equipe = 0, atualizado_em = ? WHERE id = ?`).run(agora, agora, ticket_id);
      }
    },

    mensagensDoTicket(ticket_id) {
      return q(`SELECT * FROM mensagens WHERE ticket_id = ? ORDER BY id`).all(ticket_id);
    },

    // ---------- Memória curta da conversa com a equipe ----------

    salvarConversa(telefone, papel, texto) {
      q(`INSERT INTO conversas (chave_tel, papel, texto, criado_em) VALUES (?, ?, ?, ?)`).run(chaveTelefone(telefone) || telefone, papel, texto, agoraLocal());
    },

    historicoConversa(telefone, desdeLocal, limite = 12) {
      return q(`SELECT papel, texto FROM (SELECT * FROM conversas WHERE chave_tel = ? AND criado_em >= ? ORDER BY id DESC LIMIT ?) ORDER BY id`)
        .all(chaveTelefone(telefone) || telefone, desdeLocal, limite);
    },

    // ---------- Tarefas e lembretes da equipe ----------

    criarTarefa({ titulo, notas, quando, prioridade = "media", pessoa_id, avisar_telefone, criado_por }) {
      const r = q(`INSERT INTO tarefas (titulo, notas, quando, prioridade, pessoa_id, avisar_telefone, criado_por, criado_em)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        titulo, notas || null, quando || null, prioridade || "media", pessoa_id || null, avisar_telefone || null, criado_por || null, agoraLocal(),
      );
      return repo.tarefa(Number(r.lastInsertRowid));
    },

    tarefa(id) {
      return q(`SELECT t.*, p.nome AS pessoa_nome FROM tarefas t LEFT JOIN pessoas p ON p.id = t.pessoa_id WHERE t.id = ?`).get(id) || null;
    },

    atualizarTarefa(id, campos) {
      const atual = repo.tarefa(id);
      if (!atual) return null;
      const novo = { ...atual };
      for (const [k, v] of Object.entries(campos)) if (v !== undefined && v !== null) novo[k] = v;
      const reagendada = novo.quando !== atual.quando;
      q(`UPDATE tarefas SET titulo = ?, notas = ?, quando = ?, prioridade = ?, status = ?, lembrete_enviado = ?, concluida_em = ? WHERE id = ?`).run(
        novo.titulo, novo.notas, novo.quando, novo.prioridade, novo.status, reagendada ? 0 : novo.lembrete_enviado,
        novo.status === "feita" ? atual.concluida_em || agoraLocal() : null, id,
      );
      return repo.tarefa(id);
    },

    /** Pendentes primeiro por data (sem data no fim); `ate` limita às que vencem até essa data/hora. */
    tarefas({ status = "pendente", ate, pessoa_id } = {}) {
      const onde = [];
      const args = [];
      if (status !== "todas") { onde.push("t.status = ?"); args.push(status); }
      if (ate) { onde.push("t.quando IS NOT NULL AND t.quando < ?"); args.push(ate); }
      if (pessoa_id) { onde.push("t.pessoa_id = ?"); args.push(pessoa_id); }
      const where = onde.length ? `WHERE ${onde.join(" AND ")}` : "";
      return q(`SELECT t.*, p.nome AS pessoa_nome FROM tarefas t LEFT JOIN pessoas p ON p.id = t.pessoa_id ${where}
                ORDER BY t.quando IS NULL, t.quando, CASE t.prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, t.id
                LIMIT 200`).all(...args);
    },

    lembretesDeTarefaVencidos(agora) {
      return q(`SELECT t.*, p.nome AS pessoa_nome FROM tarefas t LEFT JOIN pessoas p ON p.id = t.pessoa_id
                WHERE t.status = 'pendente' AND t.lembrete_enviado = 0 AND t.quando IS NOT NULL AND t.quando <= ?`).all(agora);
    },

    marcarLembreteTarefa(id) {
      q(`UPDATE tarefas SET lembrete_enviado = 1 WHERE id = ?`).run(id);
    },

    // ---------- Financeiro ----------

    criarLancamento({ pessoa_id, tipo, valor_centavos, data, descricao, forma, cobranca_id, arquivo_id }) {
      const r = q(`INSERT INTO lancamentos (pessoa_id, tipo, valor_centavos, data, descricao, forma, status, cobranca_id, arquivo_id, criado_em)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        pessoa_id, tipo, valor_centavos, data, descricao || null, forma || null, tipo === "cobranca" ? "aberta" : "recebido",
        cobranca_id || null, arquivo_id || null, agoraLocal(),
      );
      if (tipo === "pagamento" && cobranca_id) q(`UPDATE lancamentos SET status = 'paga' WHERE id = ? AND tipo = 'cobranca'`).run(cobranca_id);
      return repo.lancamento(Number(r.lastInsertRowid));
    },

    lancamento(id) {
      return q(`SELECT l.*, p.nome AS pessoa_nome, p.telefone AS pessoa_telefone FROM lancamentos l JOIN pessoas p ON p.id = l.pessoa_id WHERE l.id = ?`).get(id) || null;
    },

    atualizarLancamento(id, { status, data, valor_centavos, descricao }) {
      const atual = repo.lancamento(id);
      if (!atual) return null;
      q(`UPDATE lancamentos SET status = ?, data = ?, valor_centavos = ?, descricao = ? WHERE id = ?`).run(
        status ?? atual.status, data ?? atual.data, valor_centavos ?? atual.valor_centavos, descricao ?? atual.descricao, id,
      );
      return repo.lancamento(id);
    },

    /**
     * situacao: "atrasadas" (cobranças abertas vencidas antes de `hoje`), "abertas", "pagamentos" ou "tudo".
     * de/ate filtram pela data (AAAA-MM-DD, `ate` inclusive).
     */
    lancamentos({ pessoa_id, situacao = "tudo", hoje, de, ate } = {}) {
      const onde = [];
      const args = [];
      if (pessoa_id) { onde.push("l.pessoa_id = ?"); args.push(pessoa_id); }
      if (situacao === "atrasadas") { onde.push("l.tipo = 'cobranca' AND l.status = 'aberta' AND l.data < ?"); args.push(hoje); }
      if (situacao === "abertas") onde.push("l.tipo = 'cobranca' AND l.status = 'aberta'");
      if (situacao === "pagamentos") onde.push("l.tipo = 'pagamento'");
      if (de) { onde.push("l.data >= ?"); args.push(de); }
      if (ate) { onde.push("l.data <= ?"); args.push(ate); }
      const where = onde.length ? `WHERE ${onde.join(" AND ")}` : "";
      return q(`SELECT l.*, p.nome AS pessoa_nome, p.telefone AS pessoa_telefone, p.cidade, p.estado
                FROM lancamentos l JOIN pessoas p ON p.id = l.pessoa_id ${where} ORDER BY l.data, l.id LIMIT 500`).all(...args);
    },

    // ---------- Anotações e arquivos ----------

    criarRegistro({ pessoa_id, tipo, titulo, texto, mimetype, nome_arquivo, caminho, tamanho, origem_telefone, autor }) {
      const r = q(`INSERT INTO registros (pessoa_id, tipo, titulo, texto, mimetype, nome_arquivo, caminho, tamanho, origem_telefone, autor, criado_em)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        pessoa_id || null, tipo, titulo || null, texto || null, mimetype || null, nome_arquivo || null, caminho || null,
        tamanho || null, origem_telefone || null, autor || null, agoraLocal(),
      );
      return repo.registro(Number(r.lastInsertRowid));
    },

    registro(id) {
      return q(`SELECT r.*, p.nome AS pessoa_nome FROM registros r LEFT JOIN pessoas p ON p.id = r.pessoa_id WHERE r.id = ?`).get(id) || null;
    },

    atualizarRegistro(id, { pessoa_id, titulo, texto }) {
      const atual = repo.registro(id);
      if (!atual) return null;
      q(`UPDATE registros SET pessoa_id = ?, titulo = ?, texto = ? WHERE id = ?`).run(pessoa_id ?? atual.pessoa_id, titulo ?? atual.titulo, texto ?? atual.texto, id);
      return repo.registro(id);
    },

    registros({ pessoa_id, tipo, texto, limite = 50 } = {}) {
      const onde = [];
      const args = [];
      if (pessoa_id) { onde.push("r.pessoa_id = ?"); args.push(pessoa_id); }
      if (tipo) { onde.push("r.tipo = ?"); args.push(tipo); }
      const where = onde.length ? `WHERE ${onde.join(" AND ")}` : "";
      const alvo = texto ? semAcento(texto) : null;
      return q(`SELECT r.*, p.nome AS pessoa_nome FROM registros r LEFT JOIN pessoas p ON p.id = r.pessoa_id ${where} ORDER BY r.id DESC`).all(...args)
        .filter((r) => !alvo || semAcento(`${r.titulo} ${r.texto} ${r.nome_arquivo}`).includes(alvo))
        .slice(0, limite);
    },

    // ---------- Chave/valor ----------

    lerKv(chave) {
      return q(`SELECT valor FROM kv WHERE chave = ?`).get(chave)?.valor ?? null;
    },

    gravarKv(chave, valor) {
      q(`INSERT INTO kv (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`).run(chave, valor);
    },
  };

  return repo;
}
