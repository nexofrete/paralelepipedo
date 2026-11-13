// Página pública da contestação (public/contestacao.html): a transportadora abre pelo link do e-mail,
// sem login, e responde CT-e por CT-e. O código do link (48 caracteres aleatórios) é a única chave.
const express = require('express');
const ct = require('../contestacoes');

const router = express.Router();
const rota = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e.status) return res.status(e.status).json({ erro: e.message });
    console.error('[contestacao publica]', e);
    res.status(500).json({ erro: 'Não foi possível concluir. Tente de novo em instantes.' });
  }
};
router.get('/:token', rota(async (req, res) => res.json(await ct.publico(req.params.token))));
router.post('/:token', rota(async (req, res) => res.json(await ct.responderPortal(req.params.token, req.body || {}))));

module.exports = router;
