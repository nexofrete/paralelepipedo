const pool = require('./db');

// Todas as permissões individuais de usuário (colunas booleanas em "usuarios").
// Admin sempre tem tudo, independente delas.
const CAMPOS_PERMISSAO = [
  'pode_ver_todos', 'pode_enviar_xml', 'pode_editar_registros', 'pode_excluir_registros',
  'pode_gerenciar_usuarios', 'pode_gerenciar_transportadoras', 'pode_gerenciar_tabelas_preco',
  'pode_aprovar_pagamento', 'pode_aprovar_valores_altos', 'dois_fatores_ativo',
  'pode_ver_auditoria', 'pode_ver_financeiro', 'pode_ver_relatorios', 'pode_ver_sinistros',
  'pode_conferir_fatura', 'pode_emitir_cte',
];

const ehAdmin = (req) => req.usuario?.perfil === 'admin';

// Admin e quem tem "Ver tudo" enxergam os fretes de todos os clientes.
const vePotudo = (req) => ehAdmin(req) || !!req.usuario?.pode_ver_todos;

// Admin ou quem tiver QUALQUER uma das permissões passadas.
function temAlguma(req, ...nomes) {
  return ehAdmin(req) || nomes.some((n) => !!req.usuario?.[n]);
}
function permitirAlguma(...nomes) {
  return (req, res, next) => {
    if (temAlguma(req, ...nomes)) return next();
    return res.status(403).json({ erro: 'Você não tem permissão para fazer isso.' });
  };
}

// Roda uma consulta de relatório/resumo enxergando só os fretes que contam:
// sem os CT-e cancelados (eles ficam só como histórico) e, pra quem não vê
// tudo, só os do cliente do usuário. Funciona pondo na frente um WITH chamado
// "fretes", que na consulta toma o lugar da tabela de verdade — assim qualquer
// FROM/JOIN/subconsulta em "fretes" já sai filtrada, sem reescrever cada SQL.
// NOT MATERIALIZED (PostgreSQL 12+) faz o banco usar a tabela direto, sem
// montar uma cópia dela na memória.
let suportaNotMaterialized = null;
async function verificarVersaoBanco() {
  if (suportaNotMaterialized !== null) return;
  try {
    const { rows } = await pool.query('SHOW server_version_num');
    suportaNotMaterialized = Number(rows[0].server_version_num) >= 120000;
  } catch (e) { suportaNotMaterialized = false; }
}
function sqlComEscopoCliente(req, sql, params = []) {
  const restrito = !vePotudo(req);
  const n = params.length + 1;
  const filtro = restrito ? `NOT cte_cancelado AND cliente = $${n}` : 'NOT cte_cancelado';
  const cte = `fretes AS ${suportaNotMaterialized ? 'NOT MATERIALIZED ' : ''}(SELECT * FROM public.fretes WHERE ${filtro})`;
  const texto = sql.trimStart();
  const novoSql = /^WITH\s/i.test(texto) ? `WITH ${cte}, ${texto.slice(5)}` : `WITH ${cte} ${texto}`;
  return { sql: novoSql, params: restrito ? [...params, textoLimpo(req.usuario?.cliente_nome) ?? null] : params };
}
async function consultaCliente(req, sql, params = []) {
  await verificarVersaoBanco();
  const q = sqlComEscopoCliente(req, sql, params);
  return pool.query(q.sql, q.params);
}

// CT-e cancelado não pode fazer nada: nem aprovar, rejeitar, glosar, editar,
// excluir, registrar canhoto ou mandar espelho. Fica só como histórico.
function bloquearCteCancelado(nomeParametro = 'id') {
  return async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT numero_cte, cte_cancelado, cte_cancelado_motivo FROM fretes WHERE id = $1', [req.params[nomeParametro]]);
      if (rows[0]?.cte_cancelado) {
        return res.status(409).json({
          erro: `O CT-e ${rows[0].numero_cte || ''} foi CANCELADO${rows[0].cte_cancelado_motivo ? ` (${rows[0].cte_cancelado_motivo})` : ''} e fica só como histórico da nota: não pode ser alterado, aprovado, faturado nem excluído.`,
        });
      }
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ erro: 'Erro ao validar o registro.' });
    }
  };
}

// Confere se um frete (pelo cliente dele) pode ser visto por esse usuário.
// Mesma limpeza que o banco aplica aos textos (< > " ' viram ‹ › ” ’), pra
// comparar nomes de cliente gravados antes e depois dela.
const textoLimpo = (t) => (t == null ? t : String(t).replace(/</g, '‹').replace(/>/g, '›').replace(/"/g, '”').replace(/'/g, '’'));
function podeVerCliente(req, cliente) {
  return vePotudo(req) || (cliente != null && textoLimpo(cliente) === textoLimpo(req.usuario?.cliente_nome));
}

// Middleware pras rotas /:id de frete: quem não vê tudo só mexe nos fretes
// do próprio cliente (se o frete não existir, deixa a rota responder 404).
function freteDoCliente(nomeParametro = 'id') {
  return async (req, res, next) => {
    if (vePotudo(req)) return next();
    try {
      const { rows } = await pool.query('SELECT cliente FROM fretes WHERE id = $1', [req.params[nomeParametro]]);
      if (rows[0] && !podeVerCliente(req, rows[0].cliente)) {
        return res.status(403).json({ erro: 'Você não tem acesso a esse registro.' });
      }
      if (req.body && req.body.cliente !== undefined && textoLimpo(req.body.cliente) !== textoLimpo(req.usuario.cliente_nome)) {
        return res.status(403).json({ erro: 'Você só pode lançar fretes do seu próprio cliente.' });
      }
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ erro: 'Erro ao validar o acesso ao registro.' });
    }
  };
}

module.exports = { textoLimpo, bloquearCteCancelado, freteDoCliente, CAMPOS_PERMISSAO, ehAdmin, vePotudo, temAlguma, permitirAlguma, consultaCliente, sqlComEscopoCliente, podeVerCliente };
