// Guarda no disco os arquivos recebidos (fotos, PDFs, comprovantes) ao lado do banco de dados.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const EXTENSOES = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "application/pdf": "pdf", "audio/ogg": "ogg", "video/mp4": "mp4",
};

/** Tipos que a Claude consegue ler direto: imagem vira bloco "image", PDF vira bloco "document". */
export const IMAGENS_LEGIVEIS = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export function tipoBase(mimetype) {
  return String(mimetype || "application/octet-stream").split(";")[0].trim().toLowerCase();
}

function nomeSeguro(nome, mimetype) {
  const limpo = basename(String(nome || "")).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);
  if (limpo && limpo !== "." && limpo !== "..") return limpo;
  return `arquivo.${EXTENSOES[tipoBase(mimetype)] || "bin"}`;
}

export function criarArquivos({ repo, caminhoBanco }) {
  const pasta = caminhoBanco === ":memory:" ? null : join(dirname(caminhoBanco), "arquivos");
  const memoria = new Map(); // usado nos testes (banco em memória)

  return {
    /** Salva o arquivo e cria o registro. Devolve o registro. */
    salvar({ base64, mimetype, nome, pessoa_id, titulo, texto, origem_telefone, autor }) {
      const dados = Buffer.from(base64, "base64");
      const nome_arquivo = nomeSeguro(nome, mimetype);
      const registro = repo.criarRegistro({
        pessoa_id, tipo: "arquivo", titulo, texto, mimetype: tipoBase(mimetype), nome_arquivo,
        tamanho: dados.length, origem_telefone, autor,
      });
      const caminho = `${registro.id}-${nome_arquivo}`;
      if (pasta) {
        mkdirSync(pasta, { recursive: true });
        writeFileSync(join(pasta, caminho), dados);
      } else {
        memoria.set(caminho, dados);
      }
      repo.db.prepare(`UPDATE registros SET caminho = ? WHERE id = ?`).run(caminho, registro.id);
      return repo.registro(registro.id);
    },

    /** Conteúdo do arquivo em Buffer, ou null se não existir. */
    ler(registro) {
      if (!registro?.caminho) return null;
      if (!pasta) return memoria.get(registro.caminho) || null;
      try {
        return readFileSync(join(pasta, basename(registro.caminho)));
      } catch {
        return null;
      }
    },
  };
}
