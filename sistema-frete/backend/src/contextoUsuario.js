// Quem está fazendo a ação nesta requisição (para o histórico de alterações campo a campo).
// O autenticar guarda o usuário aqui; o db.js passa para o PostgreSQL (app.usuario) nas gravações
// das tabelas acompanhadas, e os gatilhos registrar_alteracao() anotam antes → depois e quem mudou.
const { AsyncLocalStorage } = require('async_hooks');

const contexto = new AsyncLocalStorage();
const atual = () => contexto.getStore() || null;
const rodar = (usuario, fn) => contexto.run({ id: usuario.id, nome: usuario.nome }, fn);

// Tabelas com histórico de alterações (o mesmo conjunto dos gatilhos no schema.sql).
const TABELAS = ['fretes', 'usuarios', 'perfis_acesso', 'transportadoras', 'parceiros', 'clientes', 'tabelas_preco', 'tabela_preco_faixas',
  'faturas_frete', 'faturas_transporte', 'contas_pagar'];
const GRAVA = new RegExp(`\\b(UPDATE|INSERT\\s+INTO|DELETE\\s+FROM)\\s+"?(public\\.)?(${TABELAS.join('|')})"?\\b`, 'i');
const ehGravacaoAcompanhada = (sql) => GRAVA.test(typeof sql === 'string' ? sql : sql?.text || '');

module.exports = { contexto, atual, rodar, TABELAS, ehGravacaoAcompanhada };
