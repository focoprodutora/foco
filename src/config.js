import { existsSync } from "node:fs";

// Carrega o .env da raiz do projeto, se existir.
if (existsSync(".env")) process.loadEnvFile(".env");

const env = process.env;

function lista(valor) {
  return (valor || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export const config = {
  porta: Number(env.PORTA || 3000),
  bancoDeDados: env.BANCO_DE_DADOS || "dados/secretaria.db",
  senhaPainel: env.PAINEL_SENHA || "",
  tokenWebhook: env.WEBHOOK_TOKEN || "",

  // Números da equipe (com DDD). Mensagens deles viram comandos para a secretária;
  // mensagens de qualquer outro número entram na fila de suporte.
  numerosEquipe: lista(env.NUMEROS_EQUIPE),
  nomeNegocio: env.NOME_NEGOCIO || "nossa mentoria",

  claude: {
    modelo: env.CLAUDE_MODELO || "claude-opus-5-5",
    esforco: env.CLAUDE_ESFORCO || "medium",
  },

  transcricao: {
    url: (env.TRANSCRICAO_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    chave: env.TRANSCRICAO_CHAVE || "",
    modelo: env.TRANSCRICAO_MODELO || "whisper-1",
  },

  evolution: {
    url: (env.EVOLUTION_URL || "").replace(/\/$/, ""),
    chave: env.EVOLUTION_CHAVE || "",
    instancia: env.EVOLUTION_INSTANCIA || "",
  },

  suporte: {
    // Espera a pessoa terminar de mandar várias mensagens seguidas antes de responder.
    aguardarSegundos: Number(env.SUPORTE_AGUARDAR_SEGUNDOS ?? 20),
    alertaHoras: Number(env.ALERTA_TICKET_HORAS || 2),
  },

  resumoDiarioHora: Number(env.RESUMO_DIARIO_HORA ?? 7),
};
