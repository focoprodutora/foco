/** Reduz a foto para no máx. 1600px e JPEG ~85%: upload rápido e análise mais barata. */
export async function comprimirFoto(arquivo: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, falha) =>
    canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Não consegui processar a foto."))), "image/jpeg", 0.85)
  );
}
