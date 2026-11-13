// Contestação de frete em lote com a transportadora e glosas por motivo (src/contestacoes.js).
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { ehAdmin, vePotudo, temAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const ct = require('../contestacoes');

const router = express.Router();
// Junta CT-e de vários clientes: só quem vê todos os fretes.
const podeVer = (req, res, next) => (ehAdmin(req) || (vePotudo(req) && temAlguma(req, 'pode_aprovar_pagamento', 'pode_ver_auditoria', 'pode_conferir_fatura'))
  ? next() : res.status(403).json({ erro: 'Você não tem permissão para ver as contestações.' }));
const podeMexer = (req, res, next) => (ehAdmin(req) || (vePotudo(req) && temAlguma(req, 'pode_aprovar_pagamento'))
  ? next() : res.status(403).json({ erro: 'Só quem aprova pagamento pode contestar fretes.' }));
const rota = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e.status) return res.status(e.status).json({ erro: e.message });
    if (e.message && /e-mail|SMTP|smtp|mail/i.test(e.message)) return res.status(400).json({ erro: `Não foi possível enviar o e-mail: ${e.message}` });
    console.error('[contestacoes]', e);
    res.status(500).json({ erro: 'Erro nas contestações.' });
  }
};
const log = (req, acao, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao, detalhes });

router.get('/motivos', autenticar, (req, res) => res.json({ motivos: ct.MOTIVOS, situacoes: ct.SITUACOES }));
router.get('/resumo-motivos', autenticar, podeVer, rota(async (req, res) => res.json(await ct.resumoMotivos(req.query))));
router.get('/notas', autenticar, podeVer, rota(async (req, res) => res.json(await require('../notaTransportadora').gerar(req, req.query))));
router.get('/resultado', autenticar, podeVer, rota(async (req, res) => res.json(await require('../resultadoAuditoria').gerar(req, req.query))));
router.get('/padroes', autenticar, podeVer, rota(async (req, res) => res.json(await require('../padroesAuditoria').analisar(req.query))));
router.get('/situacao', autenticar, podeVer, rota(async (req, res) => res.json(await ct.situacao(String(req.query.transportadora || '')))));
router.get('/candidatos', autenticar, podeVer, rota(async (req, res) => res.json(await ct.candidatos(req.query))));
router.get('/creditos', autenticar, podeVer, rota(async (req, res) => {
  const pool = require('../db');
  res.json({ creditos: await ct.creditosPendentes(pool, String(req.query.transportadora || '')) });
}));
router.get('/', autenticar, podeVer, rota(async (req, res) => res.json(await ct.listar(req.query))));
router.get('/:id(\\d+)', autenticar, podeVer, rota(async (req, res) => res.json(await ct.detalhe(Number(req.params.id)))));
router.get('/:id(\\d+)/planilha', autenticar, podeVer, rota(async (req, res) => {
  const c = await ct.detalhe(Number(req.params.id));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="contestacao-${c.id}.xlsx"`);
  res.send(ct.planilha(c));
}));
router.post('/', autenticar, podeMexer, rota(async (req, res) => {
  const c = await ct.criar(req.body || {}, req.usuario.nome);
  log(req, 'criar_contestacao', `Contestação nº ${c.id} — ${c.transportadora}: ${c.itens.length} CT-e, R$ ${Number(c.valor_contestado).toFixed(2)}`);
  res.status(201).json(c);
}));
// Endereço que vai no link da transportadora: o público da empresa, ou o deste acesso.
async function baseLink(req) {
  const { rows } = await require('../db').query('SELECT endereco_publico FROM empresa WHERE id = 1');
  return String(rows[0]?.endereco_publico || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}
const ehLocal = (u) => /\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u);
router.get('/:id(\\d+)/link', autenticar, podeVer, rota(async (req, res) => {
  const base = await baseLink(req);
  res.json({ link: await ct.linkResposta(Number(req.params.id), base), local: ehLocal(base), base });
}));
// Endereço público do sistema (o mesmo do link de rastreio): só o administrador.
router.put('/endereco-publico', autenticar, rota(async (req, res) => {
  if (!ehAdmin(req)) return res.status(403).json({ erro: 'Só o administrador muda o endereço público.' });
  const v = String(req.body?.endereco || '').trim().replace(/\/+$/, '');
  if (v && !/^https?:\/\/[^\s/]+/i.test(v)) return res.status(400).json({ erro: 'Informe o endereço começando com https://' });
  const pool = require('../db');
  await pool.query('INSERT INTO empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  await pool.query('UPDATE empresa SET endereco_publico = $1 WHERE id = 1', [v || null]);
  log(req, 'editar_empresa', `Endereço público do sistema: ${v || '(vazio)'}`);
  res.json({ endereco: v || null });
}));
router.post('/:id(\\d+)/enviar', autenticar, podeMexer, rota(async (req, res) => {
  const c = await ct.enviar(Number(req.params.id), req.usuario.nome, req.body?.email, await baseLink(req));
  log(req, 'enviar_contestacao', `Enviou a contestação nº ${c.id} para ${c.email_para}`);
  res.json(c);
}));
router.post('/:id(\\d+)/marcar-enviada', autenticar, podeMexer, rota(async (req, res) => {
  const c = await ct.marcarEnviada(Number(req.params.id), req.usuario.nome);
  log(req, 'enviar_contestacao', `Marcou a contestação nº ${c.id} como enviada (fora do sistema)`);
  res.json(c);
}));
router.post('/:id(\\d+)/resposta', autenticar, podeMexer, rota(async (req, res) => {
  const c = await ct.responder(Number(req.params.id), req.body || {}, req.usuario.nome);
  log(req, 'responder_contestacao', `Resposta da contestação nº ${c.id}: ${ct.SITUACOES[c.status]}, aceito R$ ${Number(c.valor_aceito || 0).toFixed(2)} de R$ ${Number(c.valor_contestado).toFixed(2)}`);
  res.json(c);
}));
router.post('/:id(\\d+)/cancelar', autenticar, podeMexer, rota(async (req, res) => {
  await ct.cancelar(Number(req.params.id), req.usuario.nome);
  log(req, 'cancelar_contestacao', `Cancelou a contestação nº ${req.params.id}`);
  res.json({ ok: true });
}));

module.exports = router;
