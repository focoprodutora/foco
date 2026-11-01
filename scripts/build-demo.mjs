// Gera um único HTML com o app em modo demonstração (sem Supabase), para mostrar/testar por link.
import { build } from "vite";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const out = "dist-demo";
await build({
  logLevel: "warn",
  mode: "demo",
  define: { "import.meta.env.VITE_SUPABASE_URL": "undefined", "import.meta.env.VITE_SUPABASE_ANON_KEY": "undefined" },
  build: { outDir: out, assetsInlineLimit: 1e8, cssCodeSplit: false, modulePreload: false },
});

let html = readFileSync(`${out}/index.html`, "utf8");
for (const f of readdirSync(`${out}/assets`)) {
  const code = readFileSync(`${out}/assets/${f}`, "utf8");
  if (f.endsWith(".js")) html = html.replace(new RegExp(`<script[^>]*src="/assets/${f}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
  if (f.endsWith(".css")) html = html.replace(new RegExp(`<link[^>]*href="/assets/${f}"[^>]*>`), () => `<style>${code}</style>`);
}
html = html.replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?\s*/g, "");
writeFileSync(`${out}/capricha-teste.html`, html);
console.log(`ok: ${out}/capricha-teste.html (${(html.length / 1024).toFixed(0)} KB)`);
