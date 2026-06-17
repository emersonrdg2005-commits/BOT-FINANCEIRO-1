const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const db = require('./db');

const app = express();
app.use(express.json());

// =============================================
// CONFIGURAÇÕES Z-API
// =============================================
const ZAPI_INSTANCE = '3F4AE54BC0E3F09723B462886BBB99AF';
const ZAPI_TOKEN = '9A095FF3B2806572F4D518BE';
const ZAPI_SECURITY_TOKEN = 'Fd2198dd2693548819a7b07d51f8a757fS';
const ZAPI_BASE_URL = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;

// =============================================
// FUNÇÕES Z-API
// =============================================
async function sendText(phone, message) {
  try {
    await axios.post(
      `${ZAPI_BASE_URL}/send-text`,
      { phone, message },
      { headers: { 'Client-Token': ZAPI_SECURITY_TOKEN, 'Content-Type': 'application/json' } }
    );
    console.log(`✅ Mensagem enviada para ${phone}`);
  } catch (err) {
    console.error('❌ Erro ao enviar mensagem:', err.response?.data || err.message);
  }
}

// =============================================
// FUNÇÕES AUXILIARES
// =============================================
function getMesAtual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMesNome(chave) {
  if (!chave) chave = getMesAtual();
  const [ano, mes] = chave.split('-');
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${nomes[parseInt(mes) - 1]} de ${ano}`;
}

function getCategoriaEmoji(cat) {
  const emojis = {
    'diversão': '🎉', 'lazer': '🎮', 'pessoal': '👤', 'presente': '🎁',
    'alimentação': '🍔', 'transporte': '🚗', 'saúde': '💊', 'educação': '📚',
    'roupas': '👕', 'casa': '🏠', 'outros': '📦'
  };
  return emojis[cat?.toLowerCase()] || '💸';
}

// =============================================
// PROCESSAMENTO DE MENSAGENS (LOCAL, SEM IA EXTERNA)
// =============================================
const PALAVRAS_CATEGORIA = {
  'alimentação': ['mercado', 'supermercado', 'comida', 'lanche', 'restaurante', 'almoço', 'jantar', 'padaria', 'feira', 'açougue', 'ifood', 'delivery', 'pizza', 'hamburguer', 'café'],
  'transporte': ['uber', 'gasolina', 'combustível', 'ônibus', 'transporte', '99', 'estacionamento', 'pedágio', 'metrô', 'taxi'],
  'saúde': ['farmácia', 'remédio', 'médico', 'consulta', 'dentista', 'exame', 'hospital', 'plano de saúde'],
  'diversão': ['cinema', 'bar', 'festa', 'show', 'balada', 'jogo', 'streaming', 'netflix'],
  'lazer': ['viagem', 'passeio', 'parque', 'hobby'],
  'presente': ['presente', 'aniversário', 'gift'],
  'roupas': ['roupa', 'sapato', 'tênis', 'camisa', 'calça', 'loja'],
  'casa': ['aluguel', 'condomínio', 'luz', 'água', 'internet', 'gás', 'limpeza', 'móveis'],
  'educação': ['curso', 'livro', 'faculdade', 'escola', 'material escolar'],
  'pessoal': ['salão', 'barbearia', 'cabelo', 'manicure', 'cosmético']
};

function detectarCategoria(texto) {
  const t = texto.toLowerCase();
  for (const [categoria, palavras] of Object.entries(PALAVRAS_CATEGORIA)) {
    if (palavras.some(p => t.includes(p))) return categoria;
  }
  return 'outros';
}

function extrairValor(texto) {
  // Remove "dia 15", "dia 5" etc antes de procurar valor, para não confundir com o valor do gasto/conta
  const semDia = texto.replace(/\bdias?\s+\d{1,2}\b/gi, '');

  // Procura padrões de dinheiro: "1.500,00" (com separador de milhar), ou número simples "80", "80,50", "1500"
  const match = semDia.match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?/);
  if (!match) return null;

  let num = match[0];
  if (num.includes(',')) {
    num = num.replace(/\./g, '').replace(',', '.');
  } else {
    num = num.replace(/\./g, '');
  }
  const valor = parseFloat(num);
  return isNaN(valor) ? null : valor;
}

function extrairDataVencimento(texto) {
  const matchData = texto.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (matchData) {
    let [, dia, mes, ano] = matchData;
    if (!ano) ano = new Date().getFullYear();
    if (ano.length === 2) ano = '20' + ano;
    return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
  }

  const matchDia = texto.match(/dia[s]?\s+(\d{1,2})/i);
  if (matchDia) {
    const dia = parseInt(matchDia[1]);
    const now = new Date();
    let mesVenc = now.getDate() > dia ? now.getMonth() + 2 : now.getMonth() + 1;
    let anoVenc = now.getFullYear();
    if (mesVenc > 12) { mesVenc = 1; anoVenc += 1; }
    return `${String(dia).padStart(2, '0')}/${String(mesVenc).padStart(2, '0')}/${anoVenc}`;
  }
  return null;
}

function extrairNomeConta(texto) {
  // Tenta capturar o que vem depois de "conta de X" ou nomes comuns de contas
  let m = texto.match(/conta\s+(?:de\s+)?([a-zçãõáéíóú\s]+?)(?:\s+(?:vence|dia|no valor|r\$|\d)|$)/i);
  if (m) return m[1].trim();

  const nomesComuns = ['luz', 'água', 'internet', 'aluguel', 'gás', 'cartão', 'boleto', 'condomínio', 'celular', 'telefone'];
  const tLower = texto.toLowerCase();
  for (const nome of nomesComuns) {
    if (tLower.includes(nome)) return nome;
  }
  return texto.substring(0, 30).trim();
}

function analisarMensagemLocal(texto) {
  const t = texto.toLowerCase();

  // CONSULTA
  if (t.match(/quanto (gastei|gasto|foi)|resumo|relat[oó]rio|extrato/)) {
    return { tipo: 'consulta' };
  }

  // LIMITE
  if (t.includes('limite')) {
    return { tipo: 'limite', valor: extrairValor(texto) };
  }

  // CONTA (palavras-chave de conta/boleto/vencimento, ou presença de "dia X" como vencimento)
  if (t.match(/conta de|conta\s|boleto|vence|vencimento|fatura/) || t.match(/\bdias?\s+\d{1,2}\b/)) {
    return {
      tipo: 'conta',
      valor: extrairValor(texto),
      nome_conta: extrairNomeConta(texto),
      data_vencimento: extrairDataVencimento(texto)
    };
  }

  // GASTO (palavras-chave de gasto + tem número)
  const valor = extrairValor(texto);
  if (valor && t.match(/gastei|comprei|paguei|gasto de|gasto:|custou|saiu por/)) {
    return {
      tipo: 'gasto',
      valor: valor,
      descricao: texto.substring(0, 60),
      categoria: detectarCategoria(texto)
    };
  }

  // Se tem valor numérico mesmo sem palavra-chave clara, assume gasto
  if (valor) {
    return {
      tipo: 'gasto',
      valor: valor,
      descricao: texto.substring(0, 60),
      categoria: detectarCategoria(texto)
    };
  }

  return { tipo: 'outro' };
}

async function gerarRelatorioLocal(mesChave) {
  const gastosMes = await db.getGastosPorMes(mesChave);
  const limite = (await db.getLimiteMensal(mesChave)) || 0;
  const total = gastosMes.reduce((s, g) => s + g.valor, 0);

  const porCategoria = {};
  gastosMes.forEach(g => {
    const cat = g.categoria || 'outros';
    porCategoria[cat] = (porCategoria[cat] || 0) + g.valor;
  });

  let rel = `📊 *Relatório - ${getMesNome(mesChave)}*\n\n`;
  rel += `💰 Total gasto: *R$ ${total.toFixed(2)}*\n`;
  if (limite > 0) {
    const pct = ((total / limite) * 100).toFixed(1);
    rel += `🎯 Limite: R$ ${limite.toFixed(2)} (${pct}% usado)\n`;
  }
  rel += `📝 Transações: ${gastosMes.length}\n`;

  if (Object.keys(porCategoria).length > 0) {
    rel += `\n📋 *Por categoria:*\n`;
    Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => {
      rel += `${getCategoriaEmoji(cat)} ${cat}: R$ ${val.toFixed(2)}\n`;
    });
  }

  if (total === 0) {
    rel += `\n✨ Nenhum gasto registrado ainda esse mês!`;
  } else if (limite > 0 && total < limite * 0.5) {
    rel += `\n✅ Você está controlando bem seus gastos esse mês!`;
  } else if (limite > 0 && total >= limite) {
    rel += `\n⚠️ Você ultrapassou o limite do mês. Atenção nos próximos gastos!`;
  }

  return rel;
}

// =============================================
// PROCESSAMENTO PRINCIPAL DE MENSAGENS
// =============================================
async function processarMensagem(phone, texto) {
  try {
    await processarMensagemInterna(phone, texto);
  } catch (err) {
    console.error('❌ Erro ao processar mensagem:', err);
    await sendText(phone, '⚠️ Tive um problema ao processar sua mensagem. Pode tentar reformular?').catch(() => {});
  }
}

async function processarMensagemInterna(phone, texto) {
  const mesAtual = getMesAtual();
  const textoLower = texto.toLowerCase().trim();

  console.log(`📩 Mensagem de ${phone}: ${texto}`);

  // === DEFINIR LIMITE MENSAL ===
  if (textoLower.includes('limite') && textoLower.match(/\d/)) {
    const valor = extrairValor(texto);
    if (valor) {
      await db.setLimiteMensal(mesAtual, valor);
      await sendText(phone,
        `✅ Limite de *R$ ${valor.toFixed(2)}* definido para ${getMesNome()}!\n\n` +
        `Vou te avisar quando você atingir 90% desse valor (R$ ${(valor * 0.9).toFixed(2)}) 🔔`
      );
      return;
    }
  }

  // === CONSULTAS ===
  if (textoLower.match(/quanto (gastei|gasto|foi)|resumo|relat[oó]rio|extrato/)) {
    const gastosMes = await db.getGastosPorMes(mesAtual);
    const total = gastosMes.reduce((s, g) => s + g.valor, 0);
    const limite = (await db.getLimiteMensal(mesAtual)) || 0;
    const porCategoria = {};
    gastosMes.forEach(g => {
      const cat = g.categoria || 'outros';
      porCategoria[cat] = (porCategoria[cat] || 0) + g.valor;
    });

    let msg = `📊 *Resumo de ${getMesNome()}*\n\n`;
    msg += `💸 Total gasto: *R$ ${total.toFixed(2)}*\n`;
    if (limite > 0) {
      const pct = ((total / limite) * 100).toFixed(1);
      msg += `🎯 Limite: R$ ${limite.toFixed(2)} (${pct}% usado)\n`;
    }
    msg += `📝 Transações: ${gastosMes.length}\n\n`;

    if (Object.keys(porCategoria).length > 0) {
      msg += `*Por categoria:*\n`;
      Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => {
        msg += `${getCategoriaEmoji(cat)} ${cat}: R$ ${val.toFixed(2)}\n`;
      });
    }

    // Contas pendentes do mês
    const hoje = new Date();
    const contasAbertas = await db.getContasAbertas();
    const contasPendentes = contasAbertas.filter(c => {
      if (!c.dataVencimento) return false;
      const [d, m, a] = c.dataVencimento.split('/');
      const dt = new Date(a, m - 1, d);
      return dt >= hoje;
    }).slice(0, 3);

    if (contasPendentes.length > 0) {
      msg += `\n📅 *Contas próximas:*\n`;
      contasPendentes.forEach(c => {
        msg += `• ${c.nomeConta}: vence ${c.dataVencimento}${c.valor ? ` (R$ ${c.valor.toFixed(2)})` : ''}\n`;
      });
    }

    await sendText(phone, msg);
    return;
  }

  // === LIMITE DISPONÍVEL (quanto ainda posso gastar) ===
  if (textoLower.match(/limite (dispon[ií]vel|restante|que (sobrou|tenho)|sobrando)|quanto (ainda )?posso gastar|quanto (tenho|sobrou) (de limite|para gastar)|quanto falta (do|para o) limite/)) {
    const total = await db.getTotalGastosMes(mesAtual);
    const limite = (await db.getLimiteMensal(mesAtual)) || 0;

    if (!limite) {
      await sendText(phone,
        `🤔 Você ainda não definiu um limite para ${getMesNome()}.\n\n` +
        `Para definir, diga: *"Limite 1500 reais"*`
      );
      return;
    }

    const disponivel = limite - total;
    const pct = ((total / limite) * 100).toFixed(1);

    let msg = `💰 *Limite Disponível - ${getMesNome()}*\n\n`;
    msg += `🎯 Limite total: R$ ${limite.toFixed(2)}\n`;
    msg += `💸 Já gasto: R$ ${total.toFixed(2)} (${pct}%)\n`;

    if (disponivel >= 0) {
      msg += `✅ Disponível: *R$ ${disponivel.toFixed(2)}*`;
    } else {
      msg += `⚠️ Você já ultrapassou o limite em *R$ ${Math.abs(disponivel).toFixed(2)}*`;
    }

    await sendText(phone, msg);
    return;
  }

  // === ABATER / MARCAR CONTA COMO PAGA ===
  if (textoLower.match(/paguei|abater|abate|j[aá] paguei|baixar conta|dar baixa|quitei|conta paga/)) {
    const contasAbertas = await db.getContasAbertas();

    if (contasAbertas.length === 0) {
      await sendText(phone, '✅ Você não tem contas pendentes para abater!');
      return;
    }

    // Tenta achar a conta pelo nome mencionado na mensagem
    let contaEncontrada = contasAbertas.find(c =>
      textoLower.includes(c.nomeConta.toLowerCase())
    );

    // Se não encontrou por nome e só existe 1 conta aberta, usa ela
    if (!contaEncontrada && contasAbertas.length === 1) {
      contaEncontrada = contasAbertas[0];
    }

    if (!contaEncontrada) {
      let msg = `🤔 Não identifiquei qual conta você quer abater. Você tem:\n\n`;
      contasAbertas.forEach((c, i) => {
        msg += `${i + 1}. ${c.nomeConta}${c.dataVencimento ? ` (vence ${c.dataVencimento})` : ''}\n`;
      });
      msg += `\nDiga por exemplo: *"Paguei a conta de ${contasAbertas[0].nomeConta}"*`;
      await sendText(phone, msg);
      return;
    }

    const pagaEm = new Date().toLocaleDateString('pt-BR');
    await db.marcarContaPaga(contaEncontrada.id, pagaEm);

    await sendText(phone,
      `✅ *Conta abatida!*\n\n` +
      `📋 ${contaEncontrada.nomeConta}\n` +
      `${contaEncontrada.valor ? `💰 Valor: R$ ${contaEncontrada.valor.toFixed(2)}\n` : ''}` +
      `🗓️ Marcada como paga em ${pagaEm}\n\n` +
      `Não vou mais te avisar sobre o vencimento dessa conta. 👍`
    );
    return;
  }

  // === VER CONTAS (somente quando é pergunta/consulta, não registro) ===
  const pareceRegistroDeConta = textoLower.match(/\bdias?\s+\d{1,2}\b/) || textoLower.match(/conta\s+(de\s+)?\w+.*\d/);
  if (!pareceRegistroDeConta && textoLower.match(/ver contas|contas pendentes|vencimento|boleto[s]?\??$|quais contas|minhas contas|pagar.*conta/)) {
    const hoje = new Date();
    const contasAbertas = await db.getContasAbertas();
    const contasPendentes = contasAbertas.filter(c => {
      if (!c.dataVencimento) return true;
      const [d, m, a] = c.dataVencimento.split('/');
      return new Date(a, m - 1, d) >= hoje;
    });

    if (contasPendentes.length === 0) {
      await sendText(phone, '✅ Não há contas pendentes cadastradas!');
    } else {
      let msg = `📅 *Contas Pendentes:*\n\n`;
      contasPendentes.forEach((c, i) => {
        msg += `${i + 1}. *${c.nomeConta}*\n`;
        if (c.dataVencimento) msg += `   📆 Vence: ${c.dataVencimento}\n`;
        if (c.valor) msg += `   💰 Valor: R$ ${c.valor.toFixed(2)}\n`;
        msg += '\n';
      });
      msg += `_Para marcar como pago, diga: "Paguei a conta de [nome]" ou "Abater conta ${contasPendentes[0]?.nomeConta}"_`;
      await sendText(phone, msg);
    }
    return;
  }

  // === AJUDA / MENU ===
  if (textoLower.match(/ajuda|menu|oi|ol[aá]|help|comandos/)) {
    const msg = `👋 *Olá! Sou seu Bot Financeiro!* 💰\n\n` +
      `Aqui está o que posso fazer:\n\n` +
      `*💸 Registrar gastos:*\n` +
      `→ "Gastei 50 reais no mercado"\n` +
      `→ "Comprei um presente de 120 reais"\n\n` +
      `*📅 Registrar contas:*\n` +
      `→ "Conta de luz vence dia 15 - 80 reais"\n` +
      `→ "Internet 100 reais dia 20"\n\n` +
      `*📊 Consultas:*\n` +
      `→ "Quanto gastei esse mês?"\n` +
      `→ "Relatório"\n` +
      `→ "Ver contas pendentes"\n\n` +
      `*🎯 Definir limite:*\n` +
      `→ "Limite 1500 reais"\n\n` +
      `_Também aceito fotos de recibos com legenda!_ 📸`;
    await sendText(phone, msg);
    return;
  }

  // === PROCESSAMENTO LOCAL (regras) ===
  const analise = analisarMensagemLocal(texto);
  console.log('🤖 Análise:', analise);

  if (analise.tipo === 'gasto' && analise.valor) {
    const gasto = await db.addGasto({
      telefone: phone,
      valor: analise.valor,
      descricao: analise.descricao || texto.substring(0, 50),
      categoria: analise.categoria || 'outros',
      mes: mesAtual,
      data: new Date().toLocaleDateString('pt-BR'),
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });

    const total = await db.getTotalGastosMes(mesAtual);
    const limite = await db.getLimiteMensal(mesAtual);

    let msg = `✅ *Gasto registrado!*\n\n` +
      `${getCategoriaEmoji(gasto.categoria)} ${gasto.descricao}\n` +
      `💰 Valor: *R$ ${gasto.valor.toFixed(2)}*\n` +
      `📂 Categoria: ${gasto.categoria}\n` +
      `📅 Data: ${gasto.data}\n\n` +
      `📊 Total no mês: *R$ ${total.toFixed(2)}*`;

    if (limite) {
      const pct = (total / limite) * 100;
      msg += ` / R$ ${limite.toFixed(2)} (${pct.toFixed(0)}%)`;

      // Alerta 90%
      const jaAlertado = await db.getAlertaEnviado(mesAtual);
      if (pct >= 90 && !jaAlertado) {
        await db.setAlertaEnviado(mesAtual);
        setTimeout(async () => {
          await sendText(phone,
            `⚠️ *ALERTA DE LIMITE!* ⚠️\n\n` +
            `Você já usou *${pct.toFixed(1)}%* do seu limite de ${getMesNome()}!\n\n` +
            `💸 Gasto: R$ ${total.toFixed(2)}\n` +
            `🎯 Limite: R$ ${limite.toFixed(2)}\n` +
            `💡 Restam apenas *R$ ${(limite - total).toFixed(2)}*\n\n` +
            `Fique de olho nos gastos! 👀`
          );
        }, 1500);
      }
    }

    await sendText(phone, msg);

  } else if (analise.tipo === 'conta') {
    // Calcular data de vencimento
    let dataVenc = analise.data_vencimento;
    if (!dataVenc && analise.descricao?.match(/dia (\d+)/)) {
      const dia = analise.descricao.match(/dia (\d+)/)[1];
      const now = new Date();
      const mesVenc = now.getDate() > parseInt(dia) ? now.getMonth() + 2 : now.getMonth() + 1;
      const anoVenc = mesVenc > 12 ? now.getFullYear() + 1 : now.getFullYear();
      dataVenc = `${String(dia).padStart(2, '0')}/${String(mesVenc > 12 ? 1 : mesVenc).padStart(2, '0')}/${anoVenc}`;
    }

    // Extrair dia da mensagem original
    if (!dataVenc) {
      const matchDia = texto.match(/dia[s]?\s+(\d+)/i);
      if (matchDia) {
        const dia = parseInt(matchDia[1]);
        const now = new Date();
        const mesVenc = now.getDate() > dia ? now.getMonth() + 2 : now.getMonth() + 1;
        const anoVenc = mesVenc > 12 ? now.getFullYear() + 1 : now.getFullYear();
        dataVenc = `${String(dia).padStart(2, '0')}/${String(mesVenc > 12 ? 1 : mesVenc).padStart(2, '0')}/${anoVenc}`;
      }
    }

    const conta = await db.addConta({
      telefoneOrigem: phone,
      nomeConta: analise.nome_conta || analise.descricao || 'Conta',
      valor: analise.valor || null,
      dataVencimento: dataVenc,
      registradoEm: new Date().toLocaleDateString('pt-BR')
    });

    let msg = `📅 *Conta registrada!*\n\n` +
      `📋 Nome: *${conta.nomeConta}*\n`;
    if (conta.valor) msg += `💰 Valor: R$ ${conta.valor.toFixed(2)}\n`;
    if (conta.dataVencimento) msg += `📆 Vencimento: *${conta.dataVencimento}*\n`;
    msg += `\n✅ Vou te lembrar na data do vencimento!`;

    await sendText(phone, msg);

  } else if (analise.tipo === 'consulta') {
    // Já processado acima, mas por segurança:
    const total = await db.getTotalGastosMes(mesAtual);
    await sendText(phone, `📊 Total gasto em ${getMesNome()}: *R$ ${total.toFixed(2)}*`);

  } else {
    // Mensagem não reconhecida
    await sendText(phone,
      `🤔 Não entendi muito bem...\n\n` +
      `Tente algo como:\n` +
      `• "Gastei 50 reais no mercado"\n` +
      `• "Conta de luz dia 15 - R$ 80"\n` +
      `• "Relatório do mês"\n\n` +
      `Digite *menu* para ver todos os comandos! 😊`
    );
  }
}

// =============================================
// WEBHOOK - RECEBER MENSAGENS DO WHATSAPP
// =============================================
app.post('/webhook', async (req, res) => {
  res.status(200).json({ ok: true }); // Responde rápido pro Z-API

  try {
    const body = req.body;
    console.log('📥 Webhook recebido:', JSON.stringify(body, null, 2));

    // Ignorar mensagens enviadas pelo BOT (mas permitir o chat "Mensagens para você mesmo")
    // No chat "você mesmo", fromMe vem true mas é uma mensagem real sua digitada no WhatsApp.
    // Mensagens realmente enviadas pelo bot (sendText) não passam por aqui, então isso é seguro.
    if (body.fromMe && body.fromApi) return; // só ignora se foi enviada via API (ex: pelo próprio bot)

    // Ignorar notificações automáticas do WhatsApp (promoções, catálogos, etc.)
    if (body.notification) return;

    // Ignorar mensagens encaminhadas/propaganda (catálogo, link de produto, listas de transmissão)
    if (body.isStatusReply || body.broadcast || body.isGroup) return;

    // Ignorar mensagens que vêm com link/imagem de produto promocional (sem ser foto de recibo)
    if (body.text?.message && body.text.message.match(/divulgador\.link|amzn\.|cupom:|EXPOCRISTA|👉|🔥.*PROMO/i)) {
      console.log('🚫 Mensagem ignorada (parece propaganda/notificação)');
      return;
    }

    // No chat "Mensagens para você mesmo", o campo "phone" vem como um ID (@lid) em vez do
    // número real. Nesse caso usamos o connectedPhone (seu próprio número) para responder.
    let phone = body.phone || body.senderPhone;
    if (phone && phone.includes('@lid') && body.connectedPhone) {
      phone = body.connectedPhone;
    }
    if (!phone) return;

    let texto = '';

    // Texto simples
    if (body.text?.message) {
      texto = body.text.message;
    }
    // Áudio - pede para descrever em texto (sem transcrição automática)
    else if (body.audio?.audioUrl) {
      await sendText(phone,
        '🎤 Recebi seu áudio! Por enquanto não consigo escutar áudios, então me diga em texto o valor e o que foi gasto (ou os dados da conta) para eu registrar. 😊'
      );
      return;
    }
    // Imagem (foto de recibo)
    else if (body.image) {
      texto = body.image?.caption || 'foto de comprovante';
      if (!body.image?.caption) {
        await sendText(phone,
          '📸 Recebi sua foto! Adicione uma legenda com o valor e descrição do gasto quando enviar a foto, ou me diga em texto o que foi gasto. 😊'
        );
        return;
      }
    }

    if (!texto) return;

    await processarMensagem(phone, texto);
  } catch (err) {
    console.error('❌ Erro ao processar webhook:', err);
  }
});

// Webhook alternativo para diferentes formatos Z-API
app.post('/webhook/message', async (req, res) => {
  res.status(200).json({ ok: true });
  const body = req.body;
  if (body.fromMe) return;
  const phone = body.phone;
  const texto = body.text?.message || '';
  if (phone && texto) await processarMensagem(phone, texto);
});

// =============================================
// AGENDAMENTOS (CRON JOBS)
// =============================================

// Verificar vencimento de contas diariamente às 8h
cron.schedule('0 8 * * *', async () => {
  console.log('⏰ Verificando contas do dia...');
  try {
    const hoje = new Date();
    const contasAbertas = await db.getContasAbertas();

    for (const conta of contasAbertas) {
      if (!conta.dataVencimento || !conta.telefoneOrigem) continue;
      const [d, m, a] = conta.dataVencimento.split('/');
      const dtVenc = new Date(a, m - 1, d);
      const diff = Math.floor((dtVenc - hoje) / (1000 * 60 * 60 * 24));

      if (diff === 3) {
        await sendText(conta.telefoneOrigem,
          `⚠️ *Lembrete de Conta!*\n\n` +
          `📋 ${conta.nomeConta}\n` +
          `📆 Vence em *3 dias* (${conta.dataVencimento})\n` +
          `${conta.valor ? `💰 Valor: R$ ${conta.valor.toFixed(2)}` : ''}`
        );
      } else if (diff === 0) {
        await sendText(conta.telefoneOrigem,
          `🔔 *VENCE HOJE!*\n\n` +
          `📋 ${conta.nomeConta} vence *HOJE*!\n` +
          `📆 ${conta.dataVencimento}\n` +
          `${conta.valor ? `💰 Valor: R$ ${conta.valor.toFixed(2)}` : ''}\n\n` +
          `Não esqueça de pagar! 💳`
        );
      } else if (diff < 0 && diff > -3) {
        await sendText(conta.telefoneOrigem,
          `❌ *Conta Vencida!*\n\n` +
          `📋 ${conta.nomeConta} venceu em ${conta.dataVencimento}\n` +
          `${conta.valor ? `💰 Valor: R$ ${conta.valor.toFixed(2)}` : ''}\n\n` +
          `Regularize o quanto antes! ⚠️`
        );
      }
    }
  } catch (err) {
    console.error('❌ Erro no cron de contas:', err);
  }
});

// Primeiro dia do mês às 9h — perguntar limite
cron.schedule('0 9 1 * *', async () => {
  console.log('📅 Primeiro dia do mês — perguntando limite...');
  try {
    const phones = await db.getTelefonesConhecidos();

    for (const phone of phones) {
      await sendText(phone,
        `🎉 *Olá! Começou ${getMesNome()}!*\n\n` +
        `💰 Qual será o seu limite de gastos para este mês?\n\n` +
        `Responda com: *"Limite [valor]"*\n` +
        `Exemplo: _"Limite 2000 reais"_\n\n` +
        `Isso me ajuda a te avisar quando estiver perto do limite! 🎯`
      );
    }
  } catch (err) {
    console.error('❌ Erro no cron de início de mês:', err);
  }
});

// Último dia do mês às 20h — relatório
cron.schedule('0 20 28-31 * *', async () => {
  const hoje = new Date();
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  // Só executa se amanhã for dia 1 (último dia do mês)
  if (amanha.getDate() !== 1) return;

  console.log('📊 Gerando relatório mensal...');
  try {
    const mesAtual = getMesAtual();
    const phones = await db.getTelefonesConhecidos();

    for (const phone of phones) {
      const relatorio = await gerarRelatorioLocal(mesAtual);
      await sendText(phone, relatorio);
    }
  } catch (err) {
    console.error('❌ Erro no cron de relatório mensal:', err);
  }
});

// =============================================
// ROTA DE STATUS
// =============================================
app.get('/', async (req, res) => {
  try {
    const mesAtual = getMesAtual();
    const total = await db.getTotalGastosMes(mesAtual);
    const gastosMes = await db.getGastosPorMes(mesAtual);
    const contasAbertas = await db.getContasAbertas();
    res.json({
      status: '✅ Bot Financeiro WhatsApp rodando!',
      mes: getMesNome(),
      totalGastoMes: `R$ ${total.toFixed(2)}`,
      totalTransacoes: gastosMes.length,
      contasPendentes: contasAbertas.length
    });
  } catch (err) {
    res.status(500).json({ status: '⚠️ Erro ao conectar no banco de dados', erro: err.message });
  }
});

// =============================================
// INICIAR SERVIDOR
// =============================================
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await db.initDB();
  } catch (err) {
    console.error('❌ Erro ao conectar/preparar o banco de dados:', err.message);
    console.error('Verifique se a variável DATABASE_URL está configurada corretamente.');
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Bot Financeiro WhatsApp iniciado!`);
    console.log(`📡 Servidor rodando na porta ${PORT}`);
    console.log(`🔗 Webhook URL: http://SEU-IP:${PORT}/webhook`);
    console.log(`📊 Status: http://SEU-IP:${PORT}/\n`);
  });
}

start();
