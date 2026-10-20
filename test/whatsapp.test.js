import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { criarClienteEvolution } from "../src/whatsapp.js";

/** Evolution API falsa, com o formato de resposta da versão 2.3. */
async function evolutionFalsa() {
  const chamadas = [];
  let estado = null; // null = instância não existe
  const servidor = createServer(async (req, res) => {
    let corpo = "";
    for await (const parte of req) corpo += parte;
    const url = new URL(req.url, "http://x");
    chamadas.push({ metodo: req.method, caminho: url.pathname, consulta: url.search, apikey: req.headers.apikey, corpo: corpo && JSON.parse(corpo) });
    const json = (status, dados) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(dados)); };

    if (url.pathname === "/instance/create") { estado = "close"; return json(201, { instance: { instanceName: "secretaria", status: "close" } }); }
    if (!estado) return json(404, { status: 404, error: "Not Found", response: { message: ["The \"secretaria\" instance does not exist"] } });
    if (url.pathname === "/instance/connectionState/secretaria") return json(200, { instance: { instanceName: "secretaria", state: estado } });
    if (url.pathname === "/webhook/set/secretaria") return json(201, { webhook: corpo });
    if (url.pathname === "/instance/connect/secretaria") {
      estado = "connecting";
      return json(200, { pairingCode: url.searchParams.get("number") ? "WZYEH1YY" : null, code: "2@abc", base64: "data:image/png;base64,iVBOR", count: 1 });
    }
    json(404, {});
  });
  await new Promise((ok) => servidor.listen(0, ok));
  return {
    chamadas,
    servidor,
    conectado() { estado = "open"; },
    cliente: criarClienteEvolution({ url: `http://localhost:${servidor.address().port}`, chave: "CHAVE", instancia: "secretaria" }),
  };
}

test("primeira conexão cria a instância, aponta o webhook e devolve o código de pareamento", async (t) => {
  const evo = await evolutionFalsa();
  t.after(() => evo.servidor.close());

  assert.equal(await evo.cliente.estado(), "inexistente");
  const r = await evo.cliente.conectar({ urlWebhook: "https://app.exemplo.com/webhook/evolution?token=tok", numero: "5531988776655" });
  assert.deepEqual(r, { estado: "connecting", qrBase64: "data:image/png;base64,iVBOR", codigoPareamento: "WZYEH1YY" });

  const criar = evo.chamadas.find((c) => c.caminho === "/instance/create");
  assert.equal(criar.apikey, "CHAVE");
  assert.equal(criar.corpo.instanceName, "secretaria");
  assert.equal(criar.corpo.integration, "WHATSAPP-BAILEYS");
  const webhook = evo.chamadas.find((c) => c.caminho === "/webhook/set/secretaria").corpo.webhook;
  assert.deepEqual(webhook, { enabled: true, url: "https://app.exemplo.com/webhook/evolution?token=tok", byEvents: false, base64: true, events: ["MESSAGES_UPSERT"] });
  assert.equal(evo.chamadas.find((c) => c.caminho === "/instance/connect/secretaria").consulta, "?number=5531988776655");

  // Segunda vez não recria a instância; depois de conectado, só confirma.
  evo.conectado();
  assert.deepEqual(await evo.cliente.conectar({ urlWebhook: "https://app.exemplo.com/webhook/evolution?token=tok" }), { estado: "open" });
  assert.equal(evo.chamadas.filter((c) => c.caminho === "/instance/create").length, 1);
});

test("sem configuração, o cliente avisa o que falta", async () => {
  const cliente = criarClienteEvolution({ url: "", chave: "", instancia: "" });
  assert.equal(cliente.configurado, false);
  await assert.rejects(cliente.estado(), /EVOLUTION_URL/);
});
