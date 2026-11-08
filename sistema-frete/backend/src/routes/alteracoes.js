// Histórico de alterações campo a campo (tabela "alteracoes", gravada pelos gatilhos registrar_alteracao).
// GET /api/alteracoes?tabela=&registro_id=&usuario=&campo=&de=&ate=
// Quem gerencia usuários vê tudo; quem vê um frete vê as alterações daquele frete.
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { temAlguma, vePotudo, podeVerCliente } = require('../permissoes');
const { TABELAS } = require('../contextoUsuario');

const router = express.Router();
const NOMES = { fretes: 'Frete', usuarios: 'Usuário', perfis_acesso: 'Perfil de acesso', transportadoras: 'Transportadora', parceiros: 'Parceiro', clientes: 'Cliente',
  tabelas_preco: 'Tabela de preço', tabela_preco_faixas: 'Faixa de tabela de preço', faturas_frete: 'Fatura da transportadora', faturas_transporte: 'Fatura (contas a receber)', contas_pagar: 'Conta a pagar' };

router.get('/', autenticar, async (req, res) => {
  try {
    const q = req.query;
    const tabela = TABELAS.includes(q.tabela) ? q.tabela : null;
    const registro = q.registro_id ? String(q.registro_id).slice(0, 40) : null;
    // Sem "Gerenciar usuários": só o histórico de um frete que a pessoa pode ver.
    if (!temAlguma(req, 'pode_gerenciar_usuarios')) {
      if (tabela !== 'fretes' || !registro) return res.status(403).json({ erro: 'Você não tem permissão para ver o histórico de alterações.' });
      const { rows: [f] } = await pool.query('SELECT cliente FROM fretes WHERE id::text = $1', [registro]);
      if (!f || (!vePotudo(req) && !podeVerCliente(req, f.cliente))) return res.status(403).json({ erro: 'Você não tem acesso a esse registro.' });
    }
    const cond = []; const p = [];
    const add = (sql, v) => { p.push(v); cond.push(sql.replace('?', `$${p.length}`)); };
    if (tabela) add('tabela = ?', tabela);
    if (registro) add('registro_id = ?', registro);
    if (String(q.usuario || '').trim()) add("usuario_nome ILIKE '%' || ? || '%'", String(q.usuario).trim());
    if (String(q.campo || '').trim()) add("campo ILIKE '%' || ? || '%'", String(q.campo).trim());
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.de || '')) add('quando >= ?::date', q.de);
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.ate || '')) add("quando < ?::date + INTERVAL '1 day'", q.ate);
    const { rows } = await pool.query(`SELECT id, tabela, registro_id, operacao, campo, antes, depois, usuario_id, usuario_nome, quando FROM alteracoes
      ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY quando DESC, id DESC LIMIT 1000`, p);
    res.json({ alteracoes: rows.map((r) => ({ ...r, tabela_nome: NOMES[r.tabela] || r.tabela })), tabelas: NOMES, limite: rows.length >= 1000 });
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao buscar as alterações.' }); }
});

module.exports = router;
module.exports.NOMES = NOMES;
