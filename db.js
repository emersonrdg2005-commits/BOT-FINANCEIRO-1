const { Pool } = require('pg');

// O Render injeta automaticamente a variável DATABASE_URL quando você conecta
// um banco PostgreSQL ao seu serviço (Dashboard > seu serviço > Environment).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// =============================================
// CRIAÇÃO DAS TABELAS (executa uma vez no início)
// =============================================
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gastos (
      id BIGSERIAL PRIMARY KEY,
      telefone TEXT,
      valor NUMERIC NOT NULL,
      descricao TEXT,
      categoria TEXT,
      mes TEXT NOT NULL,
      data TEXT,
      hora TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contas (
      id BIGSERIAL PRIMARY KEY,
      telefone_origem TEXT,
      nome_conta TEXT NOT NULL,
      valor NUMERIC,
      data_vencimento TEXT,
      registrado_em TEXT,
      paga BOOLEAN DEFAULT FALSE,
      paga_em TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS configuracao (
      mes TEXT PRIMARY KEY,
      limite_mensal NUMERIC,
      alerta_enviado BOOLEAN DEFAULT FALSE
    );
  `);

  console.log('✅ Tabelas do banco de dados prontas');
}

// =============================================
// GASTOS
// =============================================
async function addGasto(gasto) {
  const result = await pool.query(
    `INSERT INTO gastos (telefone, valor, descricao, categoria, mes, data, hora)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [gasto.telefone, gasto.valor, gasto.descricao, gasto.categoria, gasto.mes, gasto.data, gasto.hora]
  );
  return result.rows[0];
}

async function getGastosPorMes(mesChave) {
  const result = await pool.query('SELECT * FROM gastos WHERE mes = $1 ORDER BY criado_em ASC', [mesChave]);
  return result.rows.map(rowToGasto);
}

async function getTotalGastosMes(mesChave) {
  const result = await pool.query(
    'SELECT COALESCE(SUM(valor), 0) AS total FROM gastos WHERE mes = $1',
    [mesChave]
  );
  return parseFloat(result.rows[0].total);
}

function rowToGasto(row) {
  return {
    id: row.id,
    telefone: row.telefone,
    valor: parseFloat(row.valor),
    descricao: row.descricao,
    categoria: row.categoria,
    mes: row.mes,
    data: row.data,
    hora: row.hora
  };
}

// =============================================
// CONTAS
// =============================================
async function addConta(conta) {
  const result = await pool.query(
    `INSERT INTO contas (telefone_origem, nome_conta, valor, data_vencimento, registrado_em, paga)
     VALUES ($1, $2, $3, $4, $5, FALSE) RETURNING *`,
    [conta.telefoneOrigem, conta.nomeConta, conta.valor, conta.dataVencimento, conta.registradoEm]
  );
  return rowToConta(result.rows[0]);
}

async function getContasAbertas() {
  const result = await pool.query('SELECT * FROM contas WHERE paga = FALSE ORDER BY criado_em ASC');
  return result.rows.map(rowToConta);
}

async function getTodasContas() {
  const result = await pool.query('SELECT * FROM contas ORDER BY criado_em ASC');
  return result.rows.map(rowToConta);
}

async function marcarContaPaga(id, pagaEm) {
  await pool.query('UPDATE contas SET paga = TRUE, paga_em = $1 WHERE id = $2', [pagaEm, id]);
}

function rowToConta(row) {
  return {
    id: row.id,
    telefoneOrigem: row.telefone_origem,
    nomeConta: row.nome_conta,
    valor: row.valor !== null ? parseFloat(row.valor) : null,
    dataVencimento: row.data_vencimento,
    registradoEm: row.registrado_em,
    paga: row.paga,
    pagaEm: row.paga_em
  };
}

// =============================================
// CONFIGURAÇÃO (limites mensais)
// =============================================
async function getLimiteMensal(mesChave) {
  const result = await pool.query('SELECT limite_mensal FROM configuracao WHERE mes = $1', [mesChave]);
  if (result.rows.length === 0) return null;
  return parseFloat(result.rows[0].limite_mensal);
}

async function setLimiteMensal(mesChave, valor) {
  await pool.query(
    `INSERT INTO configuracao (mes, limite_mensal, alerta_enviado)
     VALUES ($1, $2, FALSE)
     ON CONFLICT (mes) DO UPDATE SET limite_mensal = $2, alerta_enviado = FALSE`,
    [mesChave, valor]
  );
}

async function getAlertaEnviado(mesChave) {
  const result = await pool.query('SELECT alerta_enviado FROM configuracao WHERE mes = $1', [mesChave]);
  if (result.rows.length === 0) return false;
  return result.rows[0].alerta_enviado;
}

async function setAlertaEnviado(mesChave) {
  await pool.query(
    `INSERT INTO configuracao (mes, alerta_enviado)
     VALUES ($1, TRUE)
     ON CONFLICT (mes) DO UPDATE SET alerta_enviado = TRUE`,
    [mesChave]
  );
}

// =============================================
// TELEFONES ÚNICOS (para os avisos automáticos/cron)
// =============================================
async function getTelefonesConhecidos() {
  const result = await pool.query(`
    SELECT DISTINCT telefone AS phone FROM gastos WHERE telefone IS NOT NULL
    UNION
    SELECT DISTINCT telefone_origem AS phone FROM contas WHERE telefone_origem IS NOT NULL
  `);
  return result.rows.map(r => r.phone).filter(Boolean);
}

module.exports = {
  initDB,
  addGasto,
  getGastosPorMes,
  getTotalGastosMes,
  addConta,
  getContasAbertas,
  getTodasContas,
  marcarContaPaga,
  getLimiteMensal,
  setLimiteMensal,
  getAlertaEnviado,
  setAlertaEnviado,
  getTelefonesConhecidos
};
