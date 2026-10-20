// Necessário para o celular oferecer "Instalar aplicativo". Não guarda nada em cache:
// o painel sempre mostra os dados atualizados do servidor.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
