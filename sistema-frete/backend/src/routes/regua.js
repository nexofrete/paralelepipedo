// Régua de cobrança: configuração, prévia do dia, envios e exceções.
const express = require('express');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const regua = require('../faturamento/regua');

const router = express.Router();
const pode = permitirAlguma('pode_ver_financeiro');
const ver = permitirAlguma('pode_emitir_cte', 'pode_ver_financeiro');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'regua_cobranca', detalhes });
const erro = (res, err, padrao) => { if (!err.status) console.error('[régua]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const rota = (fn, padrao) => async (req, res) => { try { await fn(req, res); } catch (err) { erro(res, err, padrao); } };
const dia = (v) => String(v || '').split('-').reverse().join('/');

router.get('/config', autenticar, ver, rota(async (req, res) => res.json({ ...(await regua.config()), padrao: regua.ETAPAS_PADRAO }), 'Erro.'));
router.put('/config', autenticar, pode, rota(async (req, res) => {
  const c = await regua.salvarConfig(req.body || {});
  log(req, `Régua de cobrança ${c.ativo ? 'ligada' : 'desligada'}: etapas ${c.etapas.filter((e) => e.ativo).map((e) => e.dias).join(', ')} dia(s), ${[c.email && 'e-mail', c.whatsapp && 'WhatsApp'].filter(Boolean).join(' e ') || 'sem canal'}, às ${c.hora}h`);
  res.json(c);
}, 'Erro ao salvar.'));
router.get('/previa', autenticar, ver, rota(async (req, res) => res.json(await regua.previa({ hoje: /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : undefined })), 'Erro.'));
// Roda agora o que a régua mandaria hoje (sem esperar a hora).
router.post('/executar', autenticar, pode, rota(async (req, res) => {
  const r = await regua.processar({ usuarioNome: req.usuario.nome });
  log(req, `Rodou a régua de cobrança agora: ${r.enviados} enviado(s), ${r.erros} erro(s), ${r.sem_contato} sem contato`);
  res.json(r);
}, 'Erro ao rodar a régua.'));
router.get('/historico', autenticar, ver, rota(async (req, res) => res.json(await regua.historico({ faturaId: Number(req.query.fatura) || null, limite: req.query.limite })), 'Erro.'));
router.post('/faturas/:id(\\d+)/enviar', autenticar, ver, rota(async (req, res) => {
  const r = await regua.enviarAgora(Number(req.params.id), req.body || {}, req.usuario.nome);
  log(req, `Mandou lembrete de cobrança da fatura ${r.numero} por ${r.canal === 'whatsapp' ? 'WhatsApp' : 'e-mail'} para ${r.destino}`);
  res.json(r);
}, 'Erro ao enviar.'));
router.put('/faturas/:id(\\d+)/pausa', autenticar, pode, rota(async (req, res) => {
  const f = await regua.pausarFatura(Number(req.params.id), req.body || {});
  log(req, f.ate ? `Pausou a cobrança da fatura ${f.numero} até ${dia(f.ate)} (pagamento prometido)` : `Retomou a cobrança da fatura ${f.numero}`);
  res.json(f);
}, 'Erro.'));
router.get('/clientes', autenticar, ver, rota(async (req, res) => res.json(await regua.clientesComExcecao()), 'Erro.'));
router.put('/clientes/:doc', autenticar, pode, rota(async (req, res) => {
  const c = await regua.clienteCobranca(req.params.doc, req.body || {});
  log(req, `Cobrança do cliente ${c.razao_social || c.documento}: ${c.cobranca_pausada ? `pausada${c.cobranca_motivo ? ` (${c.cobranca_motivo})` : ''}` : 'ativa'}${c.cobranca_email ? `, e-mail ${c.cobranca_email}` : ''}${c.cobranca_whatsapp ? `, WhatsApp ${c.cobranca_whatsapp}` : ''}`);
  res.json(c);
}, 'Erro ao salvar.'));

module.exports = router;
