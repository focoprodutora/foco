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
  {
    name: "criar_tarefa",
    description:
      "Cria uma tarefa ou lembrete para a equipe. Com horário, a secretária manda o lembrete no WhatsApp na hora. " +
      "Ex.: \"me lembra amanhã às 9 de ligar para a Juliana\".",
    input_schema: objeto({
      titulo: texto("O que fazer, curto e claro. Ex.: \"Ligar para a Juliana sobre a renovação\"."),
      quando: nulo(texto("Data e hora do lembrete, AAAA-MM-DDTHH:MM (Brasília). null se não houver horário.")),
      prioridade: nulo({ type: "string", enum: ["baixa", "media", "alta"] }),
      pessoa_id: nulo({ type: "integer", description: "Mentorada/mentor relacionado, se houver." }),
      notas: nulo({ type: "string" }),
      avisar: { type: "string", enum: ["quem_pediu", "toda_equipe"], description: "Quem recebe o lembrete (padrão: quem pediu)." },
    }),
  },
  {
    name: "listar_tarefas",
    description: "Lista tarefas da equipe: pendentes, de hoje, atrasadas ou já feitas.",
    input_schema: objeto({
      filtro: { type: "string", enum: ["pendentes", "hoje", "atrasadas", "feitas"] },
      pessoa_id: nulo({ type: "integer" }),
    }),
  },
  {
    name: "atualizar_tarefa",
    description: "Conclui, cancela, reabre ou muda o horário de uma tarefa.",
    input_schema: objeto({
      tarefa_id: { type: "integer" },
      status: nulo({ type: "string", enum: ["pendente", "feita", "cancelada"] }),
      novo_quando: nulo(texto("Novo horário AAAA-MM-DDTHH:MM.")),
      titulo: nulo({ type: "string" }),
      prioridade: nulo({ type: "string", enum: ["baixa", "media", "alta"] }),
    }),
  },
  {
    name: "registrar_cobranca",
    description: "Registra um valor que a mentorada deve pagar (mensalidade, parcela, inscrição) e quando vence.",
    input_schema: objeto({
      pessoa_id: { type: "integer" },
      valor: { type: "number", description: "Valor em reais, ex.: 500 ou 1250.90." },
      vencimento: texto("AAAA-MM-DD"),
      descricao: nulo(texto("Ex.: \"Parcela 2/6 da mentoria\".")),
    }),
  },
  {
    name: "registrar_pagamento",
    description: "Registra um pagamento recebido de uma mentorada. Informe cobranca_id para dar baixa numa cobrança aberta.",
    input_schema: objeto({
      pessoa_id: { type: "integer" },
      valor: { type: "number", description: "Valor em reais." },
      data: nulo(texto("Data do pagamento AAAA-MM-DD (padrão: hoje).")),
      forma: nulo({ type: "string", enum: ["pix", "cartao", "boleto", "dinheiro", "transferencia", "outro"] }),
      cobranca_id: nulo({ type: "integer" }),
      arquivo_id: nulo({ type: "integer", description: "Comprovante já guardado, se houver." }),
      descricao: nulo({ type: "string" }),
    }),
  },
  {
    name: "alterar_cobranca",
    description: "Muda uma cobrança: dar baixa manual (paga), cancelar, reabrir, mudar vencimento ou valor.",
    input_schema: objeto({
      cobranca_id: { type: "integer" },
      status: nulo({ type: "string", enum: ["aberta", "paga", "cancelada"] }),
      novo_vencimento: nulo(texto("AAAA-MM-DD")),
      valor: nulo({ type: "number" }),
    }),
  },
  {
    name: "consultar_financeiro",
    description:
      "Consulta o financeiro: cobranças atrasadas, em aberto, pagamentos recebidos ou tudo, de uma pessoa ou de todas, " +
      "opcionalmente num período (de/ate em AAAA-MM-DD). Traz os totais.",
    input_schema: objeto({
      situacao: { type: "string", enum: ["atrasadas", "abertas", "pagamentos", "tudo"] },
      pessoa_id: nulo({ type: "integer" }),
      de: nulo({ type: "string" }),
      ate: nulo({ type: "string" }),
    }),
  },
  {
    name: "anotar",
    description: "Guarda uma anotação, ligada a uma mentorada/mentor ou geral. Ex.: resumo de conversa, preferência, combinado.",
    input_schema: objeto({
      pessoa_id: nulo({ type: "integer" }),
      texto: { type: "string" },
      titulo: nulo({ type: "string" }),
    }),
  },
  {
    name: "buscar_registros",
    description: "Procura anotações e arquivos guardados, de uma pessoa ou por palavra (ex.: \"contrato\", \"comprovante\").",
    input_schema: objeto({
      pessoa_id: nulo({ type: "integer" }),
      texto: nulo({ type: "string" }),
      tipo: nulo({ type: "string", enum: ["nota", "arquivo"] }),
    }),
  },
  {
    name: "guardar_arquivo",
    description: "Liga um arquivo já recebido a uma mentorada/mentor e dá um título a ele (ex.: \"Contrato assinado\").",
    input_schema: objeto({
      arquivo_id: { type: "integer" },
      pessoa_id: nulo({ type: "integer" }),
      titulo: nulo({ type: "string" }),
    }),
  },
  {
    name: "enviar_arquivo",
    description:
      "Envia um arquivo guardado pelo WhatsApp: para quem pediu (ex.: \"me manda o contrato da Juliana\") " +
      "ou para uma pessoa cadastrada (só se a equipe pediu).",
    input_schema: objeto({
      arquivo_id: { type: "integer" },
      destino: { type: "string", enum: ["quem_pediu", "pessoa"] },
      pessoa_id: nulo({ type: "integer", description: "Obrigatório quando destino = pessoa." }),
      legenda: nulo({ type: "string" }),
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

export function reais(centavos) {
  // O Intl separa "R$" do número com espaço não separável; o espaço comum copia e lê melhor no WhatsApp.
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
}

function paraCentavos(valor) {
  const c = Math.round(Number(valor) * 100);
  if (!Number.isFinite(c) || c <= 0) throw new ErroFerramenta(`Valor inválido: ${valor}. Confirme o valor em reais.`);
  return c;
}

function tarefaResumida(t) {
  return {
    id: t.id, titulo: t.titulo, quando: t.quando ? dataHumana(t.quando) : "sem horário", prioridade: t.prioridade,
    status: t.status, pessoa: t.pessoa_nome || null, notas: t.notas,
  };
}

function lancamentoResumido(l) {
  return {
    id: l.id, tipo: l.tipo, pessoa_id: l.pessoa_id, pessoa: l.pessoa_nome, valor: reais(l.valor_centavos),
    [l.tipo === "cobranca" ? "vencimento" : "data"]: l.data.split("-").reverse().join("/"),
    status: l.status, descricao: l.descricao, forma: l.forma, comprovante_arquivo_id: l.arquivo_id,
  };
}

function registroResumido(r) {
  return {
    id: r.id, tipo: r.tipo, pessoa: r.pessoa_nome || null, titulo: r.titulo, texto: r.texto,
    arquivo: r.nome_arquivo, formato: r.mimetype, guardado_em: r.criado_em.slice(0, 16).replace("T", " "),
  };
}


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
  criar_tarefa(repo, e, ctx) {
    let quando = null;
    if (e.quando) {
      quando = normalizarDataHora(e.quando);
      if (!quando) throw new ErroFerramenta(`Horário inválido: "${e.quando}". Use AAAA-MM-DDTHH:MM.`);
      if (quando < agoraLocal()) throw new ErroFerramenta(`${dataHumana(quando)} já passou. Confirme o horário.`);
    }
    if (e.pessoa_id) exigirPessoa(repo, e.pessoa_id);
    const t = repo.criarTarefa({
      titulo: e.titulo, notas: e.notas, quando, prioridade: e.prioridade || "media", pessoa_id: e.pessoa_id,
      avisar_telefone: e.avisar === "toda_equipe" ? null : ctx.telefone, criado_por: ctx.autor,
    });
    return { criada: tarefaResumida(t), lembrete: quando ? `no WhatsApp ${dataHumana(quando)}` : "sem lembrete (sem horário)" };
  },

  listar_tarefas(repo, e) {
    const agora = agoraLocal();
    const fimDoDia = somarMinutos(`${agora.slice(0, 10)}T00:00`, 24 * 60);
    const filtros = {
      pendentes: { status: "pendente" },
      hoje: { status: "pendente", ate: fimDoDia },
      atrasadas: { status: "pendente", ate: agora },
      feitas: { status: "feita" },
    };
    const tarefas = repo.tarefas({ ...filtros[e.filtro], pessoa_id: e.pessoa_id });
    return { total: tarefas.length, tarefas: tarefas.slice(0, 30).map(tarefaResumida) };
  },

  atualizar_tarefa(repo, e) {
    if (!repo.tarefa(e.tarefa_id)) throw new ErroFerramenta(`Tarefa ${e.tarefa_id} não encontrada.`);
    let quando;
    if (e.novo_quando) {
      quando = normalizarDataHora(e.novo_quando);
      if (!quando) throw new ErroFerramenta(`Horário inválido: "${e.novo_quando}".`);
    }
    const t = repo.atualizarTarefa(e.tarefa_id, { status: e.status, quando, titulo: e.titulo, prioridade: e.prioridade });
    return { atualizada: tarefaResumida(t) };
  },

  registrar_cobranca(repo, e) {
    exigirPessoa(repo, e.pessoa_id);
    const data = normalizarData(e.vencimento);
    if (!data) throw new ErroFerramenta("Vencimento inválido. Use AAAA-MM-DD.");
    const l = repo.criarLancamento({ pessoa_id: e.pessoa_id, tipo: "cobranca", valor_centavos: paraCentavos(e.valor), data, descricao: e.descricao });
    return { cobranca: lancamentoResumido(l) };
  },

  registrar_pagamento(repo, e) {
    const pessoa = exigirPessoa(repo, e.pessoa_id);
    const data = e.data ? normalizarData(e.data) : agoraLocal().slice(0, 10);
    if (!data) throw new ErroFerramenta("Data inválida. Use AAAA-MM-DD.");
    const valor_centavos = paraCentavos(e.valor);
    if (e.cobranca_id) {
      const c = repo.lancamento(e.cobranca_id);
      if (!c || c.tipo !== "cobranca" || c.pessoa_id !== pessoa.id) throw new ErroFerramenta(`A cobrança ${e.cobranca_id} não é de ${pessoa.nome}.`);
      if (c.status !== "aberta") throw new ErroFerramenta(`A cobrança ${e.cobranca_id} já está ${c.status}.`);
    }
    if (e.arquivo_id && !repo.registro(e.arquivo_id)) throw new ErroFerramenta(`Arquivo ${e.arquivo_id} não encontrado.`);
    if (e.arquivo_id) repo.atualizarRegistro(e.arquivo_id, { pessoa_id: pessoa.id, titulo: repo.registro(e.arquivo_id).titulo || "Comprovante de pagamento" });
    const l = repo.criarLancamento({
      pessoa_id: pessoa.id, tipo: "pagamento", valor_centavos, data, descricao: e.descricao, forma: e.forma,
      cobranca_id: e.cobranca_id, arquivo_id: e.arquivo_id,
    });
    const abertas = repo.lancamentos({ pessoa_id: pessoa.id, situacao: "abertas" });
    return {
      pagamento: lancamentoResumido(l),
      cobrancas_ainda_abertas: abertas.map(lancamentoResumido),
      dica: !e.cobranca_id && abertas.some((a) => a.valor_centavos === valor_centavos)
        ? "Há cobrança aberta com esse valor: pergunte se é para dar baixa nela." : undefined,
    };
  },

  alterar_cobranca(repo, e) {
    const c = repo.lancamento(e.cobranca_id);
    if (!c || c.tipo !== "cobranca") throw new ErroFerramenta(`Cobrança ${e.cobranca_id} não encontrada.`);
    let data;
    if (e.novo_vencimento) {
      data = normalizarData(e.novo_vencimento);
      if (!data) throw new ErroFerramenta("Vencimento inválido. Use AAAA-MM-DD.");
    }
    const valor_centavos = e.valor ? paraCentavos(e.valor) : undefined;
    return { cobranca: lancamentoResumido(repo.atualizarLancamento(c.id, { status: e.status || undefined, data, valor_centavos })) };
  },

  consultar_financeiro(repo, e) {
    if (e.pessoa_id) exigirPessoa(repo, e.pessoa_id);
    const hoje = agoraLocal().slice(0, 10);
    const itens = repo.lancamentos({
      pessoa_id: e.pessoa_id, situacao: e.situacao, hoje,
      de: e.de ? normalizarData(e.de) : undefined, ate: e.ate ? normalizarData(e.ate) : undefined,
    }).filter((l) => l.status !== "cancelada");
    const soma = (f) => reais(itens.filter(f).reduce((t, l) => t + l.valor_centavos, 0));
    return {
      hoje,
      total_itens: itens.length,
      total_em_aberto: soma((l) => l.tipo === "cobranca" && l.status === "aberta"),
      total_atrasado: soma((l) => l.tipo === "cobranca" && l.status === "aberta" && l.data < hoje),
      total_recebido: soma((l) => l.tipo === "pagamento"),
      itens: itens.slice(0, 40).map(lancamentoResumido),
    };
  },

  anotar(repo, e, ctx) {
    if (e.pessoa_id) exigirPessoa(repo, e.pessoa_id);
    const r = repo.criarRegistro({ pessoa_id: e.pessoa_id, tipo: "nota", titulo: e.titulo, texto: e.texto, autor: ctx.autor });
    return { anotacao: registroResumido(r) };
  },

  buscar_registros(repo, e) {
    const achados = repo.registros({ pessoa_id: e.pessoa_id, texto: e.texto, tipo: e.tipo, limite: 20 });
    return { total: achados.length, registros: achados.map(registroResumido) };
  },

  guardar_arquivo(repo, e) {
    const r = repo.registro(e.arquivo_id);
    if (!r || r.tipo !== "arquivo") throw new ErroFerramenta(`Arquivo ${e.arquivo_id} não encontrado.`);
    if (e.pessoa_id) exigirPessoa(repo, e.pessoa_id);
    return { guardado: registroResumido(repo.atualizarRegistro(r.id, { pessoa_id: e.pessoa_id ?? undefined, titulo: e.titulo ?? undefined })) };
  },

  async enviar_arquivo(repo, e, ctx) {
    const r = repo.registro(e.arquivo_id);
    if (!r || r.tipo !== "arquivo") throw new ErroFerramenta(`Arquivo ${e.arquivo_id} não encontrado.`);
    let telefone = ctx.telefone;
    let para = "você";
    if (e.destino === "pessoa") {
      if (!e.pessoa_id) throw new ErroFerramenta("Diga para qual pessoa enviar.");
      const p = exigirPessoa(repo, e.pessoa_id);
      if (!p.telefone) throw new ErroFerramenta(`${p.nome} não tem telefone cadastrado.`);
      telefone = p.telefone;
      para = p.nome;
    }
    await ctx.enviarArquivo(telefone, r, e.legenda || r.titulo || "");
    return { enviado: true, arquivo: r.nome_arquivo, para };
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
