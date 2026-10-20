import { test } from "node:test";
import assert from "node:assert/strict";
import { montar, textoFinal, triagem, usarFerramenta } from "./ajuda.js";
import { executarFerramenta } from "../src/ia/ferramentas.js";
import { enviarLembretesDeTarefas, montarResumoDiario } from "../src/lembretes.js";
import { lerWebhookEvolution } from "../src/whatsapp.js";
import { agoraLocal, somarMinutos } from "../src/util.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const EQUIPE = "5531999990000";

function ferramenta(ambiente, nome, entrada) {
  const ctx = { repo: ambiente.repo, autor: "Ana", telefone: EQUIPE, enviar: async () => {}, enviarArquivo: async (...a) => ambiente.enviadosArquivo.push(a) };
  return executarFerramenta(nome, entrada, ctx).then((r) => ({ ...r, dados: r.erro ? null : JSON.parse(r.conteudo) }));
}

function preparar(opcoes) {
  const ambiente = montar(opcoes);
  ambiente.enviadosArquivo = [];
  ambiente.juliana = ambiente.repo.criarPessoa({ tipo: "mentorada", nome: "Juliana Martins", telefone: "31988776655", estado: "MG", cidade: "Uberlândia" });
  return ambiente;
}

test("tarefa com horário vira lembrete no WhatsApp de quem pediu, uma vez só", async () => {
  const amb = preparar();
  const quando = somarMinutos(agoraLocal(), 60);
  const r = await ferramenta(amb, "criar_tarefa", {
    titulo: "Ligar para a Juliana sobre a renovação", quando, prioridade: "alta", pessoa_id: amb.juliana.id, notas: null, avisar: "quem_pediu",
  });
  assert.equal(r.erro, false);
  assert.equal(amb.repo.tarefa(r.dados.criada.id).avisar_telefone, EQUIPE);

  const enviados = [];
  const enviar = async (tel, texto) => enviados.push({ tel, texto });
  const avisar = async () => assert.fail("não devia avisar a equipe toda");
  assert.equal(await enviarLembretesDeTarefas({ repo: amb.repo, enviar, avisar, agora: somarMinutos(quando, -1) }), 0);
  assert.equal(await enviarLembretesDeTarefas({ repo: amb.repo, enviar, avisar, agora: quando }), 1);
  assert.equal(await enviarLembretesDeTarefas({ repo: amb.repo, enviar, avisar, agora: somarMinutos(quando, 5) }), 0);
  assert.equal(enviados[0].tel, EQUIPE);
  assert.match(enviados[0].texto, /Lembrete:\* Ligar para a Juliana[\s\S]*Juliana Martins/);

  // Adiar zera o lembrete; concluir tira da lista.
  const id = r.dados.criada.id;
  await ferramenta(amb, "atualizar_tarefa", { tarefa_id: id, status: null, novo_quando: somarMinutos(quando, 120), titulo: null, prioridade: null });
  assert.equal(amb.repo.tarefa(id).lembrete_enviado, 0);
  await ferramenta(amb, "atualizar_tarefa", { tarefa_id: id, status: "feita", novo_quando: null, titulo: null, prioridade: null });
  assert.equal((await ferramenta(amb, "listar_tarefas", { filtro: "pendentes", pessoa_id: null })).dados.total, 0);

  const passado = await ferramenta(amb, "criar_tarefa", { titulo: "x", quando: "2020-01-01T10:00", prioridade: null, pessoa_id: null, notas: null, avisar: "quem_pediu" });
  assert.equal(passado.erro, true);
});

test("financeiro: cobrança, atraso, pagamento com baixa e totais", async () => {
  const amb = preparar();
  const hoje = agoraLocal().slice(0, 10);
  const ontem = somarMinutos(`${hoje}T12:00`, -24 * 60).slice(0, 10);
  const id = amb.juliana.id;

  const c1 = (await ferramenta(amb, "registrar_cobranca", { pessoa_id: id, valor: 500, vencimento: ontem, descricao: "Parcela 1/2" })).dados.cobranca;
  await ferramenta(amb, "registrar_cobranca", { pessoa_id: id, valor: 500, vencimento: "2099-01-10", descricao: "Parcela 2/2" });
  assert.equal(c1.valor, "R$ 500,00");

  let fin = (await ferramenta(amb, "consultar_financeiro", { situacao: "atrasadas", pessoa_id: null, de: null, ate: null })).dados;
  assert.equal(fin.total_itens, 1);
  assert.equal(fin.total_atrasado, "R$ 500,00");

  const pg = (await ferramenta(amb, "registrar_pagamento", {
    pessoa_id: id, valor: 500, data: null, forma: "pix", cobranca_id: c1.id, arquivo_id: null, descricao: null,
  })).dados;
  assert.equal(pg.pagamento.status, "recebido");
  assert.equal(pg.cobrancas_ainda_abertas.length, 1);
  assert.equal(amb.repo.lancamento(c1.id).status, "paga");

  fin = (await ferramenta(amb, "consultar_financeiro", { situacao: "tudo", pessoa_id: id, de: null, ate: null })).dados;
  assert.equal(fin.total_atrasado, "R$ 0,00");
  assert.equal(fin.total_em_aberto, "R$ 500,00");
  assert.equal(fin.total_recebido, "R$ 500,00");

  // Pagamento sem dizer a cobrança: a secretária é avisada para perguntar.
  const solto = (await ferramenta(amb, "registrar_pagamento", { pessoa_id: id, valor: 500, data: null, forma: null, cobranca_id: null, arquivo_id: null, descricao: null })).dados;
  assert.match(solto.dica, /pergunte/);

  assert.equal((await ferramenta(amb, "registrar_cobranca", { pessoa_id: id, valor: -3, vencimento: hoje, descricao: null })).erro, true);
  const repetida = await ferramenta(amb, "registrar_pagamento", { pessoa_id: id, valor: 500, data: null, forma: null, cobranca_id: c1.id, arquivo_id: null, descricao: null });
  assert.match(repetida.conteudo, /já está paga/);
});

test("resumo diário inclui tarefas de hoje e cobranças em atraso", async () => {
  const amb = preparar();
  const agora = agoraLocal();
  const hoje = agora.slice(0, 10);
  amb.repo.criarTarefa({ titulo: "Enviar contrato", quando: `${hoje}T23:58`, pessoa_id: amb.juliana.id });
  amb.repo.criarLancamento({ pessoa_id: amb.juliana.id, tipo: "cobranca", valor_centavos: 25000, data: "2020-01-01" });
  const resumo = montarResumoDiario({ repo: amb.repo, agora });
  assert.match(resumo, /Tarefas para hoje \(1\)[\s\S]*23:58 Enviar contrato \(Juliana Martins\)/);
  assert.match(resumo, /Em atraso: 1 cobrança\(s\), R\$\s?250,00/);
});

test("anotações e arquivos: guardar, ligar à mentorada, buscar e enviar de volta", async () => {
  const amb = preparar();
  const reg = amb.arquivos.salvar({ base64: PNG, mimetype: "application/pdf", nome: "../contrato juliana.pdf", origem_telefone: EQUIPE });
  assert.equal(reg.nome_arquivo, "contrato_juliana.pdf"); // nome limpo, sem caminho
  assert.deepEqual(amb.arquivos.ler(reg), Buffer.from(PNG, "base64"));

  await ferramenta(amb, "guardar_arquivo", { arquivo_id: reg.id, pessoa_id: amb.juliana.id, titulo: "Contrato assinado" });
  await ferramenta(amb, "anotar", { pessoa_id: amb.juliana.id, texto: "Prefere sessões de manhã", titulo: null });

  const achados = (await ferramenta(amb, "buscar_registros", { pessoa_id: null, texto: "contrato", tipo: null })).dados;
  assert.equal(achados.total, 1);
  assert.equal(achados.registros[0].pessoa, "Juliana Martins");
  assert.equal((await ferramenta(amb, "buscar_registros", { pessoa_id: amb.juliana.id, texto: null, tipo: null })).dados.total, 2);

  await ferramenta(amb, "enviar_arquivo", { arquivo_id: reg.id, destino: "quem_pediu", pessoa_id: null, legenda: null });
  await ferramenta(amb, "enviar_arquivo", { arquivo_id: reg.id, destino: "pessoa", pessoa_id: amb.juliana.id, legenda: "Seu contrato" });
  assert.deepEqual(amb.enviadosArquivo.map(([tel, r, legenda]) => [tel, r.id, legenda]), [
    [EQUIPE, reg.id, "Contrato assinado"],
    ["5531988776655", reg.id, "Seu contrato"],
  ]);
});

test("foto mandada pela equipe chega para a Claude ler e vira pagamento com comprovante", async () => {
  const amb = preparar({
    roteiro: [
      (params) => {
        const ultimo = params.messages.at(-1).content;
        assert.equal(ultimo[0].type, "image");
        assert.equal(ultimo[0].source.media_type, "image/png");
        assert.match(ultimo[1].text, /arquivo #1/);
        assert.match(ultimo[1].text, /comprovante da Juliana/);
        return usarFerramenta("registrar_pagamento", {
          pessoa_id: 1, valor: 750, data: null, forma: "pix", cobranca_id: null, arquivo_id: 1, descricao: null,
        });
      },
      textoFinal("✅ Pagamento de R$ 750,00 da Juliana registrado, com comprovante."),
    ],
  });
  await amb.secretaria.receber({ telefone: EQUIPE, nome: "Ana", tipo: "midia", midiaBase64: PNG, mimetype: "image/png", legenda: "comprovante da Juliana" });

  const [pg] = amb.repo.lancamentos({ situacao: "pagamentos" });
  assert.equal(pg.valor_centavos, 75000);
  assert.equal(pg.arquivo_id, 1);
  assert.equal(amb.repo.registro(1).pessoa_id, amb.juliana.id);
  assert.equal(amb.repo.registro(1).titulo, "Comprovante de pagamento");
  assert.match(amb.enviados.at(-1).texto, /R\$ 750,00/);
});

test("foto mandada por mentorada no suporte fica guardada e ligada a ela", async () => {
  const amb = preparar({
    roteiro: [triagem({ categoria: "financeiro", prioridade: "media", resumo: "Mandou comprovante", resposta: "Recebido! A equipe confere.", precisa_humano: true })],
  });
  await amb.secretaria.receber({ telefone: "5531988776655", nome: "Ju", tipo: "midia", midiaBase64: PNG, mimetype: "image/jpeg", legenda: "segue o pix" });
  const [t] = amb.repo.tickets({ status: "abertos" });
  const [m] = amb.repo.mensagensDoTicket(t.id);
  assert.match(m.texto, /segue o pix \[enviou uma foto: arquivo\.jpg \(arquivo #1\)\]/);
  assert.equal(amb.repo.registro(1).pessoa_id, amb.juliana.id);
});

test("webhook lê foto e documento com legenda", () => {
  const base = { event: "messages.upsert", data: { key: { remoteJid: "5531988776655@s.whatsapp.net", id: "X" }, pushName: "Ju" } };
  const foto = lerWebhookEvolution({ ...base, data: { ...base.data, message: { imageMessage: { mimetype: "image/jpeg", caption: "comprovante" }, base64: "QUJD" } } });
  assert.deepEqual([foto.tipo, foto.mimetype, foto.legenda, foto.midiaBase64], ["midia", "image/jpeg", "comprovante", "QUJD"]);
  const doc = lerWebhookEvolution({ ...base, data: { ...base.data, message: { documentWithCaptionMessage: { message: { documentMessage: { mimetype: "application/pdf", fileName: "ficha.pdf", caption: "ficha nova" } } } } } });
  assert.deepEqual([doc.tipo, doc.nomeArquivo, doc.legenda, doc.midiaBase64], ["midia", "ficha.pdf", "ficha nova", null]);
});
