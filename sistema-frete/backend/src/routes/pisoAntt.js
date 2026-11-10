// Piso mínimo de frete da ANTT (src/pisoAntt.js): coeficientes, cálculo e distância.
const express = require('express');
const multer = require('multer');
const { autenticar, permitir } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const piso = require('../pisoAntt');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const consulta = permitirAlguma('pode_ver_financeiro', 'pode_emitir_cte', 'pode_gerenciar_tabelas_preco');
const editar = permitir('pode_gerenciar_tabelas_preco');
const erro = (res, err, padrao) => { if (!err.status) console.error('[piso-antt]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };

// Coeficientes cadastrados, a resolução e as listas (tabelas, tipos, eixos).
router.get('/', autenticar, consulta, async (req, res) => {
  try { res.json(await piso.situacao()); } catch (err) { erro(res, err, 'Erro ao ler os coeficientes.'); }
});
// GET /api/piso-antt/calcular?tabela=A&tipo_carga=carga_geral&eixos=5&km=600&retorno_vazio=true&km_retorno=600
router.get('/calcular', autenticar, consulta, async (req, res) => {
  try {
    const q = req.query;
    const r = await piso.calcular({ ...q, retorno_vazio: q.retorno_vazio === 'true' || q.retorno_vazio === '1' });
    res.status(r.erro ? 400 : 200).json(r);
  } catch (err) { erro(res, err, 'Erro no cálculo do piso.'); }
});
// GET /api/piso-antt/distancia?origem_cidade=&origem_uf=&destino_cidade=&destino_uf=
router.get('/distancia', autenticar, consulta, async (req, res) => {
  try { res.json(await piso.distancia(req.query)); } catch (err) { erro(res, err, 'Não consegui calcular a distância.'); }
});
router.get('/historico', autenticar, consulta, async (req, res) => {
  try { res.json(await piso.historico()); } catch (err) { erro(res, err, 'Erro ao ler o histórico.'); }
});
router.get('/modelo', autenticar, consulta, async (req, res) => {
  try {
    const buf = await piso.modelo();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="coeficientes-piso-antt.xlsx"');
    res.send(buf);
  } catch (err) { erro(res, err, 'Erro ao gerar a planilha.'); }
});
// Lê a planilha (ou o texto colado) e devolve as linhas para conferir; não grava.
router.post('/ler', autenticar, editar, upload.single('arquivo'), async (req, res) => {
  try { res.json(piso.lerPlanilha({ buffer: req.file?.buffer, texto: req.body?.texto })); } catch (err) { erro(res, { message: 'Não consegui ler a planilha. Use o modelo (.xlsx) ou cole as colunas do Excel.', status: 400 }); }
});
// Grava a lista inteira de coeficientes + resolução e vigência.
router.put('/', autenticar, editar, express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const r = await piso.salvar(req.body || {}, req.usuario.nome);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'piso_antt',
      detalhes: `Gravou ${r.gravados} coeficiente(s) do piso mínimo da ANTT${r.config.resolucao ? ` (${r.config.resolucao}, vigência ${String(r.config.vigencia).split('-').reverse().join('/')})` : ''}` });
    res.json(r);
  } catch (err) { erro(res, err, 'Erro ao gravar os coeficientes.'); }
});

module.exports = router;
