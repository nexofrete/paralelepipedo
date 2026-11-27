// Relatórios de entregas e rastreamento (tela 324) e os das telas 325 a 328. Regras em src/relatoriosEntregas.js.
// Os financeiros (tela 329) ficam em /api/relatorios-financeiros, com a permissão do financeiro. Os de operação (tela 328, romaneios da transportadora) ficam em /api/relatorios-operacao, com a permissão de quem
// trabalha com romaneios; os demais em /api/relatorios-entregas, com a de ver relatórios.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const rel = require('../relatoriosEntregas');

const erro = (res, err, padrao) => { if (!err.status) console.error('[relatórios de entregas]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); };
const TELAS = ['entregas', 'desempenho', 'nfecte', 'auditoria', 'planejamento', 'operacional'];

function montar(telas, pode) {
  const router = express.Router();
  router.get('/', autenticar, pode, (req, res) => res.json(rel.catalogo(telas.includes(req.query.tela) ? req.query.tela : telas[0])));
  router.get('/filtros', autenticar, pode, async (req, res) => {
    try { res.json(await rel.opcoesFiltro(req, telas.includes(req.query.tela) ? req.query.tela : telas[0])); } catch (err) { erro(res, err, 'Erro ao carregar os filtros.'); }
  });
  router.get('/:numero(\\d+)', autenticar, pode, async (req, res) => {
    const r = rel.RELATORIOS[Number(req.params.numero)];
    if (!r || !telas.includes(r.tela || 'entregas')) return res.status(404).json({ erro: 'Relatório não encontrado.' });
    try { res.json(await rel.rodar(req, Number(req.params.numero), req.query)); } catch (err) { erro(res, err, 'Erro ao montar o relatório.'); }
  });
  return router;
}

module.exports = montar(TELAS, permitirAlguma('pode_ver_relatorios'));
module.exports.financeiro = montar(['financeiro'], permitirAlguma('pode_ver_financeiro'));
// Relatórios de pedidos (407): quem abre a tela Pedidos (aberta a todos os usuários do embarcador, como ela).
module.exports.pedidos = montar(['pedidos'], (req, res, next) => next());
module.exports.operacao = montar(['operacao'], permitirAlguma('pode_emitir_cte', 'pode_ver_relatorios', 'pode_ver_financeiro'));
