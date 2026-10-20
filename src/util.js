// Utilidades de data (horário de Brasília), telefone e texto.

// O Brasil não tem horário de verão desde 2019: Brasília é sempre UTC-3.
const OFFSET_MS = -3 * 60 * 60 * 1000;

export const ESTADOS = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};
export const UFS = Object.keys(ESTADOS);

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Data/hora local de Brasília no formato "AAAA-MM-DDTHH:MM". */
export function paraLocal(data = new Date()) {
  return new Date(data.getTime() + OFFSET_MS).toISOString().slice(0, 16);
}

export function agoraLocal() {
  return paraLocal(new Date());
}

/** Data/hora de Brasília com milissegundos, para ordenar mensagens do mesmo minuto. */
export function carimbo(data = new Date()) {
  return new Date(data.getTime() + OFFSET_MS).toISOString().slice(0, 23);
}

/** Converte "AAAA-MM-DDTHH:MM" (Brasília) em Date. */
export function deLocal(local) {
  return new Date(`${local.slice(0, 16)}:00-03:00`);
}

export function somarMinutos(local, minutos) {
  return paraLocal(new Date(deLocal(local).getTime() + minutos * 60_000));
}

/** Aceita "AAAA-MM-DD HH:MM", "AAAA-MM-DDTHH:MM[:SS]" e devolve "AAAA-MM-DDTHH:MM" ou null. */
export function normalizarDataHora(texto) {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(String(texto || "").trim());
  if (!m) return null;
  const local = `${m[1]}T${m[2]}:${m[3]}`;
  return Number.isNaN(deLocal(local).getTime()) ? null : local;
}

export function normalizarData(texto) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(texto || "").trim());
  return m ? m[1] : null;
}

/** "terça, 27/10 às 10h" */
export function dataHumana(local) {
  const d = deLocal(local);
  const dia = DIAS[new Date(d.getTime() + OFFSET_MS).getUTCDay()];
  const [, mes, diaMes] = local.slice(0, 10).split("-");
  const [h, min] = local.slice(11, 16).split(":");
  return `${dia}, ${diaMes}/${mes} às ${Number(h)}h${min === "00" ? "" : min}`;
}

export function diaDaSemana(local) {
  return DIAS[new Date(deLocal(local).getTime() + OFFSET_MS).getUTCDay()];
}

/** Só dígitos, com DDI 55 na frente quando for número brasileiro sem DDI. */
export function normalizarTelefone(texto) {
  if (!texto) return null;
  let d = String(texto).replace(/\D/g, "");
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 ? d : null;
}

/**
 * Chave para comparar telefones brasileiros: DDD + últimos 8 dígitos.
 * O WhatsApp às vezes entrega o celular sem o nono dígito, então
 * "5531988776655" e "553188776655" precisam ser o mesmo contato.
 */
export function chaveTelefone(texto) {
  const d = normalizarTelefone(texto);
  if (!d) return null;
  if (!d.startsWith("55")) return d;
  const local = d.slice(2);
  return local.slice(0, 2) + local.slice(-8);
}

/** "(31) 98877-6655" */
export function telefoneHumano(texto) {
  const d = normalizarTelefone(texto);
  if (!d || !d.startsWith("55")) return texto || "";
  const ddd = d.slice(2, 4);
  const num = d.slice(4);
  return `(${ddd}) ${num.slice(0, num.length - 4)}-${num.slice(-4)}`;
}

/** Minúsculas e sem acento, para busca. */
export function semAcento(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
