// Ordens de coleta do embarcador (Pátio e portaria » Ordens de coleta). Regras em src/ordensColeta.js.
// /api/ordem-coleta-publica/:token é a página da transportadora (sem login, só com o código do link).
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const oc = require('../ordensColeta');

const router = express.Router();
const erro = (res, err, padrao) => { if (!err.status) console.error('[ordens de coleta]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); };
const usuario = (req) => req.usuario?.nome || 'Usuário';
const rota = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (err) { erro(res, err, 'Erro na ordem de coleta.'); } };
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'ordem_coleta', detalhes });
async function origem(req) {
  const { rows } = await pool.query('SELECT endereco_publico FROM empresa WHERE id = 1').catch(() => ({ rows: [] }));
  return String(rows[0]?.endereco_publico || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}
const comLink = async (req, o) => ({ ...o, link: `${await origem(req)}/coleta.html?t=${o.token}` });
// Salvou e pediu para mandar: se o e-mail falhar, a ordem fica salva e volta com o aviso (para mandar o link de outro jeito).
const talvezEnviar = async (req, o) => {
  if (!req.body?.enviar) return comLink(req, o);
  try { return comLink(req, await oc.enviar(o.id, await origem(req), usuario(req))); } catch (e) { return { ...(await comLink(req, o)), aviso: e.message }; }
};

router.get('/', autenticar, rota((req) => oc.listar(req.query)));
router.get('/candidatas', autenticar, rota((req) => oc.candidatas(req, req.query)));
router.get('/email-transportadora', autenticar, rota(async (req) => ({ email: await oc.emailDaTransportadora(req.query.nome) })));
router.get('/:id(\\d+)', autenticar, rota(async (req) => comLink(req, await oc.buscar(Number(req.params.id)))));
router.post('/', autenticar, rota(async (req) => {
  const o = await oc.salvar(req, null, req.body || {}, usuario(req));
  log(req, `Criou a ordem de coleta ${o.id} (${o.transportadora}, ${o.notas.length} nota(s))`);
  return talvezEnviar(req, o);
}));
router.put('/:id(\\d+)', autenticar, rota(async (req) => {
  const o = await oc.salvar(req, Number(req.params.id), req.body || {}, usuario(req));
  log(req, `Alterou a ordem de coleta ${o.id}`);
  return talvezEnviar(req, o);
}));
router.post('/:id(\\d+)/enviar', autenticar, rota(async (req) => {
  const o = await oc.enviar(Number(req.params.id), await origem(req), usuario(req), { para: req.body?.para });
  log(req, `Mandou a ordem de coleta ${o.id} para ${o.email_para}`);
  return comLink(req, o);
}));
router.post('/:id(\\d+)/cancelar', autenticar, rota(async (req) => {
  const o = await oc.cancelar(Number(req.params.id), req.body?.motivo, usuario(req));
  log(req, `Cancelou a ordem de coleta ${o.id}`);
  return o;
}));
router.get('/:id(\\d+)/documento', autenticar, async (req, res) => {
  try { const o = await oc.buscar(Number(req.params.id)); res.type('html').send(await oc.documentoDe(o, `${await origem(req)}/coleta.html?t=${o.token}`)); } catch (err) { erro(res, err, 'Erro ao montar a ordem.'); }
});

const publico = express.Router();
const TOKEN = '/:token([A-Za-z0-9_-]{20,40})';
publico.get(TOKEN, async (req, res) => { try { res.json(await oc.publico(req.params.token)); } catch (err) { erro(res, err, 'Erro ao abrir a ordem de coleta.'); } });
publico.post(`${TOKEN}/aceitar`, async (req, res) => { try { res.json(await oc.aceitar(req.params.token, req.body || {})); } catch (err) { erro(res, err, 'Erro ao confirmar a coleta.'); } });
publico.post(`${TOKEN}/recusar`, async (req, res) => { try { res.json(await oc.recusar(req.params.token, req.body || {})); } catch (err) { erro(res, err, 'Erro ao recusar a coleta.'); } });
publico.get(`${TOKEN}/documento`, async (req, res) => {
  try { const o = await oc.porToken(req.params.token); res.type('html').send(await oc.documentoDe(o)); } catch (err) { erro(res, err, 'Erro ao montar a ordem.'); }
});

module.exports = router;
module.exports.publico = publico;
