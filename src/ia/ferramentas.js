// Ferramentas que a secretária (Claude) pode usar para mexer no cadastro, na agenda e no suporte.
import {
  UFS, agoraLocal, dataHumana, normalizarData, normalizarDataHora, normalizarTelefone, somarMinutos, telefoneHumano,
} from "../util.js";

const nulo = (schema) => ({ anyOf: [schema, { type: "null" }] });
const texto = (descricao) => ({ type: "string", description: descricao });
const uf = { type: "string", enum: UFS, description: "Sigla do estado (ex.: MG, SP, PE)." };
const objeto = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const DEFINICOES = [
  {
    name: "cadastrar_pessoa",
    description:
      "Cadastra uma mentorada ou um mentor. Use null para o que a pessoa da equipe não informou. " +
      "Antes de cadastrar, confira com buscar_pessoas se ela já existe.",
    input_schema: objeto({
      tipo: { type: "string", enum: ["mentorada", "mentor"] },
      nome: texto("Nome completo, com iniciais maiúsculas."),
      telefone: nulo(texto("Telefone com DDD, só dígitos.")),
      estado: nulo(uf),
      cidade: nulo(texto("Nome da cidade, com acentos.")),
      mentor_nome: nulo(texto("Nome do mentor responsável (só para mentoradas).")),
      observacoes: nulo(texto("Qualquer observação útil dita no áudio.")),
    }),
  },
  {
    name: "atualizar_pessoa",
    description: "Altera dados de uma pessoa já cadastrada. Use null nos campos que não mudam.",
    input_schema: objeto({
      pessoa_id: { type: "integer" },
      nome: nulo({ type: "string" }),
      telefone: nulo({ type: "string" }),
      estado: nulo(uf),
      cidade: nulo({ type: "string" }),
      status: nulo({ type: "string", enum: ["ativa", "pausada", "finalizada"] }),
      mentor_nome: nulo({ type: "string" }),
      observacoes: nulo(texto("Substitui as observações atuais.")),
    }),
  },
  {
    name: "buscar_pessoas",
    description: "Procura mentoradas e mentores por nome ou telefone, e/ou filtra por tipo, estado, cidade e status.",
    input_schema: objeto({
      texto: nulo(texto("Parte do nome ou do telefone.")),
      tipo: nulo({ type: "string", enum: ["mentorada", "mentor"] }),
      estado: nulo(uf),
      cidade: nulo({ type: "string" }),
      status: nulo({ type: "string", enum: ["ativa", "pausada", "finalizada"] }),
    }),
  },
  {
    name: "resumo_por_estado",
    description: "Quantas mentoradas (total e ativas), mentores e palestras existem em cada estado.",
    input_schema: objeto({}),
  },
  {
    name: "agendar",
    description:
      "Marca uma sessão para uma pessoa cadastrada. Se houver conflito de horário, a ferramenta avisa e não marca; " +
      "pergunte à equipe e só repita com forcar=true se ela confirmar.",
    input_schema: objeto({
      pessoa_id: { type: "integer" },
      inicio: texto("Data e hora no horário de Brasília, formato AAAA-MM-DDTHH:MM."),
      duracao_min: nulo({ type: "integer", description: "Duração em minutos (padrão 60)." }),
      mentor_nome: nulo(texto("Quem vai atender, se não for o mentor da mentorada.")),
      notas: nulo({ type: "string" }),
      forcar: { type: "boolean", description: "true só quando a equipe confirmou marcar mesmo com conflito." },
    }),
  },
  {
    name: "listar_agenda",
    description: "Lista as sessões entre duas datas (inclusive), opcionalmente de uma pessoa.",
    input_schema: objeto({
      de: texto("Data inicial AAAA-MM-DD."),
      ate: texto("Data final AAAA-MM-DD."),
      pessoa_id: nulo({ type: "integer" }),
    }),
  },
  {
    name: "alterar_agendamento",
    description: "Remarca, cancela ou registra o resultado de uma sessão (realizada ou falta). Também adiciona notas da sessão.",
    input_schema: objeto({
      agendamento_id: { type: "integer" },
      novo_inicio: nulo(texto("Nova data e hora AAAA-MM-DDTHH:MM, se for remarcar.")),
      status: nulo({ type: "string", enum: ["marcado", "cancelado", "realizado", "faltou"] }),
      notas: nulo(texto("Resumo do que foi conversado ou motivo da mudança.")),
    }),
  },
  {
    name: "registrar_palestra",
    description: "Registra uma palestra ou evento num estado e cidade.",
    input_schema: objeto({
      titulo: { type: "string" },
      estado: uf,
      cidade: { type: "string" },
      data: texto("AAAA-MM-DD"),
      local: nulo(texto("Local do evento.")),
    }),
  },
  {
    name: "listar_palestras",
    description: "Lista palestras e eventos já registrados, opcionalmente de um estado.",
    input_schema: objeto({ estado: nulo(uf) }),
  },
  {
    name: "listar_suporte",
    description: "Lista os atendimentos do suporte. 'abertos' traz tudo o que ainda não foi resolvido.",
    input_schema: objeto({
      status: { type: "string", enum: ["abertos", "aberto", "em_atendimento", "resolvido"] },
    }),
  },
  {
    name: "responder_suporte",
    description:
      "Envia uma resposta no WhatsApp para a pessoa de um atendimento do suporte, em nome da equipe. " +
      "Só use quando a equipe pediu para responder e disse o que responder.",
    input_schema: objeto({
      ticket_id: { type: "integer" },
      mensagem: texto("Texto exato que a pessoa vai receber."),
      resolver: { type: "boolean", description: "true para encerrar o atendimento depois de responder." },
    }),
  },
  {
    name: "enviar_mensagem",
    description:
      "Envia uma mensagem de WhatsApp para uma pessoa cadastrada (ex.: confirmação de sessão). " +
      "Só use quando a equipe pediu explicitamente para mandar.",
    input_schema: objeto({
      pessoa_id: { type: "integer" },
      mensagem: texto("Texto exato que a pessoa vai receber."),
    }),
  },
].map((d) => ({ ...d, strict: true }));

function pessoaResumida(p) {
  if (!p) return null;
  return {
    id: p.id, tipo: p.tipo, nome: p.nome, telefone: p.telefone ? telefoneHumano(p.telefone) : null,
    estado: p.estado, cidade: p.cidade, status: p.status, mentor: p.mentor_nome || null, observacoes: p.observacoes,
  };
}

function agendamentoResumido(a) {
  return {
    id: a.id, pessoa_id: a.pessoa_id, pessoa: a.pessoa_nome, quando: dataHumana(a.inicio), inicio: a.inicio,
    duracao_min: a.duracao_min, mentor: a.mentor_nome || null, status: a.status, notas: a.notas,
    cidade: a.cidade, estado: a.estado,
  };
}

class ErroFerramenta extends Error {}

function resolverMentor(repo, nome) {
  if (!nome) return null;
  const achados = repo.buscarPessoas({ texto: nome, tipo: "mentor" });
  if (achados.length === 0) throw new ErroFerramenta(`Nenhum mentor chamado "${nome}" está cadastrado. Cadastre o mentor antes ou confirme o nome.`);
  if (achados.length > 1) throw new ErroFerramenta(`Mais de um mentor parecido com "${nome}": ${achados.map((m) => m.nome).join(", ")}. Pergunte qual.`);
  return achados[0];
}

function exigirPessoa(repo, id) {
  const p = repo.pessoa(id);
  if (!p) throw new ErroFerramenta(`Pessoa ${id} não encontrada.`);
  return p;
}

const EXECUTORES = {
  cadastrar_pessoa(repo, e) {
    const telefone = e.telefone ? normalizarTelefone(e.telefone) : null;
    if (e.telefone && !telefone) throw new ErroFerramenta(`Telefone "${e.telefone}" parece incompleto. Peça o número com DDD.`);
    if (telefone) {
      const existente = repo.pessoaPorTelefone(telefone);
      if (existente) return { ja_existia: true, pessoa: pessoaResumida(repo.pessoa(existente.id)) };
    }
    const mentor = e.tipo === "mentorada" ? resolverMentor(repo, e.mentor_nome) : null;
    const pessoa = repo.criarPessoa({ ...e, telefone, mentor_id: mentor?.id });
    const faltando = ["telefone", "estado", "cidade"].filter((c) => !pessoa[c]);
    return { cadastrada: pessoaResumida(pessoa), faltando };
  },

  atualizar_pessoa(repo, e) {
    exigirPessoa(repo, e.pessoa_id);
    const telefone = e.telefone ? normalizarTelefone(e.telefone) : null;
    if (e.telefone && !telefone) throw new ErroFerramenta(`Telefone "${e.telefone}" parece incompleto.`);
    const mentor = resolverMentor(repo, e.mentor_nome);
    const { pessoa_id, mentor_nome, ...campos } = e;
    return { atualizada: pessoaResumida(repo.atualizarPessoa(pessoa_id, { ...campos, telefone, mentor_id: mentor?.id })) };
  },

  buscar_pessoas(repo, e) {
    const achados = repo.buscarPessoas(e);
    return { total: achados.length, pessoas: achados.map(pessoaResumida) };
  },

  resumo_por_estado(repo) {
    return repo.resumoPorEstado();
  },

  agendar(repo, e) {
    const pessoa = exigirPessoa(repo, e.pessoa_id);
    const inicio = normalizarDataHora(e.inicio);
    if (!inicio) throw new ErroFerramenta(`Data/hora inválida: "${e.inicio}". Use AAAA-MM-DDTHH:MM.`);
    if (inicio < agoraLocal()) throw new ErroFerramenta(`${dataHumana(inicio)} já passou. Confirme a data com a equipe.`);
    const mentor = resolverMentor(repo, e.mentor_nome) || (pessoa.mentor_id ? repo.pessoa(pessoa.mentor_id) : null);
    const duracao = e.duracao_min || 60;
    const conflitos = repo.conflitos({ inicio, duracao_min: duracao, mentor_id: mentor?.id });
    if (conflitos.length && !e.forcar) {
      return { marcado: false, conflito_com: conflitos.map(agendamentoResumido), aviso: "Horário ocupado. Pergunte se quer marcar mesmo assim ou outro horário." };
    }
    const a = repo.criarAgendamento({ pessoa_id: pessoa.id, mentor_id: mentor?.id, inicio, duracao_min: duracao, notas: e.notas });
    return { marcado: true, agendamento: agendamentoResumido(a), telefone_cadastrado: Boolean(pessoa.telefone) };
  },

  listar_agenda(repo, e) {
    const de = normalizarData(e.de);
    const ate = normalizarData(e.ate);
    if (!de || !ate) throw new ErroFerramenta("Datas inválidas. Use AAAA-MM-DD.");
    const fim = somarMinutos(`${ate}T00:00`, 24 * 60);
    const itens = repo.agenda({ de: `${de}T00:00`, ate: fim, pessoa_id: e.pessoa_id });
    return { total: itens.length, sessoes: itens.map(agendamentoResumido) };
  },

  alterar_agendamento(repo, e) {
    const atual = repo.agendamento(e.agendamento_id);
    if (!atual) throw new ErroFerramenta(`Agendamento ${e.agendamento_id} não encontrado.`);
    let inicio;
    if (e.novo_inicio) {
      inicio = normalizarDataHora(e.novo_inicio);
      if (!inicio) throw new ErroFerramenta(`Data/hora inválida: "${e.novo_inicio}".`);
      const conflitos = repo.conflitos({ inicio, duracao_min: atual.duracao_min, mentor_id: atual.mentor_id, ignorarId: atual.id });
      if (conflitos.length) return { alterado: false, conflito_com: conflitos.map(agendamentoResumido) };
    }
    const notas = e.notas ? [atual.notas, e.notas].filter(Boolean).join("\n") : undefined;
    const status = e.status || (inicio ? "marcado" : undefined);
    return { alterado: true, agendamento: agendamentoResumido(repo.atualizarAgendamento(atual.id, { inicio, status, notas })) };
  },

  registrar_palestra(repo, e) {
    const data = normalizarData(e.data);
    if (!data) throw new ErroFerramenta("Data inválida. Use AAAA-MM-DD.");
    return { registrada: repo.criarEvento({ ...e, data }) };
  },

  listar_palestras(repo, e) {
    return { palestras: repo.eventos(e) };
  },

  listar_suporte(repo, e) {
    const tickets = repo.tickets({ status: e.status, limite: 30 });
    return {
      total: tickets.length,
      atendimentos: tickets.map((t) => ({
        id: t.id, nome: t.nome, telefone: telefoneHumano(t.telefone), categoria: t.categoria, prioridade: t.prioridade,
        status: t.status, resumo: t.resumo, responsavel: t.responsavel, ultima_mensagem: t.ultima_msg_cliente,
        sem_resposta_da_equipe: Boolean(t.aguardando_equipe),
      })),
    };
  },

  async responder_suporte(repo, e, ctx) {
    const t = repo.ticket(e.ticket_id);
    if (!t) throw new ErroFerramenta(`Atendimento ${e.ticket_id} não encontrado.`);
    await ctx.enviar(t.telefone, e.mensagem, { ticket_id: t.id, autor: ctx.autor });
    repo.atualizarTicket(t.id, { status: e.resolver ? "resolvido" : "em_atendimento", responsavel: t.responsavel || ctx.autor });
    return { enviado: true, para: t.nome || telefoneHumano(t.telefone), resolvido: e.resolver };
  },

  async enviar_mensagem(repo, e, ctx) {
    const p = exigirPessoa(repo, e.pessoa_id);
    if (!p.telefone) throw new ErroFerramenta(`${p.nome} não tem telefone cadastrado.`);
    const ticket = repo.ticketAbertoPorTelefone(p.telefone);
    await ctx.enviar(p.telefone, e.mensagem, { ticket_id: ticket?.id, autor: ctx.autor });
    return { enviado: true, para: p.nome };
  },
};

/** Executa uma ferramenta e devolve { conteudo, erro }. Erros viram texto para o Claude explicar à equipe. */
export async function executarFerramenta(nome, entrada, ctx) {
  const executor = EXECUTORES[nome];
  if (!executor) return { conteudo: `Ferramenta desconhecida: ${nome}`, erro: true };
  try {
    const resultado = await executor(ctx.repo, entrada || {}, ctx);
    return { conteudo: JSON.stringify(resultado), erro: false };
  } catch (e) {
    if (e instanceof ErroFerramenta) return { conteudo: e.message, erro: true };
    console.error(`[ferramenta ${nome}]`, e);
    return { conteudo: `Falha interna ao executar ${nome}: ${e.message}`, erro: true };
  }
}
