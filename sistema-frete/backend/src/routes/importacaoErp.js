const express = require('express');
const multer = require('multer');
const { autenticar, apenasAdmin, permitir } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const importacaoErp = require('../importacaoErp');
const importacaoMapa = require('../importacaoMapa');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

// POST /api/importacao-erp/upload  (upload manual da planilha, .xlsx)
router.post('/upload', autenticar, permitir('pode_editar_registros'), upload.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });

  try {
    const resultado = await importacaoErp.importarBuffer(req.file.buffer, req.usuario.id);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_erp',
      detalhes: `Importou planilha do ERP: ${resultado.criados} registros criados, ${resultado.atualizados} atualizados${resultado.erros.length ? `, ${resultado.erros.length} erro(s)` : ''}`,
    });
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(400).json({ erro: err.message || 'Erro ao ler a planilha. Confira se é um arquivo .xlsx válido, exportado do ERP.' });
  }
});

// POST /api/importacao-erp/mapa-carregamento  (.xls ou .xlsx)
// Preenche a Data da Coleta dos fretes pela nota fiscal.
router.post('/mapa-carregamento', autenticar, permitir('pode_editar_registros'), upload.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
  try {
    const resultado = await importacaoMapa.importarMapaBuffer(req.file.buffer);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'importar_mapa_carregamento',
      detalhes: `Importou o mapa de carregamento: ${resultado.preenchidas} data(s) de coleta preenchida(s), ${resultado.atualizadas} atualizada(s)`,
    });
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(400).json({ erro: err.message || 'Erro ao ler a planilha do mapa de carregamento.' });
  }
});

// GET /api/importacao-erp/configuracao  (admin)
// GET /api/importacao-erp/aguardando-xml — quantos pedidos da planilha esperam
// o XML, e quantos registros antigos vieram SÓ da planilha (sem XML nenhum).
router.get('/aguardando-xml', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { rows } = await require('../db').query('SELECT COUNT(*)::int AS qtd FROM erp_pendentes');
    const antigos = await importacaoErp.devolverParaAguardandoXml(true);
    res.json({ aguardando: rows[0].qtd, so_planilha: antigos.qtd });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao contar os pedidos aguardando XML.' });
  }
});

// POST /api/importacao-erp/devolver-aguardando — tira da lista os registros
// que vieram só da planilha; eles ficam esperando o XML da nota (não se perdem).
router.post('/devolver-aguardando', autenticar, apenasAdmin, async (req, res) => {
  try {
    const r = await importacaoErp.devolverParaAguardandoXml(false);
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'erp_aguardando_xml',
      detalhes: `${r.qtd} registro(s) que vieram só da planilha do ERP passaram a aguardar o XML da nota`,
    });
    res.json({ mensagem: `${r.qtd} registro(s) saíram da lista e ficam aguardando o XML da nota. Quando a NF-e de cada um chegar, ele volta com os dados da planilha.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível fazer a limpeza.' });
  }
});

router.get('/configuracao', autenticar, apenasAdmin, async (req, res) => {
  try {
    res.json(await importacaoErp.buscarConfiguracao());
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar configuração.' });
  }
});

// PUT /api/importacao-erp/configuracao  (admin)
router.put('/configuracao', autenticar, apenasAdmin, async (req, res) => {
  try {
    const config = await importacaoErp.salvarConfiguracao(req.body);
    await importacaoErp.reagendarMonitor();
    registrar({
      usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'editar_importacao_erp_config',
      detalhes: `Configurou a importação automática do ERP (${config.ativo ? 'ativada' : 'desativada'}, a cada ${config.intervalo_minutos} min)`,
    });
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar configuração.' });
  }
});

// POST /api/importacao-erp/importar-agora  (admin — força checar o arquivo configurado agora)
router.post('/importar-agora', autenticar, apenasAdmin, async (req, res) => {
  try {
    await importacaoErp.verificarEImportarSeMudou(true);
    res.json(await importacaoErp.buscarConfiguracao());
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao importar.' });
  }
});

module.exports = router;
