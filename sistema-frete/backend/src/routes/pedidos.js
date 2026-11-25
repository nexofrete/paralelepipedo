// Pedidos (405) e Pré-notas fiscais (406), fretes contratados. Regras em src/pedidos.js.
const express = require('express');
const multer = require('multer');
const { autenticar, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const p = require('../pedidos');

const router = express.Router();
const rota = (fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) { if (!err.status) console.error('[pedidos]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro ao carregar os pedidos.' }); }
};
router.get('/', autenticar, rota((req) => p.pedidos(req, req.query)));
router.get('/pre-notas', autenticar, rota((req) => p.prenotas(req, req.query)));
// POST /api/pedidos/wms  (planilha exportada do WMS: "Número Pedido", "Status/WMS", "Data Início"...)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });
router.post('/wms', autenticar, permitir('pode_editar_registros'), upload.single('arquivo'), rota(async (req) => {
  if (!req.file) throw Object.assign(new Error('Nenhum arquivo enviado.'), { status: 400 });
  const r = await require('../pedidosWms').importar(req.file.buffer);
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_wms', detalhes: `Importou a planilha do WMS: ${r.pedidos} pedido(s)` });
  return r;
}));
module.exports = router;
