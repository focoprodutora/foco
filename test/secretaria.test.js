import { test } from "node:test";
import assert from "node:assert/strict";
import { montar, textoFinal, triagem, usarFerramenta } from "./ajuda.js";
import { executarFerramenta } from "../src/ia/ferramentas.js";
import { agoraLocal, somarMinutos } from "../src/util.js";

const amanha10h = () => `${somarMinutos(agoraLocal(), 24 * 60).slice(0, 10)}T10:00`;

test("áudio da equipe cadastra a mentorada e agenda a sessão", async () => {
  const inicio = amanha10h();
  const { repo, claude, enviados, secretaria } = montar({
    transcrever: async () => "agenda a Juliana Martins, 31 9 8877-6655, de Uberlândia Minas, amanhã às 10",
    roteiro: [
      usarFerramenta("buscar_pessoas", { texto: "Juliana Martins", tipo: null, estado: null, cidade: null, status: null }),
      usarFerramenta("cadastrar_pessoa", {
        tipo: "mentorada", nome: "Juliana Martins", telefone: "31988776655", estado: "MG", cidade: "Uberlândia",
        mentor_nome: null, observacoes: null,
      }),
      usarFerramenta("agendar", { pessoa_id: 1, inicio, duracao_min: null, mentor_nome: null, notas: null, forcar: false }),
      textoFinal("✅ Juliana Martins · (31) 98877-6655 · Uberlândia/MG · amanhã às 10h"),
    ],
  });

  await secretaria.receber({ telefone: "5531999990000", nome: "Ana", tipo: "audio", audioBase64: "AAAA", mimetype: "audio/ogg" });

  const [pessoa] = repo.buscarPessoas({ texto: "juliana" });
  assert.equal(pessoa.cidade, "Uberlândia");
  assert.equal(pessoa.estado, "MG");
  assert.equal(repo.agenda({ de: "2000", ate: "9999" })[0].inicio, inicio);

  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].telefone, "5531999990000");
  assert.match(enviados[0].texto, /🎤 _"agenda a Juliana/);
  assert.match(enviados[0].texto, /✅ Juliana Martins/);

  // O áudio transcrito e a data atual chegam ao Claude; as ferramentas são strict.
  const primeiro = claude.pedidos[0];
  assert.match(primeiro.messages.at(-1).content, /mandou um áudio, transcrito/);
  assert.match(primeiro.messages.at(-1).content, /\[Agora: /);
  assert.ok(primeiro.tools.every((t) => t.strict === true));
  // O resultado de cada ferramenta volta para o Claude na rodada seguinte.
  const resultado = claude.pedidos[1].messages.at(-1).content[0];
  assert.equal(resultado.type, "tool_result");
});

test("ferramentas: telefone duplicado, conflito de horário e mentor inexistente", async () => {
  const { repo } = montar();
  const ctx = { repo, autor: "Ana", enviar: async () => {} };
  const cad = (e) => executarFerramenta("cadastrar_pessoa", { tipo: "mentorada", estado: null, cidade: null, mentor_nome: null, observacoes: null, ...e }, ctx);

  const a = JSON.parse((await cad({ nome: "Carla Souza", telefone: "81 99876-5432" })).conteudo);
  assert.deepEqual(a.faltando, ["estado", "cidade"]);
  const dup = JSON.parse((await cad({ nome: "Carla S.", telefone: "558198765432" })).conteudo);
  assert.equal(dup.ja_existia, true);

  const semMentor = await cad({ nome: "Bia", telefone: null, mentor_nome: "Fulano" });
  assert.equal(semMentor.erro, true);
  assert.match(semMentor.conteudo, /Nenhum mentor/);

  const inicio = amanha10h();
  const agendar = (e) => executarFerramenta("agendar", { pessoa_id: 1, duracao_min: null, mentor_nome: null, notas: null, forcar: false, ...e }, ctx);
  assert.equal(JSON.parse((await agendar({ inicio })).conteudo).marcado, true);
  const choque = JSON.parse((await agendar({ inicio: inicio.replace("10:00", "10:30") })).conteudo);
  assert.equal(choque.marcado, false);
  assert.equal(choque.conflito_com.length, 1);
  assert.equal(JSON.parse((await agendar({ inicio: inicio.replace("10:00", "10:30"), forcar: true })).conteudo).marcado, true);

  const passado = await agendar({ inicio: "2020-01-01T10:00" });
  assert.equal(passado.erro, true);
});

test("resumo por estado junta mentoradas, mentores e palestras", async () => {
  const { repo } = montar();
  repo.criarPessoa({ tipo: "mentorada", nome: "A", estado: "MG", cidade: "BH" });
  repo.criarPessoa({ tipo: "mentorada", nome: "B", estado: "MG", cidade: "Uberlândia" });
  repo.criarPessoa({ tipo: "mentor", nome: "C", estado: "SP", cidade: "São Paulo" });
  repo.criarEvento({ titulo: "Palestra", estado: "BA", cidade: "Salvador", data: "2026-09-10" });
  const r = repo.resumoPorEstado();
  assert.equal(r.MG.mentoradas, 2);
  assert.equal(r.SP.mentores, 1);
  assert.equal(r.BA.eventos, 1);
  assert.equal(repo.buscarPessoas({ cidade: "uberlandia" }).length, 1);
});

test("mensagem de fora vira atendimento, recebe resposta e urgências avisam a equipe", async () => {
  const { repo, enviados, secretaria } = montar({
    roteiro: [
      triagem({ categoria: "acesso", prioridade: "urgente", resumo: "Não consegue entrar na aula de hoje", resposta: "Oi! Recebemos sua mensagem e a equipe já vai te ajudar.", precisa_humano: true }),
      triagem({ categoria: "acesso", prioridade: "urgente", resumo: "Não consegue entrar na aula de hoje", resposta: "", precisa_humano: true }),
    ],
  });
  repo.criarPessoa({ tipo: "mentorada", nome: "Paula Lima", telefone: "11 98888-7777", estado: "SP", cidade: "Campinas" });

  await secretaria.receber({ telefone: "5511988887777", nome: "Paulinha", tipo: "texto", texto: "não consigo entrar na aula de hoje!!" });
  await secretaria.receber({ telefone: "551188887777", nome: "Paulinha", tipo: "texto", texto: "alguém?" });

  const [t] = repo.tickets({ status: "abertos" });
  assert.equal(t.nome, "Paula Lima"); // reconhece a mentorada pelo telefone
  assert.equal(t.prioridade, "urgente");
  assert.equal(repo.tickets({}).length, 1); // as duas mensagens no mesmo atendimento

  const msgs = repo.mensagensDoTicket(t.id);
  assert.deepEqual(msgs.map((m) => m.direcao), ["entrada", "saida", "entrada"]);
  assert.equal(msgs[1].autor, "secretaria");

  const paraEquipe = enviados.filter((e) => e.telefone === "31999990000");
  assert.equal(paraEquipe.length, 1); // avisa a equipe uma vez só
  assert.match(paraEquipe[0].texto, /Suporte urgente/);

  // A resposta automática não conta como resposta da equipe.
  assert.equal(repo.ticketsSemResposta("9999").length, 1);
});

test("depois que a equipe assume o atendimento, a secretária não responde por cima", async () => {
  const { repo, enviados, secretaria } = montar({
    roteiro: [
      triagem({ categoria: "financeiro", prioridade: "alta", resumo: "Dúvida sobre boleto", resposta: "Recebido!", precisa_humano: true }),
      triagem({ categoria: "financeiro", prioridade: "alta", resumo: "Dúvida sobre boleto", resposta: "Recebido de novo!", precisa_humano: true }),
    ],
  });
  await secretaria.receber({ telefone: "5521977776666", nome: "Rita", tipo: "texto", texto: "meu boleto venceu" });
  const [t] = repo.tickets({ status: "abertos" });
  await secretaria.enviarWhatsapp(t.telefone, "Oi Rita, vou te mandar outro.", { ticket_id: t.id, autor: "Ana" });
  repo.atualizarTicket(t.id, { status: "em_atendimento" });

  await secretaria.receber({ telefone: "5521977776666", nome: "Rita", tipo: "texto", texto: "obrigada, aguardo" });
  assert.deepEqual(enviados.map((e) => e.texto), ["Recebido!", "Oi Rita, vou te mandar outro."]);
  assert.equal(repo.ticketsSemResposta("9999").length, 1);
});

test("quando a triagem resolve sozinha, o atendimento é encerrado", async () => {
  const { repo, secretaria } = montar({
    roteiro: [triagem({ categoria: "duvida", prioridade: "baixa", resumo: "Agradeceu", resposta: "Nós que agradecemos! 💛", precisa_humano: false })],
  });
  await secretaria.receber({ telefone: "5521977776666", nome: "Rita", tipo: "texto", texto: "obrigada pela aula!" });
  assert.equal(repo.tickets({ status: "resolvido" }).length, 1);
});

test("áudio da equipe que não dá para transcrever pede para repetir", async () => {
  const { enviados, secretaria } = montar({ transcrever: async () => { throw new Error("falhou"); } });
  await secretaria.receber({ telefone: "31999990000", nome: "Ana", tipo: "audio", audioBase64: "AAAA" });
  assert.match(enviados[0].texto, /Não consegui ouvir/);
});
