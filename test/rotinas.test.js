import { test } from "node:test";
import assert from "node:assert/strict";
import { montar } from "./ajuda.js";
import { alertarSuporteParado, enviarLembretes, montarResumoDiario } from "../src/lembretes.js";
import { lerWebhookEvolution } from "../src/whatsapp.js";
import { agoraLocal } from "../src/util.js";

test("lembretes de 24h e de 1h saem uma vez cada", async () => {
  const { repo } = montar();
  const p = repo.criarPessoa({ tipo: "mentorada", nome: "Juliana Martins", telefone: "31988776655", estado: "MG", cidade: "Uberlândia" });
  repo.criarAgendamento({ pessoa_id: p.id, inicio: "2026-10-21T10:00" });
  const enviados = [];
  const enviar = async (telefone, texto) => enviados.push({ telefone, texto });

  assert.equal(await enviarLembretes({ repo, enviar, agora: "2026-10-20T12:00" }), 1);
  assert.equal(await enviarLembretes({ repo, enviar, agora: "2026-10-20T13:00" }), 0);
  assert.match(enviados[0].texto, /Oi, Juliana!.*quarta, 21\/10 às 10h/);

  assert.equal(await enviarLembretes({ repo, enviar, agora: "2026-10-21T09:10" }), 1);
  assert.match(enviados[1].texto, /daqui a pouco, às 10:00/);
  assert.equal(await enviarLembretes({ repo, enviar, agora: "2026-10-21T09:30" }), 0);
});

test("remarcar zera os lembretes e cancelar impede o envio", async () => {
  const { repo } = montar();
  const p = repo.criarPessoa({ tipo: "mentorada", nome: "Bia", telefone: "31988776655" });
  const a = repo.criarAgendamento({ pessoa_id: p.id, inicio: "2026-10-21T10:00" });
  repo.marcarLembrete(a.id, "lembrete_24h");
  assert.equal(repo.atualizarAgendamento(a.id, { inicio: "2026-10-22T10:00" }).lembrete_24h, 0);
  repo.atualizarAgendamento(a.id, { status: "cancelado" });
  assert.equal(await enviarLembretes({ repo, enviar: async () => {}, agora: "2026-10-21T12:00" }), 0);
});

test("resumo diário e alerta de atendimento parado", async () => {
  const { repo } = montar();
  const p = repo.criarPessoa({ tipo: "mentorada", nome: "Bia", estado: "PE", cidade: "Recife" });
  const hoje = agoraLocal().slice(0, 10);
  repo.criarAgendamento({ pessoa_id: p.id, inicio: `${hoje}T15:00` });
  const t = repo.criarTicket({ telefone: "5511988887777", nome: "Paula" });
  repo.registrarMensagem({ ticket_id: t.id, telefone: t.telefone, direcao: "entrada", texto: "oi" });
  repo.atualizarTicket(t.id, { prioridade: "alta", resumo: "Quer remarcar" });

  const resumo = montarResumoDiario({ repo }); // as mensagens do teste têm o horário real
  assert.match(resumo, /15:00 Bia \(Recife\/PE\)/);
  assert.match(resumo, /1 em aberto, 1 esperando resposta/);

  const avisos = [];
  const avisar = async (texto) => avisos.push(texto);
  const daqui3h = "2099-01-01T00:00";
  assert.equal(await alertarSuporteParado({ repo, avisar, horas: 2, agora: daqui3h }), 1);
  assert.equal(await alertarSuporteParado({ repo, avisar, horas: 2, agora: daqui3h }), 0); // não repete
  assert.match(avisos[0], /#1 Paula \(alta\): Quer remarcar/);
});

test("lê o webhook da Evolution API", () => {
  const base = { event: "messages.upsert", instance: "foco" };
  assert.deepEqual(
    lerWebhookEvolution({ ...base, data: { key: { remoteJid: "5531988776655@s.whatsapp.net", fromMe: false, id: "A1" }, pushName: "Ju", message: { conversation: "oi" } } }),
    { id: "A1", telefone: "5531988776655", nome: "Ju", tipo: "texto", texto: "oi" },
  );
  const audio = lerWebhookEvolution({ ...base, data: { key: { remoteJid: "123@lid", senderPn: "5531988776655@s.whatsapp.net", id: "A2" }, message: { audioMessage: { mimetype: "audio/ogg; codecs=opus" }, base64: "QUJD" } } });
  assert.equal(audio.tipo, "audio");
  assert.equal(audio.telefone, "5531988776655");
  assert.equal(audio.audioBase64, "QUJD");
  assert.equal(lerWebhookEvolution({ ...base, data: { key: { remoteJid: "5531988776655@s.whatsapp.net", fromMe: true }, message: { conversation: "x" } } }), null);
  assert.equal(lerWebhookEvolution({ ...base, data: { key: { remoteJid: "1203@g.us" }, message: { conversation: "x" } } }), null);
  assert.equal(lerWebhookEvolution({ event: "connection.update", data: {} }), null);
});
