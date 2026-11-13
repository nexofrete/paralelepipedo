// Serviços da SEFAZ (regras em src/sefazServicos.js): CT-e na SEFAZ, consulta de cadastro (IE) e situação.
const express = require('express');
const { autenticar, apenasAdmin, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const s = require('../sefazServicos');

const router = express.Router();
const erro = (res, err, padrao) => { if (!err.status) console.error('[sefaz]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : (err.message || padrao) }); };
const log = (req, acao, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao, detalhes });

// CT-e na SEFAZ
router.get('/ctes', autenticar, async (req, res) => {
  try { res.json(await s.estadoCtes()); } catch (err) { erro(res, err, 'Erro ao ler a situação da busca de CT-e.'); }
});
router.post('/ctes/consultar', autenticar, permitir('pode_enviar_xml'), async (req, res) => {
  try {
    const r = await s.consultarCtes();
    log(req, 'cte_sefaz', `Buscou CT-e na SEFAZ: ${r.importados} importado(s), ${r.ja_existiam} já existia(m), ${r.eventos} evento(s), ${r.erros} com erro`);
    res.json(r);
  } catch (err) { erro(res, err, 'Erro ao buscar os CT-e na SEFAZ.'); }
});
router.put('/ctes/config', autenticar, apenasAdmin, async (req, res) => {
  try {
    const c = await s.salvarConfigCtes(req.body || {});
    log(req, 'cte_sefaz', `${c.ativo ? 'Ligou' : 'Desligou'} a busca automática de CT-e na SEFAZ${c.importar_desde ? `; importa só os emitidos desde ${c.importar_desde}` : ''}`);
    res.json(c);
  } catch (err) { erro(res, err, 'Erro ao salvar.'); }
});

router.post('/ctes/so-novos', autenticar, apenasAdmin, async (req, res) => {
  try {
    const r = await s.pularParaNovosCtes();
    log(req, 'cte_sefaz', `Busca de CT-e na SEFAZ: pulou os antigos (NSU ${r.anterior} → ${r.ult_nsu}); daqui pra frente só os novos`);
    res.json(r);
  } catch (err) { erro(res, err, 'Erro ao pular os CT-e antigos.'); }
});
router.put('/ctes/nsu', autenticar, apenasAdmin, async (req, res) => {
  try {
    const r = await s.definirNsuCtes(req.body?.nsu);
    log(req, 'cte_sefaz', `Busca de CT-e na SEFAZ passa a começar depois do NSU ${r.ult_nsu} (estava em ${r.anterior})`);
    res.json(r);
  } catch (err) { erro(res, err, 'Erro ao mudar o NSU.'); }
});

// Consulta de cadastro de contribuinte
router.get('/cadastro', autenticar, async (req, res) => {
  try {
    const r = await s.consultarCadastro({ doc: req.query.doc, uf: req.query.uf, ie: req.query.ie, forcar: req.query.forcar === '1', semRede: req.query.so_guardada === '1' });
    res.json(r ? { ...r, aviso: s.avisoDoCadastro(r, req.query.papel || 'tomador') } : null);
  } catch (err) { erro(res, err, 'Erro ao consultar o cadastro na SEFAZ.'); }
});

// Situação da SEFAZ
router.get('/status', autenticar, async (req, res) => {
  try { res.json(await s.situacao()); } catch (err) { erro(res, err, 'Erro ao ler a situação da SEFAZ.'); }
});
router.post('/status/verificar', autenticar, async (req, res) => {
  try { await s.verificarStatus(); res.json(await s.situacao()); } catch (err) { erro(res, err, 'Erro ao verificar a SEFAZ.'); }
});

module.exports = router;
