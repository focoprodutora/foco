import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chaveTelefone, dataHumana, deLocal, normalizarDataHora, normalizarTelefone, paraLocal, somarMinutos, telefoneHumano,
} from "../src/util.js";

test("telefone com e sem nono dígito é o mesmo contato", () => {
  assert.equal(normalizarTelefone("(31) 98877-6655"), "5531988776655");
  assert.equal(chaveTelefone("5531988776655"), chaveTelefone("553188776655"));
  assert.equal(chaveTelefone("31 9 8877-6655"), "3188776655");
  assert.equal(normalizarTelefone("123"), null);
  assert.equal(telefoneHumano("5531988776655"), "(31) 98877-6655");
});

test("datas no horário de Brasília", () => {
  assert.equal(paraLocal(new Date("2026-10-20T13:00:00Z")), "2026-10-20T10:00");
  assert.equal(deLocal("2026-10-20T10:00").toISOString(), "2026-10-20T13:00:00.000Z");
  assert.equal(somarMinutos("2026-10-31T23:30", 60), "2026-11-01T00:30");
  assert.equal(normalizarDataHora("2026-10-27 10:00:00"), "2026-10-27T10:00");
  assert.equal(normalizarDataHora("amanhã"), null);
  assert.equal(dataHumana("2026-10-27T10:00"), "terça, 27/10 às 10h");
  assert.equal(dataHumana("2026-10-27T15:30"), "terça, 27/10 às 15h30");
});
