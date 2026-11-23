// Pedidos (405) e Pré-notas fiscais (406), fretes contratados. Regras em src/pedidos.js.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const p = require('../pedidos');

const router = express.Router();
const rota = (fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) { if (!err.status) console.error('[pedidos]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro ao carregar os pedidos.' }); }
};
router.get('/', autenticar, rota((req) => p.pedidos(req, req.query)));
router.get('/pre-notas', autenticar, rota((req) => p.prenotas(req, req.query)));
module.exports = router;
