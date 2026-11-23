// Pátio e portaria (embarcador). Regras em src/patio.js. Acesso pela grade de telas (tela "patio").
// /api/patio-publico/:codigo é a página do motorista (sem login, só pelo código do QR).
const express = require('express');
const QRCode = require('qrcode');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const patio = require('../patio');

const router = express.Router();
const erro = (res, err, padrao) => { if (!err.status) console.error('[pátio]', err.message); res.status(err.status || 500).json({ erro: err.status ? err.message : padrao }); };
const usuario = (req) => req.usuario?.nome || 'Usuário';
const rota = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (err) { erro(res, err, 'Erro no pátio.'); } };
async function origem(req) {
  const { rows } = await pool.query('SELECT endereco_publico FROM empresa WHERE id = 1').catch(() => ({ rows: [] }));
  return String(rows[0]?.endereco_publico || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}
const linkMotorista = async (req, codigo) => `${await origem(req)}/patio.html?c=${codigo}`;

router.get('/opcoes', autenticar, (req, res) => res.json({ operacoes: patio.OPERACOES, veiculos: patio.VEICULOS, status: patio.STATUS }));
router.get('/config', autenticar, rota(() => patio.config()));
router.put('/config', autenticar, rota((req) => patio.salvarConfig(req.body || {})));
router.get('/docas', autenticar, rota((req) => patio.docas({ todas: req.query.todas === '1' })));
router.post('/docas', autenticar, rota((req) => patio.salvarDoca(null, req.body || {})));
router.put('/docas/:id(\\d+)', autenticar, rota((req) => patio.salvarDoca(Number(req.params.id), req.body || {})));
router.delete('/docas/:id(\\d+)', autenticar, rota((req) => patio.excluirDoca(Number(req.params.id))));
router.get('/painel', autenticar, rota(() => patio.painel()));
router.get('/kanban', autenticar, rota(() => patio.kanban()));
router.get('/visitas', autenticar, rota((req) => patio.listar(req.query)));
router.get('/notas', autenticar, rota((req) => patio.notasDaVisita(req, String(req.query.numeros || '').split(/[\s,;]+/))));
router.get('/visitas/:id(\\d+)', autenticar, rota(async (req) => {
  const v = await patio.visita(Number(req.params.id));
  return { ...v, eventos: await patio.eventos(v.id), link: await linkMotorista(req, v.codigo) };
}));
router.post('/visitas', autenticar, rota(async (req) => {
  const v = await patio.criar(req, req.body || {}, usuario(req), { semAgendamento: !!req.body?.sem_agendamento });
  return { ...v, link: await linkMotorista(req, v.codigo) };
}));
router.put('/visitas/:id(\\d+)', autenticar, rota((req) => patio.atualizar(req, Number(req.params.id), req.body || {}, usuario(req))));
router.post('/checkin', autenticar, rota((req) => patio.checkin(req, req.body || {}, usuario(req))));
router.post('/visitas/:id(\\d+)/chamar', autenticar, rota((req) => patio.chamar(Number(req.params.id), req.body?.doca_id, usuario(req))));
router.post('/visitas/:id(\\d+)/iniciar', autenticar, rota((req) => patio.iniciar(Number(req.params.id), usuario(req))));
router.post('/visitas/:id(\\d+)/finalizar', autenticar, rota((req) => patio.finalizar(Number(req.params.id), req.body || {}, usuario(req))));
router.post('/visitas/:id(\\d+)/saida', autenticar, rota((req) => patio.saida(Number(req.params.id), usuario(req))));
router.post('/visitas/:id(\\d+)/cancelar', autenticar, rota((req) => patio.cancelar(Number(req.params.id), req.body?.motivo, usuario(req))));
router.post('/visitas/:id(\\d+)/nao-compareceu', autenticar, rota((req) => patio.naoCompareceu(Number(req.params.id), usuario(req))));
router.post('/visitas/:id(\\d+)/voltar-fila', autenticar, rota((req) => patio.voltarFila(Number(req.params.id), usuario(req))));
router.post('/alocar', autenticar, rota(async (req) => ({ chamados: await patio.alocarFila(usuario(req)) })));
// ---------- Público (motorista) ----------
const publico = express.Router();
publico.get('/:codigo([A-Za-z0-9]{8})', async (req, res) => { try { res.json(await patio.publico(req.params.codigo)); } catch (err) { erro(res, err, 'Erro ao consultar.'); } });
publico.get('/:codigo([A-Za-z0-9]{8})/qr.svg', async (req, res) => {
  try {
    const p = await patio.publico(req.params.codigo);
    res.type('image/svg+xml').send(await QRCode.toString(await linkMotorista(req, p.codigo), { type: 'svg', margin: 1, width: 300 }));
  } catch (err) { erro(res, err, 'Erro ao gerar o QR Code.'); }
});

module.exports = router;
module.exports.publico = publico;
