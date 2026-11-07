// Parceiros e redespacho (regras em src/parceiros.js): cadastro, repasse das cargas,
// conta-corrente e acerto. Operação (quem emite CT-e) cadastra e repassa; o acerto pede o financeiro.
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma, ehAdmin } = require('../permissoes');
const { registrar } = require('../auditoria');
const parceiros = require('../parceiros');

const router = express.Router();
const pode = permitirAlguma('pode_emitir_cte', 'pode_ver_financeiro');
const financeiro = permitirAlguma('pode_ver_financeiro');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'parceiros', detalhes });
const rota = (fn, padrao) => async (req, res) => {
  try { await fn(req, res); } catch (err) { if (!err.status) console.error('[parceiros]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao, ...(err.documento_vencido ? { documento_vencido: true } : {}) }); }
};
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

router.get('/', autenticar, pode, rota(async (req, res) => res.json({ parceiros: await parceiros.listar(), ufs: parceiros.UFS, servicos: parceiros.SERVICOS, documentos: Object.fromEntries(Object.entries(parceiros.DOCUMENTOS).map(([k, t]) => [k, t.nome])) }), 'Erro ao listar.'));
router.get('/ranking', autenticar, pode, rota(async (req, res) => res.json(await parceiros.ranking(req.query)), 'Erro.'));
router.post('/', autenticar, pode, rota(async (req, res) => { const p = await parceiros.salvar(null, req.body || {}); log(req, `Cadastrou o parceiro ${p.nome}`); res.status(201).json(p); }, 'Erro ao salvar.'));
router.put('/:id(\\d+)', autenticar, pode, rota(async (req, res) => { const p = await parceiros.salvar(Number(req.params.id), req.body || {}); log(req, `Alterou o parceiro ${p.nome}`); res.json(p); }, 'Erro ao salvar.'));
// Quem atende os destinos dos CT-e marcados (a sugestão do repasse).
router.post('/sugestao', autenticar, pode, rota(async (req, res) => {
  const ids = (req.body?.ctes || []).map(Number).filter(Number.isInteger);
  const { rows } = await pool.query(`SELECT id, numero, cidade_fim, uf_fim, dados->'valores'->>'vTPrest' AS frete, valor_total, dados FROM ctes_emitidos WHERE id = ANY($1::int[])`, [ids]);
  const destinos = [...new Map(rows.map((c) => [`${c.cidade_fim}/${c.uf_fim}`, c])).values()];
  const porDestino = [];
  for (const c of destinos) porDestino.push({ destino: `${c.cidade_fim}/${c.uf_fim}`, parceiros: await parceiros.sugerir(c.cidade_fim, c.uf_fim) });
  const todos = (await parceiros.listar()).filter((p) => p.ativo);
  const tabelas = await parceiros.tabelaDe(todos.map((p) => p.id));
  const peso = (c) => (c.dados?.carga?.quantidades || []).filter((q) => String(q.cUnid).padStart(2, '0') === '01').reduce((t, q) => t + Number(q.qCarga || 0), 0);
  // Custo e prazo de cada parceiro ativo para estes CT-e (pela tabela da região dele ou pelo cadastro).
  const lista = todos.map((p) => {
    const linhas = tabelas.filter((l) => l.parceiro_id === p.id);
    const prev = rows.map((c) => parceiros.previsto(p, linhas, { frete: Number(c.frete ?? c.valor_total) || 0, peso: peso(c), cidade: c.cidade_fim, uf: c.uf_fim }));
    return { id: p.id, nome: p.nome, prazo_dias: Math.max(0, ...prev.map((x) => x.prazo_dias || 0)), custo_previsto: Math.round(prev.reduce((s, x) => s + x.valor, 0) * 100) / 100,
      pela_tabela: prev.some((x) => x.origem === 'tabela'), servicos: p.servicos, impedido: p.impedido, bloqueado: p.bloqueado,
      pontualidade: p.indicadores.pontualidade, nota_geral: p.indicadores.nota_geral };
  });
  res.json({ por_destino: porDestino, parceiros: lista, servicos: parceiros.SERVICOS, admin: ehAdmin(req), frete: rows.reduce((s, c) => s + (Number(c.frete ?? c.valor_total) || 0), 0) });
}, 'Erro.'));
router.post('/:id(\\d+)/repassar', autenticar, pode, rota(async (req, res) => {
  const forcar = !!req.body?.forcar && ehAdmin(req);
  const r = await parceiros.repassar(Number(req.params.id), req.body?.ctes, req.usuario.nome, { forcar });
  if (forcar) log(req, `Liberou o repasse ao parceiro ${r.parceiro} com documento vencido`);
  log(req, `Repassou ${r.ctes} CT-e ao parceiro ${r.parceiro} (romaneio de redespacho ${r.romaneio_id}, custo previsto ${moeda(r.custo_previsto)})`);
  res.status(201).json(r);
}, 'Erro ao repassar.'));
router.get('/:id(\\d+)/extrato', autenticar, pode, rota(async (req, res) => res.json(await parceiros.extrato(Number(req.params.id), req.query)), 'Erro.'));
router.post('/:id(\\d+)/lancamentos', autenticar, financeiro, rota(async (req, res) => {
  const l = await parceiros.lancar(Number(req.params.id), req.body || {}, req.usuario.nome);
  log(req, `Lançou ${parceiros.TIPOS[l.tipo].nome} de ${moeda(l.valor)} na conta do parceiro #${req.params.id}`);
  res.status(201).json(l);
}, 'Erro ao lançar.'));
router.put('/lancamentos/:id(\\d+)', autenticar, financeiro, rota(async (req, res) => {
  const l = await parceiros.alterarValor(Number(req.params.id), req.body?.valor, req.body?.motivo);
  log(req, `Ajustou o lançamento ${l.id} do parceiro #${l.parceiro_id} para ${moeda(l.valor)}`);
  res.json(l);
}, 'Erro.'));
router.delete('/lancamentos/:id(\\d+)', autenticar, financeiro, rota(async (req, res) => { await parceiros.excluirLancamento(Number(req.params.id)); log(req, `Apagou o lançamento ${req.params.id} da conta de parceiro`); res.json({ ok: true }); }, 'Erro.'));
router.post('/:id(\\d+)/acertar', autenticar, financeiro, rota(async (req, res) => {
  const r = await parceiros.acertar(Number(req.params.id), req.body || {}, req.usuario.nome);
  log(req, `Acerto com o parceiro ${r.parceiro}: ${r.lancamentos} lançamento(s), saldo ${moeda(r.saldo)}${r.conta_pagar_id ? ' (conta a pagar lançada)' : ''}`);
  res.json(r);
}, 'Erro no acerto.'));

// ---------- Tabela por região, documentos, desempenho, avaliações e bloqueio ----------
router.get('/:id(\\d+)/tabela', autenticar, pode, rota(async (req, res) => res.json({ linhas: await parceiros.tabelaDe([Number(req.params.id)]), ufs: parceiros.UFS }), 'Erro.'));
router.put('/:id(\\d+)/tabela', autenticar, pode, rota(async (req, res) => {
  const linhas = await parceiros.salvarTabela(Number(req.params.id), req.body?.linhas);
  log(req, `Salvou a tabela de frete do parceiro #${req.params.id} (${linhas.length} linha(s))`);
  res.json({ linhas });
}, 'Erro ao salvar a tabela.'));
router.get('/:id(\\d+)/documentos', autenticar, pode, rota(async (req, res) => res.json(await parceiros.documentos(Number(req.params.id))), 'Erro.'));
router.post('/:id(\\d+)/documentos', autenticar, pode, rota(async (req, res) => {
  const d = await parceiros.salvarDocumento(Number(req.params.id), req.body || {}, req.usuario.nome);
  log(req, `Atualizou o documento "${d.nome}" do parceiro #${req.params.id}: validade ${req.body?.validade || '—'}`);
  res.status(201).json(d);
}, 'Erro ao salvar o documento.'));
router.delete('/documentos/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const d = await parceiros.excluirDocumento(Number(req.params.id));
  log(req, `Apagou o documento "${d.nome}" do parceiro #${d.parceiro_id}`);
  res.json({ ok: true });
}, 'Erro.'));
router.get('/:id(\\d+)/desempenho', autenticar, pode, rota(async (req, res) => res.json(await parceiros.desempenho(Number(req.params.id), req.query)), 'Erro.'));
router.get('/:id(\\d+)/avaliacoes', autenticar, pode, rota(async (req, res) => res.json({ avaliacoes: await parceiros.avaliacoes(Number(req.params.id)) }), 'Erro.'));
router.post('/:id(\\d+)/avaliacoes', autenticar, pode, rota(async (req, res) => {
  const a = await parceiros.avaliar(Number(req.params.id), req.body || {}, req.usuario.nome);
  log(req, `Avaliou o parceiro #${req.params.id} com nota ${a.nota}${a.cte_id ? ` (CT-e id ${a.cte_id})` : ''}`);
  res.status(201).json(a);
}, 'Erro ao avaliar.'));
router.delete('/avaliacoes/:id(\\d+)', autenticar, pode, rota(async (req, res) => { await parceiros.excluirAvaliacao(Number(req.params.id)); log(req, `Apagou a avaliação ${req.params.id} de parceiro`); res.json({ ok: true }); }, 'Erro.'));
router.get('/:id(\\d+)/bloqueios', autenticar, pode, rota(async (req, res) => res.json({ historico: await parceiros.bloqueios(Number(req.params.id)) }), 'Erro.'));
// Bloquear: quem opera. Liberar: só o administrador.
router.post('/:id(\\d+)/bloquear', autenticar, pode, rota(async (req, res) => {
  const p = await parceiros.bloquear(Number(req.params.id), req.body?.motivo, req.usuario.nome);
  log(req, `Bloqueou o parceiro ${p.nome}: ${req.body?.motivo}`);
  res.json({ ok: true });
}, 'Erro ao bloquear.'));
router.post('/:id(\\d+)/liberar', autenticar, (req, res, next) => (ehAdmin(req) ? next() : res.status(403).json({ erro: 'Só o administrador libera um parceiro bloqueado.' })), rota(async (req, res) => {
  const p = await parceiros.liberar(Number(req.params.id), req.body?.motivo, req.usuario.nome);
  log(req, `Liberou o parceiro ${p.nome}: ${req.body?.motivo}`);
  res.json({ ok: true });
}, 'Erro ao liberar.'));

module.exports = router;
