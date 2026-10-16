// NFS-e (Padrão Nacional) do frete municipal.
const express = require('express');
const { autenticar, permitir, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const nfse = require('../nfse/nfse');
const { danfseHtml } = require('../nfse/danfse');

const router = express.Router();
const emitir = permitir('pode_emitir_cte');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'nfse', detalhes });
const erro = (res, err, padrao) => { if (!err.status) console.error('[nfse]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const rota = (fn, padrao) => async (req, res) => { try { await fn(req, res); } catch (err) { erro(res, err, padrao); } };
const rotulo = (n) => (n.numero_nfse ? `NFS-e ${n.numero_nfse}` : `NFS-e (rascunho ${n.id})`);

router.get('/config', autenticar, emitir, rota(async (req, res) => res.json(await nfse.config()), 'Erro ao ler a configuração.'));
router.put('/config', autenticar, apenasAdmin, rota(async (req, res) => {
  const c = await nfse.salvarConfig(req.body || {});
  log(req, `Configurou a NFS-e (ambiente ${c.ambiente === 1 ? 'produção' : 'homologação'}, série ${c.serie}, código ${c.cTribNac})`);
  res.json(c);
}, 'Erro ao salvar.'));

router.get('/', autenticar, emitir, rota(async (req, res) => res.json(await nfse.listar(req.query)), 'Erro ao listar.'));
router.get('/:id(\\d+)', autenticar, emitir, rota(async (req, res) => {
  const n = await nfse.carregar(req.params.id);
  if (!n) return res.status(404).json({ erro: 'NFS-e não encontrada.' });
  return res.json({ ...n, xml_dps: undefined, xml_nfse: undefined, xml_cancelamento: undefined, tem_xml: !!n.xml_nfse });
}, 'Erro ao abrir.'));

router.post('/', autenticar, emitir, rota(async (req, res) => {
  const n = await nfse.criar(req.body || {}, req.usuario.nome);
  log(req, `Rascunho de NFS-e ${n.id} para ${n.tomador_nome} (R$ ${n.valor})`);
  res.status(201).json(n);
}, 'Erro ao salvar.'));
router.put('/:id(\\d+)', autenticar, emitir, rota(async (req, res) => res.json(await nfse.alterar(Number(req.params.id), req.body || {})), 'Erro ao salvar.'));
router.delete('/:id(\\d+)', autenticar, emitir, rota(async (req, res) => { await nfse.excluir(Number(req.params.id)); res.json({ ok: true }); }, 'Erro ao excluir.'));

router.post('/do-cte/:cte(\\d+)', autenticar, emitir, rota(async (req, res) => {
  const n = await nfse.doCte(Number(req.params.cte), req.usuario.nome);
  log(req, `Transformou o rascunho de CT-e ${req.params.cte} em rascunho de NFS-e ${n.id} (frete municipal)`);
  res.status(201).json(n);
}, 'Erro.'));

router.post('/:id(\\d+)/transmitir', autenticar, emitir, rota(async (req, res) => {
  const n = await nfse.transmitir(Number(req.params.id));
  log(req, n.status === 'autorizada' ? `Emitiu a ${rotulo(n)} para ${n.tomador_nome} (R$ ${n.valor})` : `NFS-e ${n.id} ${n.status}: ${String(n.motivo || '').slice(0, 200)}`);
  res.json({ ...n, xml_dps: undefined, xml_nfse: undefined, xml_cancelamento: undefined });
}, 'Erro ao transmitir.'));

router.post('/:id(\\d+)/cancelar', autenticar, emitir, rota(async (req, res) => {
  const n = await nfse.cancelar(Number(req.params.id), { cMotivo: String(req.body?.cMotivo || '9'), xMotivo: req.body?.motivo });
  log(req, `Cancelou a ${rotulo(n)}: ${n.motivo}`);
  res.json({ ...n, xml_dps: undefined, xml_nfse: undefined, xml_cancelamento: undefined });
}, 'Erro ao cancelar.'));

router.get('/:id(\\d+)/danfse', autenticar, emitir, async (req, res) => {
  try {
    const n = await nfse.carregar(req.params.id);
    if (!n || !['autorizada', 'cancelada'].includes(n.status)) return res.status(404).send('Esta NFS-e ainda não foi autorizada.');
    const e = await nfse.empresa();
    return res.set('Content-Type', 'text/html; charset=utf-8').send(danfseHtml(n, e));
  } catch (err) { return res.status(400).send(String(err.message).replace(/</g, '&lt;')); }
});

router.get('/:id(\\d+)/xml', autenticar, emitir, async (req, res) => {
  try {
    const n = await nfse.carregar(req.params.id);
    const tipo = ['cancelamento', 'dps'].includes(req.query.tipo) ? req.query.tipo : '';
    const xml = tipo === 'cancelamento' ? n?.xml_cancelamento : tipo === 'dps' ? n?.xml_dps : n?.xml_nfse;
    if (!xml) return res.status(404).send('XML não disponível.');
    res.set({ 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="nfse-${String(n.chave || n.id).replace(/\D/g, '')}${tipo ? `-${tipo}` : ''}.xml"` });
    return res.send(xml);
  } catch (err) { return res.status(400).send('Erro ao baixar o XML.'); }
});

module.exports = router;
