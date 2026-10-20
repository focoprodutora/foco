import { test } from "node:test";
import assert from "node:assert/strict";
import { montar, textoFinal, triagem } from "./ajuda.js";
import { criarApp } from "../src/app.js";

async function subir(opcoes) {
  const ambiente = montar(opcoes);
  const servidor = criarApp(ambiente);
  await new Promise((ok) => servidor.listen(0, ok));
  const base = `http://localhost:${servidor.address().port}`;
  const chamar = (caminho, { metodo = "GET", corpo, senha = "segredo" } = {}) =>
    fetch(base + caminho, {
      method: metodo,
      headers: { "Content-Type": "application/json", "x-painel-senha": senha },
      body: corpo && JSON.stringify(corpo),
    });
  return { ...ambiente, servidor, chamar };
}

test("painel exige senha e valida cadastros", async (t) => {
  const { servidor, chamar } = await subir();
  t.after(() => servidor.close());

  assert.equal((await chamar("/api/resumo", { senha: "errada" })).status, 401);
  assert.equal((await chamar("/api/resumo")).status, 200);

  const ruim = await chamar("/api/pessoas", { metodo: "POST", corpo: { tipo: "mentorada", nome: "X", estado: "XX" } });
  assert.equal(ruim.status, 400);
  const ok = await chamar("/api/pessoas", { metodo: "POST", corpo: { tipo: "mentorada", nome: "Ana Paula", telefone: "31988776655", estado: "MG", cidade: "Contagem" } });
  assert.equal(ok.status, 200);
  const dup = await chamar("/api/pessoas", { metodo: "POST", corpo: { tipo: "mentorada", nome: "Ana", telefone: "3188776655" } });
  assert.equal(dup.status, 409);

  const lista = await (await chamar("/api/pessoas?estado=MG")).json();
  assert.equal(lista[0].nome, "Ana Paula");
  assert.equal((await chamar("/index.html")).status, 200);
  assert.equal((await chamar("/../src/config.js")).status, 404);
});

test("webhook exige token e responde o suporte", async (t) => {
  const { servidor, chamar, enviados } = await subir({
    roteiro: [triagem({ categoria: "duvida", prioridade: "media", resumo: "Quer saber da próxima palestra", resposta: "Recebido!", precisa_humano: true })],
  });
  t.after(() => servidor.close());
  const corpo = { event: "messages.upsert", data: { key: { remoteJid: "5511977776666@s.whatsapp.net", id: "Z" }, pushName: "Lu", message: { conversation: "quando é a próxima palestra?" } } };

  assert.equal((await chamar("/webhook/evolution?token=errado", { metodo: "POST", corpo })).status, 401);
  assert.equal((await chamar("/webhook/evolution?token=tok", { metodo: "POST", corpo })).status, 200);
  await new Promise((ok) => setTimeout(ok, 50));
  assert.deepEqual(enviados, [{ telefone: "5511977776666", texto: "Recebido!" }]);

  const [ticket] = await (await chamar("/api/tickets")).json();
  const resposta = await chamar(`/api/tickets/${ticket.id}/responder`, { metodo: "POST", corpo: { texto: "Dia 15 em BH!", autor: "Ana", resolver: true } });
  assert.equal((await resposta.json()).status, "resolvido");
  assert.equal(enviados.at(-1).texto, "Dia 15 em BH!");
  const { mensagens } = await (await chamar(`/api/tickets/${ticket.id}`)).json();
  assert.deepEqual(mensagens.map((m) => m.autor), ["Lu", "secretaria", "Ana"]);
});

test("simulador devolve a resposta sem mandar nada para o WhatsApp", async (t) => {
  const { servidor, chamar, enviados } = await subir({ roteiro: [textoFinal("Você tem 0 mentoradas cadastradas.")] });
  t.after(() => servidor.close());
  const r = await (await chamar("/api/simular", { metodo: "POST", corpo: { como: "equipe", telefone: "11900001111", nome: "Teste", texto: "quantas mentoradas temos?" } })).json();
  assert.deepEqual(r.respostas, [{ para: "5511900001111", texto: "Você tem 0 mentoradas cadastradas." }]);
  assert.equal(enviados.length, 0);
});
