// GET /api/cnpj/:cnpj — dados da Receita para preencher qualquer cadastro ao digitar o CNPJ.
// Qualquer usuário logado; até 30 consultas por minuto por usuário (o resultado fica guardado 30 dias).
const express = require('express');
const rateLimit = require('express-rate-limit');
const { autenticar } = require('../middlewareAuth');
const cnpj = require('../cnpjConsulta');

const router = express.Router();
router.get('/:doc', autenticar, rateLimit({
  windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `u${req.usuario?.id || req.ip}`,
  message: { erro: 'Muitas consultas de CNPJ seguidas. Espere um minuto.' },
}), async (req, res) => {
  try {
    const r = await cnpj.consultar(req.params.doc, { forcar: req.query.atualizar === '1' });
    if (r.naoEncontrado) return res.status(404).json({ erro: r.erro || 'CNPJ não encontrado na Receita.' });
    if (r.falhou) return res.status(502).json({ erro: r.erro });
    res.json(r);
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro ao consultar o CNPJ.' });
  }
});
module.exports = router;
