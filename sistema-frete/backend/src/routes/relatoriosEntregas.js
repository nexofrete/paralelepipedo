// Relatórios de entregas e rastreamento (tela 324). Regras em src/relatoriosEntregas.js.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const rel = require('../relatoriosEntregas');

const router = express.Router();
const pode = permitirAlguma('pode_ver_relatorios');
const erro = (res, err, padrao) => { if (!err.status) console.error('[relatórios de entregas]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); };

router.get('/', autenticar, pode, (req, res) => res.json(rel.catalogo(['desempenho', 'nfecte'].includes(req.query.tela) ? req.query.tela : 'entregas')));
router.get('/:numero(\\d+)', autenticar, pode, async (req, res) => {
  try { res.json(await rel.rodar(req, Number(req.params.numero), req.query)); } catch (err) { erro(res, err, 'Erro ao montar o relatório.'); }
});

module.exports = router;
