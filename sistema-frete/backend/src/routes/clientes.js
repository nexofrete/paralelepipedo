// Cadastro de clientes (montado pelo XML da NF-e; dá pra corrigir à mão).
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');

const router = express.Router();
const podeVer = permitirAlguma('pode_gerenciar_transportadoras', 'pode_editar_registros', 'pode_ver_todos');
const podeEditar = permitirAlguma('pode_gerenciar_transportadoras', 'pode_editar_registros');
const EDITAVEIS = ['razao_social', 'nome_fantasia', 'ie', 'ind_ie', 'email', 'telefone', 'logradouro', 'numero', 'complemento',
  'bairro', 'municipio', 'uf', 'cep', 'observacoes'];

// GET /api/clientes?q=texto&pagina=1 -> { total, clientes: [...] } (com nº de notas e o último frete)
router.get('/', autenticar, podeVer, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
    const valores = [];
    let where = '';
    if (q) {
      valores.push(`%${q}%`, q.replace(/\D/g, '') || '__nada__');
      where = `WHERE c.razao_social ILIKE $1 OR c.nome_fantasia ILIKE $1 OR c.municipio ILIKE $1 OR c.ie ILIKE $1 OR c.documento LIKE '%' || $2 || '%'`;
    }
    const { rows: tot } = await pool.query(`SELECT COUNT(*)::int AS n FROM clientes c ${where}`, valores);
    const { rows } = await pool.query(
      `SELECT c.*, (SELECT COUNT(*)::int FROM fretes f WHERE f.cliente_documento = c.documento AND f.frete_principal_id IS NULL) AS qtd_notas
         FROM clientes c ${where}
        ORDER BY c.razao_social NULLS LAST LIMIT 100 OFFSET ${(pagina - 1) * 100}`, valores);
    res.json({ total: tot[0].n, pagina, clientes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar os clientes.' });
  }
});

// GET /api/clientes/:id -> cliente + resumo dos fretes dele
router.get('/:id(\\d+)', autenticar, podeVer, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Cliente não encontrado.' });
    const { rows: resumo } = await pool.query(
      `SELECT COUNT(*)::int AS notas, COALESCE(SUM(COALESCE(valor_total_cte, valor_frete_negociado)), 0)::float AS frete_total,
              COALESCE(SUM(valor_faturado), 0)::float AS faturado_total, MAX(data_emissao_nf) AS ultima_nota
         FROM fretes WHERE cliente_documento = $1 AND frete_principal_id IS NULL
          AND COALESCE(status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')`, [rows[0].documento]);
    res.json({ ...rows[0], resumo: resumo[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar o cliente.' });
  }
});

// PUT /api/clientes/:id -> correção à mão (as próximas NF-e não desfazem)
router.put('/:id(\\d+)', autenticar, podeEditar, async (req, res) => {
  try {
    const campos = Object.keys(req.body || {}).filter((c) => EDITAVEIS.includes(c));
    if (!campos.length) return res.status(400).json({ erro: 'Nada para salvar.' });
    const sets = campos.map((c, i) => `${c} = $${i + 2}`);
    const valores = campos.map((c) => {
      let v = req.body[c] === '' ? null : req.body[c];
      if (v != null && c === 'uf') v = String(v).toUpperCase().slice(0, 2);
      if (v != null && c === 'cep') v = String(v).replace(/\D/g, '');
      return v;
    });
    const { rows } = await pool.query(
      `UPDATE clientes SET ${sets.join(', ')}, editado_manual = TRUE, atualizado_em = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...valores]);
    if (!rows[0]) return res.status(404).json({ erro: 'Cliente não encontrado.' });
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_cliente',
      detalhes: `Editou o cliente ${rows[0].razao_social || ''} (${rows[0].documento || ''}): ${campos.join(', ')}` });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar o cliente.' });
  }
});

module.exports = router;
