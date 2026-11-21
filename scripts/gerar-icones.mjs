// Gera os ícones PNG do app a partir do SVG (usa o Chromium do Playwright).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright"); // rode com NODE_PATH=$(npm root -g) se o playwright for global
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/icons/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(size, file, maskable = false) {
  await page.setViewportSize({ width: size, height: size });
  const inner = maskable
    ? `<div style="width:100%;height:100%;background:#4a1426;display:grid;place-items:center"><div style="width:70%;height:70%">${svg}</div></div>`
    : svg;
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100%;height:100%;display:block}</style>${inner}`);
  await page.screenshot({ path: new URL(`../public/icons/${file}`, import.meta.url).pathname, omitBackground: !maskable });
}

await render(192, "icon-192.png");
await render(512, "icon-512.png");
await render(512, "icon-maskable-512.png", true);
await browser.close();
console.log("Ícones gerados em public/icons/");
