const { Pool, Client } = require('pg');
const fs = require('fs');
const path = require('path');
// Normalmente carrega o .env de sempre. Se a variável ENV_FILE estiver
// definida (o iniciar-teste.bat faz isso), carrega esse arquivo alternativo
// em vez disso — assim o ambiente de teste usa um banco e uma porta
// diferentes, sem tocar em nada do ambiente de produção.
require('dotenv').config({ path: path.join(__dirname, '..', process.env.ENV_FILE || '.env') });

const configConexao = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  // Fuso de Brasília em toda conexão: as colunas de data e hora sem fuso (autorização do CT-e/MDF-e,
  // entrega) e os filtros por dia/mês ficam no horário do Brasil mesmo se o PostgreSQL estiver em UTC.
  options: `-c TimeZone=${process.env.DB_TIMEZONE || 'America/Sao_Paulo'}`,
};
const nomeBanco = process.env.DB_NAME || 'sistema_frete';

let pool; // criado depois que garantirmos que o banco existe

/**
 * Garante que o banco de dados "sistema_frete" existe (cria se não existir)
 * e que as tabelas estão criadas, rodando o schema.sql.
 * Assim o usuário não precisa rodar createdb/psql manualmente.
 */
async function inicializarBanco() {
  // 1) Conecta no banco de manutenção "postgres" para poder criar o banco do sistema, se preciso.
  const clienteManutencao = new Client({ ...configConexao, database: 'postgres' });
  await clienteManutencao.connect();
  try {
    await clienteManutencao.query(`CREATE DATABASE ${nomeBanco}`);
    console.log(`Banco de dados "${nomeBanco}" criado.`);
  } catch (err) {
    if (err.code !== '42P04') { // 42P04 = banco já existe, tudo bem
      await clienteManutencao.end();
      throw err;
    }
  }
  await clienteManutencao.end();

  // 2) Agora conecta no banco do sistema de verdade e cria as tabelas.
  pool = new Pool({ ...configConexao, database: nomeBanco });

  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  await pool.query(schemaSql);

  pool.on('error', (err) => {
    console.error('Erro inesperado no pool do banco de dados:', err);
  });
}

// Camada usada pelas rotas: pool.query(...) só funciona depois de inicializarBanco()
// ser chamado e concluído (isso acontece uma vez, no início do server.js).
// Roda o schema.sql de novo no banco já conectado (usado depois de restaurar
// um backup, pra ele ficar com as tabelas/colunas desta versão).
async function aplicarSchema() {
  const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf-8');
  await pool.query(schemaSql);
}

// Fuso padrão do servidor PostgreSQL (o do postgresql.conf), numa conexão sem o fuso de Brasília
// que o sistema usa: é o fuso em que os dados foram gravados antes de o sistema fixar o fuso da sessão.
async function fusoPadraoServidor() {
  const { options: _o, ...semFuso } = configConexao;
  const c = new Client({ ...semFuso, database: nomeBanco });
  await c.connect();
  try { return (await c.query('SHOW TimeZone')).rows[0].TimeZone; } finally { await c.end().catch(() => {}); }
}

module.exports = {
  inicializarBanco,
  aplicarSchema,
  fusoPadraoServidor,
  query: (...args) => pool.query(...args),
  // Cliente dedicado, pra operações em transação (BEGIN/COMMIT).
  connect: () => pool.connect(),
};
