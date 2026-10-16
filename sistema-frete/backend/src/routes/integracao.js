// Tela Configuração → Integração (API e ERP): chaves de API e webhooks. Só administrador.
const express = require('express');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const chaves = require('../integracao/chaves');
const webhooks = require('../integracao/webhooks');

const router = express.Router();
const rota = (fn, msg) => async (req, res) => {
  try { await fn(req, res); } catch (err) {
    if (!err.status) console.error('[integracao]', err);
    res.status(err.status || 500).json({ erro: err.status ? err.message : msg });
  }
};
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'integracao', detalhes });
const id = (req) => Number(req.params.id);

router.get('/', autenticar, apenasAdmin, rota(async (req, res) => {
  res.json({ chaves: await chaves.listar(), webhooks: await webhooks.listar(), escopos: chaves.ESCOPOS, eventos: webhooks.EVENTOS,
    rede_interna: process.env.WEBHOOK_REDE_INTERNA === '1' });
}, 'Erro ao carregar a integração.'));

router.post('/chaves', autenticar, apenasAdmin, rota(async (req, res) => {
  const r = await chaves.criar(req.body, req.usuario.nome);
  log(req, `Criou a chave de API "${r.nome}" (${r.escopos.join(', ')})`);
  res.status(201).json(r);
}, 'Erro ao criar a chave.'));
router.post('/chaves/:id(\\d+)/revogar', autenticar, apenasAdmin, rota(async (req, res) => {
  const r = await chaves.revogar(id(req));
  log(req, `Revogou a chave de API "${r.nome}"`);
  res.json({ ok: true });
}, 'Erro ao revogar.'));

router.post('/webhooks', autenticar, apenasAdmin, rota(async (req, res) => {
  const w = await webhooks.criar(req.body, req.usuario.nome);
  log(req, `Criou o webhook "${w.nome}" (${w.url})`);
  res.status(201).json(w);
}, 'Erro ao criar o webhook.'));
router.put('/webhooks/:id(\\d+)', autenticar, apenasAdmin, rota(async (req, res) => {
  const w = await webhooks.alterar(id(req), req.body);
  log(req, `Alterou o webhook "${w.nome}" (${w.url}, ${w.ativo ? 'ligado' : 'desligado'})`);
  res.json(w);
}, 'Erro ao salvar o webhook.'));
router.post('/webhooks/:id(\\d+)/segredo', autenticar, apenasAdmin, rota(async (req, res) => {
  const r = await webhooks.novoSegredo(id(req));
  log(req, `Gerou um novo segredo para o webhook ${id(req)}`);
  res.json(r);
}, 'Erro ao gerar o segredo.'));
router.delete('/webhooks/:id(\\d+)', autenticar, apenasAdmin, rota(async (req, res) => {
  await webhooks.excluir(id(req));
  log(req, `Excluiu o webhook ${id(req)}`);
  res.json({ ok: true });
}, 'Erro ao excluir.'));
router.post('/webhooks/:id(\\d+)/testar', autenticar, apenasAdmin, rota(async (req, res) => res.json(await webhooks.enviarTeste(id(req))), 'Erro ao testar.'));
router.get('/entregas', autenticar, apenasAdmin, rota(async (req, res) => res.json(await webhooks.entregas({ webhookId: Number(req.query.webhook) || null })), 'Erro.'));
router.post('/entregas/:id(\\d+)/reenviar', autenticar, apenasAdmin, rota(async (req, res) => { await webhooks.reenviar(id(req)); res.json({ ok: true }); }, 'Erro ao reenviar.'));

module.exports = router;
