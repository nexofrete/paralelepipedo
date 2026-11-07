// GNRE (regras em src/gnre.js): CT-e com ICMS devido a outra UF sem guia, dados para o
// Portal GNRE, registro da guia (linha digitável e PDF) e a conta a pagar dela.
const express = require('express');
const multer = require('multer');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar: auditar } = require('../auditoria');
const gnre = require('../gnre');

const router = express.Router();
const pode = permitirAlguma('pode_ver_financeiro');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, fields: 20 } });
const log = (req, detalhes) => auditar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'gnre', detalhes });
const rota = (fn, padrao) => async (req, res) => {
  try { await fn(req, res); } catch (err) { if (!err.status) console.error('[gnre]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); }
};
const ids = (v) => String(v || '').split(',').map(Number).filter(Number.isInteger);

router.get('/', autenticar, pode, rota(async (req, res) => res.json(await gnre.pendentes()), 'Erro.'));
router.get('/guias', autenticar, pode, rota(async (req, res) => res.json(await gnre.guias(req.query)), 'Erro.'));
router.get('/config', autenticar, pode, rota(async (req, res) => res.json({ ...(await gnre.config()), ufs: gnre.UFS }), 'Erro.'));
router.put('/config', autenticar, pode, rota(async (req, res) => { const c = await gnre.salvarConfig(req.body || {}); log(req, `GNRE: UFs com inscrição estadual ${c.ufs_ie.join(', ') || '(nenhuma)'}`); res.json(c); }, 'Erro ao salvar.'));
router.get('/ficha', autenticar, pode, rota(async (req, res) => res.json(await gnre.ficha(ids(req.query.ctes))), 'Erro.'));
router.get('/ficha/imprimir', autenticar, pode, async (req, res) => {
  try { res.set('Content-Type', 'text/html; charset=utf-8').send(gnre.fichaHtml(await gnre.ficha(ids(req.query.ctes)))); } catch (err) { res.status(err.status || 400).send(String(err.message).replace(/</g, '&lt;')); }
});
router.get('/linha', autenticar, pode, rota(async (req, res) => res.json(gnre.lerCodigo(req.query.linha)), 'Erro.'));
router.post('/guias', autenticar, pode, upload.single('arquivo'), rota(async (req, res) => {
  const b = req.body || {};
  const g = await gnre.registrar({ ...b, cte_ids: ids(b.cte_ids), valor_diferente: b.valor_diferente === 'true' }, req.file?.buffer, req.usuario);
  log(req, `Registrou a GNRE ${g.uf_favorecida} de R$ ${Number(g.valor).toFixed(2)} (${g.ctes} CT-e, conta a pagar #${g.conta_pagar_id})`);
  res.status(201).json(g);
}, 'Erro ao registrar a guia.'));
router.post('/guias/:id(\\d+)/anexo', autenticar, pode, upload.single('arquivo'), rota(async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Escolha o arquivo.' });
  await gnre.anexar(Number(req.params.id), req.body?.campo === 'comprovante' ? 'comprovante' : 'arquivo', req.file.buffer);
  return res.json({ ok: true });
}, 'Erro ao anexar.'));
router.get('/guias/:id(\\d+)/arquivo', autenticar, pode, async (req, res) => {
  try { require('../utils/arquivoSeguro').servir(res, await gnre.caminhoArquivo(Number(req.params.id), req.query.campo)); } catch (err) { res.status(err.status || 404).send('Sem arquivo.'); }
});
router.post('/guias/:id(\\d+)/cancelar', autenticar, pode, rota(async (req, res) => {
  await gnre.cancelar(Number(req.params.id), req.body?.motivo);
  log(req, `Cancelou a GNRE #${req.params.id}: ${req.body?.motivo || ''}`);
  res.json({ ok: true });
}, 'Erro ao cancelar.'));

module.exports = router;
