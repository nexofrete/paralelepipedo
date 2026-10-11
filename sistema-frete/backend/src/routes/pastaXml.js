const express = require('express');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const pastaXml = require('../pastaXml');

const router = express.Router();

router.get('/configuracao', autenticar, apenasAdmin, async (req, res) => {
  try {
    res.json({ ...(await pastaXml.buscarConfiguracao()), ultimos: await pastaXml.ultimosProcessados(30) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar a configuração da pasta de XML.' });
  }
});

router.put('/configuracao', autenticar, apenasAdmin, async (req, res) => {
  try {
    const config = await pastaXml.salvarConfiguracao(req.body || {});
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'configurar_pasta_xml',
      detalhes: `Pasta monitorada de XML ${config.ativo ? 'ativada' : 'desativada'}: ${config.caminho || '—'} (a cada ${config.intervalo_minutos} min)`,
    });
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar a configuração.' });
  }
});

router.post('/executar', autenticar, apenasAdmin, async (req, res) => {
  const r = await pastaXml.executar(`manual, ${req.usuario.nome}`);
  res.status(r.ok ? 200 : 400).json(r.ok ? { mensagem: r.mensagem } : { erro: r.mensagem });
});

module.exports = router;
