const express = require('express');
const pool = require('../db');
const { autenticar, permitir } = require('../middlewareAuth');
const { permitirAlguma, consultaCliente } = require('../permissoes');
const { registrar } = require('../auditoria');

const router = express.Router();

// PUT /api/metas-frete — cria ou atualiza a meta de um mês (geral ou de uma transportadora).
router.put('/', autenticar, permitir('pode_gerenciar_tabelas_preco'), async (req, res) => {
  try {
    const { mes_referencia, transportadora, valor_meta } = req.body;
    if (!mes_referencia || !valor_meta) {
      return res.status(400).json({ erro: 'Informe o mês e o valor da meta.' });
    }
    const primeiroDiaDoMes = `${mes_referencia}-01`;

    const { rows } = await pool.query(
      `INSERT INTO metas_frete (mes_referencia, transportadora, valor_meta)
       VALUES ($1, $2, $3)
       ON CONFLICT (mes_referencia, COALESCE(transportadora, ''))
       DO UPDATE SET valor_meta = $3
       RETURNING *`,
      [primeiroDiaDoMes, transportadora || null, valor_meta]
    );

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_meta_frete',
      detalhes: `Definiu meta de ${transportadora || 'geral'} pra ${mes_referencia}: R$ ${Number(valor_meta).toFixed(2)}`,
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar a meta.' });
  }
});

// GET /api/metas-frete/comparativo?mes=2026-09 — meta x realizado daquele mês.
router.get('/comparativo', autenticar, permitirAlguma('pode_ver_financeiro'), async (req, res) => {
  try {
    const mes = req.query.mes || new Date().toISOString().slice(0, 7);
    const primeiroDiaDoMes = `${mes}-01`;

    const { rows: metas } = await pool.query(
      `SELECT transportadora, valor_meta FROM metas_frete WHERE mes_referencia = $1`,
      [primeiroDiaDoMes]
    );
    const metaGeral = metas.find((m) => !m.transportadora)?.valor_meta || null;
    const metasPorTransportadora = metas.filter((m) => m.transportadora);

    const { rows: realizado } = await consultaCliente(req, 
      `SELECT COALESCE(SUM(valor_total_frete), 0)::float AS total
       FROM fretes
       WHERE data_emissao_nf >= $1 AND data_emissao_nf < ($1::date + INTERVAL '1 month')`,
      [primeiroDiaDoMes]
    );

    const { rows: realizadoPorTransportadora } = await consultaCliente(req, 
      `SELECT transportadora_cte AS transportadora, COALESCE(SUM(valor_total_frete), 0)::float AS total
       FROM fretes
       WHERE data_emissao_nf >= $1 AND data_emissao_nf < ($1::date + INTERVAL '1 month')
         AND transportadora_cte IS NOT NULL
       GROUP BY transportadora_cte`,
      [primeiroDiaDoMes]
    );

    const porTransportadora = metasPorTransportadora.map((m) => {
      const real = realizadoPorTransportadora.find((r) => r.transportadora === m.transportadora);
      return { transportadora: m.transportadora, meta: Number(m.valor_meta), realizado: real ? real.total : 0 };
    });

    res.json({
      mes, metaGeral: metaGeral != null ? Number(metaGeral) : null,
      realizadoGeral: realizado[0].total, porTransportadora,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar o comparativo de metas.' });
  }
});

module.exports = router;
