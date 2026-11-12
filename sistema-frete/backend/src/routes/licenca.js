// Ativação da licença (público: a própria chave assinada é a permissão) e o
// emissor de licenças, que só existe no computador do dono do sistema.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const licenca = require('../licenca');
const { registrar } = require('../auditoria');

const router = express.Router();
const publico = (e) => ({
  ativo: e.ativo, emissao: e.emissao, situacao: e.situacao, mensagem: e.mensagem, codigo: e.codigo, cliente: e.cliente || null,
  cnpj: e.cnpj || null, validade: e.validade || null, diasRestantes: e.diasRestantes ?? null, licenciador: !!e.licenciador, contato: licenca.contato(),
  online: e.online || null,
});

// Pedido feito no próprio computador do servidor (não pela rede nem pelo túnel, que chega com X-Forwarded-For / CF-Connecting-IP).
const doProprioComputador = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)
  && !req.headers['x-forwarded-for'] && !req.headers['cf-connecting-ip'] && !req.headers['x-real-ip'];
router.get('/estado', (req, res) => {
  const e = publico(licenca.estado());
  // Diagnóstico do licenciador (pasta e arquivos): só para quem está no computador do servidor.
  if (!e.licenciador && doProprioComputador(req)) e.diagnostico_licenciador = licenca.diagnosticoLicenciador();
  res.json(e);
});

router.post('/ativar', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { erro: 'Tentativas demais. Espere alguns minutos.' } }), (req, res) => {
  try {
    const e = licenca.ativar(req.body?.chave);
    registrar({ usuarioId: null, usuarioNome: 'Ativação', acao: 'licenca_ativar', detalhes: `Sistema ativado para ${e.cliente} (CNPJ ${e.cnpj})${e.validade ? `, válido até ${e.validade}` : ''}` }).catch?.(() => {});
    res.json(publico(e));
  } catch (err) { res.status(400).json({ erro: err.message }); }
});

// Confere agora com o servidor de licenças (licença com conferência pela internet).
router.post('/conferir', autenticar, apenasAdmin, async (req, res) => {
  const r = await licenca.conferirOnline();
  res.json({ ...r, estado: publico(licenca.estado()) });
});

// ---------- Emissor de licenças (só com a chave privada neste computador) ----------
const soLicenciador = (req, res, next) => (licenca.temLicenciador() ? next() : res.status(404).json({ erro: 'Não disponível.' }));
router.get('/licenciador', autenticar, apenasAdmin, soLicenciador, (req, res) => res.json({ servidor: licenca.configLicenciador().servidor || '' }));
router.get('/emitidas', autenticar, apenasAdmin, soLicenciador, (req, res) => res.json(licenca.listarEmitidas()));
router.post('/emitir', autenticar, apenasAdmin, soLicenciador, (req, res) => {
  try {
    const l = licenca.emitir(req.body || {});
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'licenca_emitir', detalhes: `Emitiu licença para ${l.cliente} (CNPJ ${l.cnpj}, máquina ${l.maquina})${l.validade ? ` até ${l.validade}` : ''}${l.online ? ', conferida pela internet' : ''}` });
    res.json(l);
  } catch (err) { res.status(400).json({ erro: err.message }); }
});

module.exports = router;
