# Colocando a secretária no ar

Tempo estimado: 20 a 30 minutos. Você vai precisar de:

- **O celular com o chip da secretária** (de preferência um número só para isso, com o WhatsApp já instalado).
- **Um cartão de crédito** para os serviços pagos por uso.
- **O acesso ao GitHub** onde está este código (`focoprodutora/foco`).

> Preços mudam: confira no site de cada serviço antes de contratar.

---

## Passo 1: criar as chaves de IA

### Claude (entende os pedidos e faz a triagem do suporte)
1. Entre em <https://platform.claude.com> e crie a conta.
2. Em **Billing**, adicione créditos.
3. Em **API Keys**, clique em **Create Key**. Copie a chave (começa com `sk-ant-`) e guarde num lugar seguro.

### Transcrição de áudio
Escolha uma das duas:
- **OpenAI:** <https://platform.openai.com/api-keys> → **Create new secret key**. Adicione créditos em *Billing*.
- **Groq** (costuma ser mais barata): <https://console.groq.com/keys> → **Create API Key**.

Guarde a chave. **Não mande chaves por chat, e-mail ou WhatsApp**: elas vão direto no painel do servidor (passo 4).

---

## Passo 2: criar a conta no Railway (o servidor)

1. Entre em <https://railway.com> e clique em **Login → GitHub** (use a conta que tem acesso ao repositório `focoprodutora/foco`).
2. Escolha o plano **Hobby** e cadastre o cartão.

---

## Passo 3: subir o WhatsApp (Evolution API)

1. No Railway, clique em **New Project → Deploy a template**.
2. Busque **Evolution API** e escolha o template da Evolution API v2 (ele já vem com Postgres e Redis).
   Link direto: <https://railway.com/deploy/evolution-api-whatsapp-rest-api--evolution-api-by-evoapicloud>
3. Clique em **Deploy** e espere todos os quadradinhos ficarem verdes.
4. Clique no serviço da **Evolution API**:
   - Em **Variables**, copie o valor de `AUTHENTICATION_API_KEY`. Essa é a sua **EVOLUTION_CHAVE**.
   - Em **Settings → Networking**, copie o domínio público (algo como `https://evolution-xxxx.up.railway.app`). Esse é o seu **EVOLUTION_URL**.
     Se não houver domínio, clique em **Generate Domain**.

---

## Passo 4: subir a secretária

1. **No mesmo projeto** do Railway, clique em **+ New → GitHub Repo** e escolha `focoprodutora/foco`.
2. Clique no novo serviço → **Settings → Source → Branch** e escolha a branch onde está a secretária
   (`main`, ou `secretaria-whatsapp` enquanto ela não for juntada à `main`).
3. **Guardar os dados:** clique com o botão direito no serviço → **Attach Volume** (ou **+ Volume**) e use o caminho
   **`/app/dados`**. Sem isso, o cadastro se apaga a cada atualização.
4. Em **Variables**, clique em **Raw Editor** e cole (trocando os valores):

   ```
   NOME_NEGOCIO=Foco Mentoria
   PAINEL_SENHA=uma-senha-forte-para-o-painel
   NUMEROS_EQUIPE=31999990000,11988880000
   ANTHROPIC_API_KEY=sk-ant-...
   TRANSCRICAO_CHAVE=...
   EVOLUTION_URL=https://evolution-xxxx.up.railway.app
   EVOLUTION_CHAVE=a AUTHENTICATION_API_KEY do passo 3
   EVOLUTION_INSTANCIA=secretaria
   WEBHOOK_TOKEN=invente-uma-senha-longa-aqui
   ```

   - `NUMEROS_EQUIPE`: números de **quem da equipe** vai mandar áudios para a secretária, com DDD, separados por vírgula.
     **Não** coloque o número da própria secretária.
   - Se escolheu a Groq no passo 1, adicione também:
     `TRANSCRICAO_URL=https://api.groq.com/openai/v1` e `TRANSCRICAO_MODELO=whisper-large-v3-turbo`
5. Em **Settings → Networking**, clique em **Generate Domain**. Esse é o endereço do seu painel.
6. Espere o deploy ficar verde.

---

## Passo 5: conectar o número da secretária

1. Abra o endereço do passo 4.5 e entre com a `PAINEL_SENHA`.
2. Na **Visão geral**, aparece o quadro **WhatsApp desconectado**.
3. Digite o **número da secretária** com DDD e clique em **Conectar WhatsApp**. Aparece um código de 8 letras.
4. No celular da secretária: **WhatsApp → ⋮ (ou Configurações) → Aparelhos conectados → Conectar aparelho →
   Conectar com número de telefone** e digite o código.
   - Prefere QR Code? Deixe o número em branco e clique em **Conectar WhatsApp**: aparece um QR Code para escanear.
5. Em alguns segundos o quadro muda para **WhatsApp conectado** ✅.

O celular da secretária pode ficar guardado, mas precisa entrar na internet pelo menos uma vez a cada 14 dias
para a conexão não cair.

---

## Passo 6: testar

1. De um número da equipe, mande um áudio para a secretária:
   *"Cadastra a Juliana Martins, 31 98877-6655, de Uberlândia, Minas."*
   Ela deve responder confirmando o cadastro. Confira na aba **Mentoradas e mentores** do painel.
2. De outro número (que não seja da equipe), mande: *"Oi, queria remarcar minha sessão"*.
   Deve aparecer um atendimento novo na aba **Suporte**.
3. Edite o arquivo `faq.md` no GitHub com as informações oficiais (horários, remarcação, palestras, pagamentos).
   O Railway atualiza a secretária sozinho em poucos minutos.

---

## Se algo der errado

| Sintoma | O que verificar |
|---|---|
| O painel mostra "WhatsApp com problema" | `EVOLUTION_URL` e `EVOLUTION_CHAVE` estão certos? A Evolution está verde no Railway? |
| O código de 8 letras não funciona | Clique em **Gerar outro código** (ele expira em pouco tempo) ou tente pelo QR Code. |
| A equipe manda áudio e cai no suporte | O número está em `NUMEROS_EQUIPE` com DDD? |
| A secretária responde "Não consegui ouvir esse áudio" | Confira a `TRANSCRICAO_CHAVE` e se há créditos na conta. |
| Ninguém recebe resposta | Veja os créditos da Claude e os **Logs** do serviço no Railway. |
| Os dados sumiram depois de atualizar | Falta o volume em `/app/dados` (passo 4.3). |

## Alternativa: servidor próprio (VPS)

Se preferir um servidor seu (Hostinger, DigitalOcean, Contabo etc.) com Docker:

```bash
git clone https://github.com/focoprodutora/foco.git && cd foco
cp .env.example .env   # preencha: PAINEL_SENHA, NUMEROS_EQUIPE, chaves, EVOLUTION_CHAVE, WEBHOOK_TOKEN, POSTGRES_SENHA
docker compose up -d
```

Isso sobe a secretária e a Evolution API juntas. Coloque um domínio com HTTPS apontando para a porta 3000
(com Caddy ou Nginx) e siga a partir do passo 5.
