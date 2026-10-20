import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { abrirBanco } from "./db.js";
import { criarApp } from "./app.js";
import { criarSecretaria } from "./secretaria.js";
import { criarTranscritor } from "./transcricao.js";
import { criarClienteEvolution } from "./whatsapp.js";
import { iniciarRotinas } from "./lembretes.js";

const repo = abrirBanco(config.bancoDeDados);
const secretaria = criarSecretaria({
  repo,
  claude: new Anthropic(),
  transcrever: criarTranscritor(config.transcricao),
  whatsapp: criarClienteEvolution(config.evolution),
  config,
});

const avisos = [];
if (!config.senhaPainel) avisos.push("PAINEL_SENHA não definida: o painel fica bloqueado.");
if (!config.tokenWebhook) avisos.push("WEBHOOK_TOKEN não definido: o WhatsApp não consegue entregar mensagens.");
if (!config.numerosEquipe.length) avisos.push("NUMEROS_EQUIPE vazio: toda mensagem vai para o suporte.");
if (!secretaria.whatsappConfigurado) avisos.push("Evolution API não configurada: use o Simulador do painel para testar.");
if (!config.transcricao.chave) avisos.push("TRANSCRICAO_CHAVE não definida: áudios não serão entendidos.");

criarApp({ repo, secretaria, config }).listen(config.porta, () => {
  console.log(`Secretária rodando em http://localhost:${config.porta}`);
  for (const a of avisos) console.log(`  ⚠ ${a}`);
});

if (secretaria.whatsappConfigurado) iniciarRotinas({ repo, secretaria, config });
