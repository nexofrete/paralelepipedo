// Tela Configuração → Integração (API e ERP): chaves de API e webhooks. Só administrador.
const express = require('express');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const chaves = require('../integracao/chaves');
const webhooks = require('../integracao/webhooks');
const planilhas = require('../integracao/planilhas');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

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

// ---------- Modelos de planilha (ERP sem API) ----------
router.get('/modelos', autenticar, apenasAdmin, rota(async (req, res) => {
  const cfg = await require('../importacaoErp').buscarConfiguracao();
  res.json({ modelos: await planilhas.listar(), campos_importacao: planilhas.CAMPOS_IMPORTACAO.map(({ campo, rotulo }) => ({ campo, rotulo })),
    recursos: Object.fromEntries(Object.entries(planilhas.RECURSOS).map(([k, r]) => [k, { rotulo: r.rotulo, data: r.data, campos: r.campos.map(([campo, titulo, tipo]) => ({ campo, titulo, tipo })) }])),
    modelo_importacao_id: cfg.modelo_id || null });
}, 'Erro ao carregar os modelos.'));
// Lê uma planilha de exemplo: colunas, sugestão do de-para e prévia convertida.
router.post('/modelos/previa', autenticar, apenasAdmin, upload.single('arquivo'), rota(async (req, res) => {
  if (!req.file) throw Object.assign(new Error('Escolha a planilha de exemplo.'), { status: 400 });
  let config = null;
  try { config = req.body?.config ? JSON.parse(req.body.config) : null; } catch { config = null; }
  res.json(planilhas.previa(req.file.buffer, req.file.originalname, config));
}, 'Não consegui ler a planilha.'));
router.post('/modelos', autenticar, apenasAdmin, rota(async (req, res) => {
  const m = await planilhas.criar(req.body, req.usuario.nome);
  log(req, `Criou o modelo de planilha "${m.nome}" (${m.tipo})`);
  res.status(201).json(m);
}, 'Erro ao salvar o modelo.'));
router.put('/modelos/:id(\\d+)', autenticar, apenasAdmin, rota(async (req, res) => {
  const m = await planilhas.alterar(id(req), req.body);
  log(req, `Alterou o modelo de planilha "${m.nome}"`);
  res.json(m);
}, 'Erro ao salvar o modelo.'));
router.delete('/modelos/:id(\\d+)', autenticar, apenasAdmin, rota(async (req, res) => {
  await planilhas.excluir(id(req));
  log(req, `Excluiu o modelo de planilha ${id(req)}`);
  res.json({ ok: true });
}, 'Erro ao excluir.'));
// Usa o modelo de importação na importação manual e na automática (vazio = formato de sempre).
router.put('/modelo-importacao', autenticar, apenasAdmin, rota(async (req, res) => {
  const mid = Number(req.body?.modelo_id) || null;
  if (mid && (await planilhas.carregar(mid)).tipo !== 'importacao') throw Object.assign(new Error('Esse modelo é de exportação.'), { status: 400 });
  await require('../importacaoErp').salvarConfiguracao({ modelo_id: mid });
  log(req, mid ? `A importação da planilha do ERP passou a usar o modelo ${mid}` : 'A importação da planilha do ERP voltou ao formato padrão');
  res.json({ ok: true });
}, 'Erro ao salvar.'));
router.get('/modelos/:id(\\d+)/exportar', autenticar, apenasAdmin, rota(async (req, res) => {
  const m = await planilhas.carregar(id(req));
  if (m.tipo !== 'exportacao') throw Object.assign(new Error('Esse modelo é de importação.'), { status: 400 });
  const r = await planilhas.exportar(m.config, { de: req.query.de, ate: req.query.ate });
  log(req, `Exportou "${m.nome}" de ${req.query.de} a ${req.query.ate} (${r.linhas} linha(s))`);
  const nome = `${String(m.nome).normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'exportacao'}-${r.nome}`;
  res.set({ 'Content-Type': r.tipo, 'Content-Disposition': `attachment; filename="${nome}"` }).send(r.conteudo);
}, 'Erro ao exportar.'));

module.exports = router;
