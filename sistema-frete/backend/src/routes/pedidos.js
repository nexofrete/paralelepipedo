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
// Liberação comercial: e-mails de liberação em PDF (um ou vários) e a data digitada à mão em um pedido.
router.post('/liberacao-comercial/pdf', autenticar, permitir('pode_editar_registros'), upload.array('arquivos', 20), rota(async (req) => {
  if (!req.files?.length) throw Object.assign(new Error('Nenhum PDF enviado.'), { status: 400 });
  const lc = require('../liberacaoComercial');
  const resultados = [];
  for (const f of req.files) {
    try { resultados.push(await lc.importarPdf(f.buffer, req.usuario, String(f.originalname || '').slice(0, 200))); } catch (e) { resultados.push({ arquivo: f.originalname, erro: e.message }); }
  }
  const ok = resultados.filter((r) => !r.erro);
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'liberacao_comercial', detalhes: `Importou ${ok.length} e-mail(s) de liberação comercial: ${ok.reduce((t, r) => t + r.gravados, 0)} pedido(s) gravados` });
  return { resultados };
}));
// Observação do pedido (quem edita registros).
router.put('/observacao/:pedido', autenticar, permitir('pode_editar_registros'), rota(async (req) => {
  const r = await p.salvarObservacao(req.params.pedido, req.body?.texto, req.usuario);
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'observacao_pedido', detalhes: `Pedido ${r.numero_pedido}: ${r.texto ? `observação "${r.texto}"` : 'observação apagada'}` });
  return r;
}));
router.put('/liberacao-comercial/:pedido', autenticar, permitir('pode_editar_registros'), rota(async (req) => {
  const r = await require('../liberacaoComercial').salvarManual(req.params.pedido, req.body?.liberado_em, req.usuario);
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'liberacao_comercial', detalhes: `Pedido ${r.numero_pedido}: liberação comercial ${r.liberado_em ? `digitada (${r.liberado_em})` : 'apagada'}` });
  return r;
}));
router.post('/wms', autenticar, permitir('pode_editar_registros'), upload.single('arquivo'), rota(async (req) => {
  if (!req.file) throw Object.assign(new Error('Nenhum arquivo enviado.'), { status: 400 });
  const r = await require('../pedidosWms').importar(req.file.buffer);
  registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_wms', detalhes: `Importou a planilha do WMS: ${r.pedidos} pedido(s)` });
  return r;
}));
module.exports = router;
