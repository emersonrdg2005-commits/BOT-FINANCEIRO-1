# 🤖 Bot Financeiro WhatsApp

Bot pessoal para controle de gastos e lembrança de contas via WhatsApp, usando Z-API + PostgreSQL, hospedado no Render (roda 24h, sem precisar do seu computador ligado).

---

## ✅ O QUE ESSE BOT FAZ

| Funcionalidade | Como usar |
|---|---|
| Registrar gasto | "Gastei 50 no mercado" |
| Registrar conta | "Conta de luz dia 15 - R$ 80" |
| Ver resumo | "Quanto gastei?" / "Relatório" |
| Ver contas pendentes | "Ver contas" |
| Marcar conta como paga | "Paguei a conta de luz" / "Abater aluguel" |
| Definir limite mensal | "Limite 2000 reais" |
| Ver limite disponível | "Quanto posso gastar ainda?" / "Limite disponível" |
| Alerta 90% do limite | Automático 🔔 |
| Relatório no fim do mês | Automático 📊 |
| Pergunta limite no início | Automático 📅 |

> ℹ️ Áudios: o bot recebe o áudio mas ainda não escuta o conteúdo — ele pede que você descreva o gasto/conta em texto.

---

## 📁 ARQUIVOS DO PROJETO

```
bot-financeiro/
├── index.js        ← Código principal do bot
├── db.js           ← Conexão e funções do banco de dados (PostgreSQL)
└── package.json    ← Dependências do projeto
```

---

## 🚀 COLOCANDO NO RENDER (rodando 24h)

Como você já tem conta no Render, vamos direto ao ponto.

### PASSO 1 — Subir os arquivos para o GitHub

O Render faz o deploy direto de um repositório do GitHub.

1. Acesse **github.com** e crie um repositório novo (pode ser privado), por exemplo `bot-financeiro`
2. Faça upload dos 3 arquivos (`index.js`, `db.js`, `package.json`) para esse repositório
   - Se você nunca usou Git, no próprio site do GitHub tem o botão **"uploading an existing file"** na página do repositório — não precisa instalar nada

---

### PASSO 2 — Criar o banco de dados PostgreSQL no Render

1. No painel do Render, clique em **"New +"** → **"PostgreSQL"**
2. Dê um nome, por exemplo `bot-financeiro-db`
3. Região: escolha a mais próxima (ex: Oregon ou Ohio — o Render não tem região no Brasil)
4. Plano: **Free**
5. Clique em **"Create Database"**
6. Aguarde alguns minutos até o status ficar **"Available"**

> ⚠️ O banco gratuito do Render expira 30 dias após a criação (com 14 dias de carência depois disso para você decidir se quer pagar). Antes de expirar, o Render avisa por e-mail. Se quiser algo permanente e gratuito, posso te ajudar a migrar para o Neon depois — me avise quando chegar perto da data.

---

### PASSO 3 — Criar o Web Service do bot

1. No painel do Render, clique em **"New +"** → **"Web Service"**
2. Conecte sua conta do GitHub e selecione o repositório `bot-financeiro`
3. Configure:
   - **Name**: `bot-financeiro` (ou o nome que quiser)
   - **Region**: a mesma região que você escolheu no banco
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: **Free**
4. **Não clique em criar ainda** — vá para o próximo passo primeiro

---

### PASSO 4 — Conectar o banco ao bot (variável DATABASE_URL)

Ainda na tela de criação do Web Service:

1. Role até **"Environment Variables"**
2. Clique em **"Add Environment Variable"**
3. Vá até a página do seu banco de dados (`bot-financeiro-db`) em outra aba, copie a **"Internal Database URL"**
4. Volte na tela do Web Service e adicione:
   - **Key**: `DATABASE_URL`
   - **Value**: cole a Internal Database URL que você copiou
5. Agora sim, clique em **"Create Web Service"**

O Render vai instalar as dependências e iniciar o bot automaticamente. Acompanhe pelos logs na própria tela — deve aparecer:
```
✅ Tabelas do banco de dados prontas
🚀 Bot Financeiro WhatsApp iniciado!
```

---

### PASSO 5 — Pegar a URL pública do bot

No topo da página do seu Web Service, o Render mostra uma URL parecida com:
```
https://bot-financeiro.onrender.com
```

Essa é a URL pública e permanente do seu bot.

---

### PASSO 6 — Configurar o Webhook no Z-API

1. Acesse **app.z-api.io**
2. Clique na sua instância → **"Webhooks"**
3. No campo **"Ao receber"** (On Receive), cole a URL do Render terminando em `/webhook`:
   ```
   https://bot-financeiro.onrender.com/webhook
   ```
4. Salve

---

### PASSO 7 — Testar!

Mande uma mensagem no WhatsApp conectado:
```
oi
```

O bot deve responder com o menu de comandos. 🎉

> 💡 No plano gratuito, o Render "dorme" o serviço depois de um tempo sem uso, e a primeira mensagem depois disso pode demorar uns 30-60 segundos para responder (ele precisa "acordar"). Mensagens seguintes são rápidas.

---

## 💬 EXEMPLOS DE USO

### Registrar gastos:
```
Gastei 50 reais no mercado
Comprei um presente de 120 reais para minha mãe
Gasolina 80 reais
Paguei 25 no lanche
Cinema 40 reais com namorada
```

### Registrar contas:
```
Conta de luz vence dia 15 - 80 reais
Internet 100 reais dia 20
Aluguel 800 reais dia 5
Boleto do cartão dia 10 - 350 reais
```

### Consultas:
```
Quanto gastei esse mês?
Relatório
Ver contas pendentes
Extrato
```

### Configurar limite:
```
Limite 2000 reais
Meu limite é 1500
```

### Ver limite disponível:
```
Quanto posso gastar ainda?
Limite disponível
Quanto sobrou de limite?
```

### Marcar conta como paga:
```
Paguei a conta de luz
Já paguei a faculdade
Abater aluguel
Quitei o cartão
```

---

## 🔔 AVISOS AUTOMÁTICOS

| Quando | O que acontece |
|---|---|
| Dia 1 de cada mês às 9h | Bot pergunta seu limite mensal |
| Ao atingir 90% do limite | Bot envia alerta imediato |
| 3 dias antes de conta vencer | Bot envia lembrete |
| No dia do vencimento | Bot envia aviso urgente |
| Último dia do mês às 20h | Bot envia relatório completo |

> ⚠️ Importante: no plano gratuito do Render, se o serviço "dormir" por inatividade, os agendamentos (cron jobs) só disparam quando o bot reacordar. Para garantir que os avisos automáticos cheguem sempre na hora certa, considere o plano pago do Render (~$7/mês) eventualmente, que mantém o serviço sempre ativo.

---

## 🆘 PROBLEMAS COMUNS

**Bot não responde:**
- Veja os **"Logs"** na página do Web Service no Render — qualquer erro aparece ali
- Confirme que a URL do webhook no Z-API termina em `/webhook`
- Confirme que a variável `DATABASE_URL` está configurada em "Environment"

**Erro de conexão com banco de dados nos logs:**
- Verifique se copiou a **Internal Database URL** corretamente (não a External)
- Confirme que o banco está com status "Available"

**Demora para responder na primeira mensagem:**
- Normal no plano Free — o serviço "dorme" após inatividade e demora para acordar

---

## 🔐 SEGURANÇA

Seus dados ficam armazenados no banco PostgreSQL do seu projeto no Render, acessível apenas pelo seu bot. Nenhuma informação é compartilhada com terceiros.

---

*Bot criado com ❤️ usando Node.js + PostgreSQL + Z-API*
