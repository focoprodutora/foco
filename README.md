# Secretária Foco

Secretária eletrônica no WhatsApp para organizar mentoradas, mentores, agenda, palestras e suporte.

- **A equipe manda áudio** ("cadastra a Juliana Martins, 31 98877-6655, de Uberlândia, Minas, e agenda terça às 10h")
  e a secretária transcreve, cadastra, agenda e confirma no WhatsApp.
- **Mentoradas e clientes que mandam mensagem** para o mesmo número entram numa **fila de suporte**.
  Cada conversa vira um atendimento com prioridade, categoria e resumo. A secretária responde o que sabe
  (pelo arquivo `faq.md`) e avisa a equipe do resto. Nenhuma mensagem se perde.
- **Painel no navegador** com mentoradas e mentores por estado, agenda, palestras e a fila do suporte.

## O que ela faz

| Pedido da equipe (áudio ou texto) | O que acontece |
|---|---|
| "Cadastra a Renata Souza, de Recife, 81 99777-6655" | Cadastro com nome, telefone, estado e cidade. Se faltar algo, ela pergunta. |
| "Agenda a Renata quinta às 3 da tarde com o Carlos" | Marca a sessão e avisa se o horário bater com outra. |
| "Passa a sessão da Renata para sexta às 10" / "Cancela a da Bianca" | Remarca ou cancela. |
| "Quem eu atendo amanhã?" | Lista a agenda. |
| "Quantas mentoradas temos em Minas?" / "Quem é de Salvador?" | Busca por estado, cidade, nome ou telefone. |
| "Registra a palestra de BH dia 12/09 no Minascentro" | Guarda a palestra no estado. |
| "Tem alguém esperando no suporte?" | Lista atendimentos abertos e há quanto tempo esperam. |
| "Responde a Paula dizendo que o link novo já foi enviado e encerra" | Responde a pessoa no WhatsApp e fecha o atendimento. |
| "A sessão da Juliana foi ótima, falamos sobre precificação" | Guarda a anotação no histórico da sessão. |
| **Tarefas e lembretes** | |
| "Me lembra amanhã às 9 de ligar para a Juliana" | Cria a tarefa e manda o lembrete no WhatsApp na hora. Responda "feito" ou "adia para as 11". |
| "O que eu tenho para hoje?" / "O que está atrasado?" | Lista as tarefas. |
| **Financeiro das mentoradas** | |
| "A Juliana tem parcela de 500 todo dia 10, a próxima é em novembro" | Registra a cobrança com vencimento. |
| "A Juliana pagou 500 no pix" | Registra o pagamento e dá baixa na cobrança aberta. |
| "Quem está atrasada?" / "Quanto entrou este mês?" | Lista atrasos e totais. Só registra: não cobra nem faz pagamentos. |
| **Fotos e documentos** | |
| Foto de ficha de inscrição | Lê a ficha e cadastra a mentorada. |
| Print ou PDF de comprovante + "da Juliana" | Registra o pagamento com o comprovante anexado. |
| **Anotações e arquivos** | |
| "Anota que a Juliana prefere sessões de manhã" | Guarda no histórico dela. |
| PDF do contrato + "guarda o contrato da Juliana" | Arquiva o documento na ficha dela. |
| "Me manda o contrato da Juliana" | Envia o arquivo de volta no WhatsApp. |

**Automático, sem ninguém pedir:**
- Lembrete para a mentorada 24h antes e 1h antes da sessão.
- Lembrete das tarefas da equipe na hora marcada.
- Resumo diário no WhatsApp da equipe (padrão: 7h) com as sessões e tarefas do dia, cobranças que vencem ou estão
  em atraso, e o suporte pendente.
- Alerta para a equipe quando um atendimento fica mais de 2h sem resposta.
- Alerta imediato quando chega algo **urgente** no suporte.
- Quando alguém da equipe assume um atendimento, a secretária para de responder por cima.

## Como funciona

```
WhatsApp ──► Evolution API ──► esta aplicação ──┬─► número da equipe? ─► Secretária (Claude + ferramentas)
                                                │                        cadastro · agenda · palestras · suporte
                                                └─► outro número ──────► Fila de suporte (triagem por IA)
                       áudio? ─► Whisper transcreve antes                 resposta automática + alerta à equipe
```

- **Banco de dados:** SQLite, num arquivo só (`dados/secretaria.db`). Não precisa de Google nem planilha.
- **IA:** Claude (Anthropic) para entender os pedidos e fazer a triagem.
- **Transcrição:** Whisper (OpenAI, ou Groq, que é mais barato).
- **WhatsApp:** [Evolution API](https://doc.evolution-api.com), de código aberto. Você hospeda ou contrata uma já hospedada.

## Colocando no ar

O passo a passo completo, para quem não é técnico, está em **[INSTALACAO.md](INSTALACAO.md)**:
chaves de IA → servidor no Railway → Evolution API → conectar o número pelo painel (código de 8 letras ou QR Code).

### Rodar no seu computador (para testar)
Precisa do Node.js 22.13 ou mais novo.

```bash
npm install
cp .env.example .env     # preencha pelo menos PAINEL_SENHA e ANTHROPIC_API_KEY
npm start
```

Abra `http://localhost:3000`, entre com a `PAINEL_SENHA` e use a aba **Testar**: escreva ou grave um áudio como
se fosse alguém da equipe ou uma mentorada. As respostas aparecem na tela e **não** são enviadas para ninguém.

### Ensinar o suporte
Edite o `faq.md` com as informações oficiais (horários, como remarcar, próximas palestras, pagamentos).
A secretária só responde o que estiver lá. O resto ela passa para a equipe.

## Custos aproximados
Os valores mudam: confira nos sites antes de contratar.
- **Claude:** cobra por uso. Cada mensagem consome poucos centavos.
- **Whisper:** cobra por minuto de áudio. A Groq costuma sair mais barata que a OpenAI.
- **Evolution API + servidor:** de graça se você mesmo hospedar, ou uma mensalidade num serviço pronto.

## Desenvolvimento

```bash
npm test
```

Os testes usam uma IA simulada e não gastam nada.

Estrutura:
- `src/secretaria.js`: decide se a mensagem é da equipe ou do suporte
- `src/ia/assistente.js` e `src/ia/ferramentas.js`: a secretária da equipe e o que ela pode fazer
- `src/ia/suporte.js`: triagem do suporte
- `src/lembretes.js`: lembretes, resumo diário e alertas
- `src/db.js`: banco de dados
- `src/app.js`: webhook, API do painel e conexão do WhatsApp
- `src/whatsapp.js`: integração com a Evolution API
- `public/`: painel
