const express = require('express');
const pool = require('../db');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');

const router = express.Router();

// GET /api/auditoria-config  (qualquer usuário logado pode ler — o navegador
// de todo mundo precisa saber a tolerância pra conferir as taxas igual ao servidor)
router.get('/', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM configuracao_auditoria WHERE id = 1');
    if (rows[0]) return res.json(rows[0]);
    const inserido = await pool.query('INSERT INTO configuracao_auditoria (id) VALUES (1) RETURNING *');
    res.json(inserido.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar configuração de auditoria.' });
  }
});

// PUT /api/auditoria-config  (só admin)
router.put('/', autenticar, apenasAdmin, async (req, res) => {
  try {
    const valor = Number(req.body.tolerancia_valor) || 0;
    const percentual = Number(req.body.tolerancia_percentual) || 0;
    const limiteAlcada = req.body.limite_alcada_aprovacao ? Number(req.body.limite_alcada_aprovacao) : null;
    const pctReentrega = req.body.percentual_reentrega === undefined || req.body.percentual_reentrega === ''
      ? 50 : Math.min(200, Math.max(0, Number(req.body.percentual_reentrega) || 0));

    await pool.query('INSERT INTO configuracao_auditoria (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    const { rows } = await pool.query(
      'UPDATE configuracao_auditoria SET tolerancia_valor = $1, tolerancia_percentual = $2, limite_alcada_aprovacao = $3, percentual_reentrega = $4 WHERE id = 1 RETURNING *',
      [valor, percentual, limiteAlcada, pctReentrega]
    );

    // Mudou o % da reentrega/devolução: refaz o esperado das que ainda não foram decididas.
    await pool.query(
      `UPDATE fretes f SET valor_total_calculado = ROUND(COALESCE(p.valor_total_cte, p.valor_frete_negociado) * $1 / 100, 2), atualizado_em = NOW()
         FROM fretes p
        WHERE f.frete_principal_id = p.id AND f.vinculo_cte IN ('reentrega', 'devolucao')
          AND COALESCE(f.status, 'Pendente') NOT IN ('Faturado', 'Cancelado')
          AND (f.status_aprovacao IS DISTINCT FROM 'Aprovado' OR f.aprovado_por_nome LIKE 'Sistema%')`,
      [pctReentrega]
    );

    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_auditoria_config',
      detalhes: `Definiu a margem de tolerância da auditoria: R$ ${valor.toFixed(2)} ou ${percentual}%, limite de alçada: ${limiteAlcada != null ? `R$ ${limiteAlcada.toFixed(2)}` : 'sem limite'}, reentrega/devolução: ${pctReentrega}% do CT-e original`,
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar configuração de auditoria.' });
  }
});

module.exports = router;
