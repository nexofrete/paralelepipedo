// Pagamento eletrônico de frete: CIOT e vale-pedágio do acerto com terceiro (pef/pef.js).
const express = require('express');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const pef = require('../pef/pef');

const router = express.Router();
const operacao = permitirAlguma('pode_ver_financeiro', 'pode_emitir_cte');
const erro = (res, err, padrao) => { if (!err.status) console.error('[ciot]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'ciot', detalhes });

router.get('/config', autenticar, operacao, async (req, res) => {
  try { res.json({ config: await pef.config(), provedores: pef.provedores() }); } catch (err) { erro(res, err, 'Erro ao ler a configuração.'); }
});
router.put('/config', autenticar, apenasAdmin, async (req, res) => {
  try { const c = await pef.salvarConfig(req.body || {}); log(req, `Configurou o CIOT: provedor ${c.provedor} (${c.ambiente})`); res.json(c); } catch (err) { erro(res, err, 'Erro ao salvar.'); }
});
router.get('/acertos/:id(\\d+)', autenticar, operacao, async (req, res) => {
  try { res.json(await pef.situacao(Number(req.params.id))); } catch (err) { erro(res, err, 'Erro ao consultar o CIOT.'); }
});
router.post('/acertos/:id(\\d+)/declarar', autenticar, operacao, async (req, res) => {
  try {
    const r = await pef.declarar(Number(req.params.id), req.body || {}, req.usuario.nome);
    log(req, `Declarou o CIOT ${r.ciot} do acerto ${req.params.id} (${r.provedor}${r.simulado ? ', simulado' : ''})`);
    res.json(r);
  } catch (err) { erro(res, err, 'Erro ao declarar o CIOT.'); }
});
router.post('/acertos/:id(\\d+)/vale-pedagio', autenticar, operacao, async (req, res) => {
  try {
    const r = await pef.comprarValePedagio(Number(req.params.id), req.body || {}, req.usuario.nome);
    log(req, `Comprou vale-pedágio ${r.vp_numero} (R$ ${Number(r.vp_valor).toFixed(2)}) para o acerto ${req.params.id}`);
    res.json(r);
  } catch (err) { erro(res, err, 'Erro ao comprar o vale-pedágio.'); }
});
router.post('/acertos/:id(\\d+)/encerrar', autenticar, operacao, async (req, res) => {
  try {
    const r = await pef.encerrar(Number(req.params.id), req.body || {});
    if (!r) return res.status(409).json({ erro: 'Não há CIOT aberto neste acerto.' });
    log(req, `Encerrou o CIOT ${r.ciot} do acerto ${req.params.id}`);
    res.json(r);
  } catch (err) { erro(res, err, 'Erro ao encerrar o CIOT.'); }
});
router.post('/acertos/:id(\\d+)/cancelar', autenticar, operacao, async (req, res) => {
  try {
    const r = await pef.cancelar(Number(req.params.id), req.body?.motivo);
    log(req, `Cancelou o CIOT do acerto ${req.params.id}: ${req.body?.motivo}`);
    res.json(r);
  } catch (err) { erro(res, err, 'Erro ao cancelar o CIOT.'); }
});

module.exports = router;
