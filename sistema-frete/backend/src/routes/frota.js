// Frota: abastecimentos, manutenções, planos preventivos e painel de custo por km.
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma, temAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const frota = require('../frota');

const router = express.Router();
const pode = permitirAlguma('pode_emitir_cte', 'pode_ver_financeiro');
// Pagamento à vista vira conta paga no caixa/banco: só quem cuida do financeiro.
const pagaAgora = (req) => req.body?.pagamento === 'a_vista' && !temAlguma(req, 'pode_ver_financeiro');
const negarPagamento = (res) => res.status(403).json({ erro: 'Pagamento à vista lança a saída no caixa/banco: precisa da permissão do financeiro. Lance "a prazo" ou peça para o financeiro.' });
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'frota', detalhes });
const erro = (res, err, padrao) => { if (!err.status) console.error('[frota]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const rota = (fn, padrao) => async (req, res) => { try { await fn(req, res); } catch (err) { erro(res, err, padrao); } };
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

router.get('/catalogo', autenticar, pode, rota(async (req, res) => {
  const { rows: veiculos } = await pool.query('SELECT id, placa, tipo, descricao, km_atual, km_atualizado_em, consumo_referencia, ativo FROM veiculos ORDER BY ativo DESC, tipo, placa');
  const { rows: motoristas } = await pool.query('SELECT id, nome FROM motoristas WHERE ativo ORDER BY nome');
  const { rows: acertos } = await pool.query(
    `SELECT id, motorista_nome, placa, descricao, data_saida FROM acertos WHERE status = 'aberto' AND tipo = 'proprio' ORDER BY data_saida DESC LIMIT 100`);
  res.json({ veiculos, motoristas, acertos, combustiveis: frota.COMBUSTIVEIS, pagamentos: frota.PAGAMENTOS, status: frota.STATUS_MANUT, modelos: frota.MODELOS_PLANO });
}, 'Erro.'));

// Km atual e consumo esperado do veículo (ajuste manual).
router.put('/veiculos/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const km = req.body?.km_atual === '' || req.body?.km_atual == null ? null : Number(String(req.body.km_atual).split(',')[0].replace(/\D/g, ''));
  const ref = req.body?.consumo_referencia === '' || req.body?.consumo_referencia == null ? null : Number(String(req.body.consumo_referencia).replace(',', '.'));
  if (ref != null && !(ref > 0 && ref < 50)) throw Object.assign(new Error('Consumo de referência em km/l (ex.: 2,8 para um truck).'), { status: 400 });
  const { rows } = await pool.query(
    `UPDATE veiculos SET km_atual = COALESCE($2, km_atual), km_atualizado_em = CASE WHEN $2 IS NULL THEN km_atualizado_em ELSE CURRENT_DATE END, consumo_referencia = $3
      WHERE id = $1 RETURNING id, placa, km_atual, consumo_referencia`, [req.params.id, km, ref]);
  if (!rows[0]) return res.status(404).json({ erro: 'Veículo não encontrado.' });
  log(req, `Ajustou o veículo ${rows[0].placa}: km ${rows[0].km_atual ?? '—'}, consumo de referência ${rows[0].consumo_referencia ?? '—'} km/l`);
  return res.json(rows[0]);
}, 'Erro.'));

router.get('/painel', autenticar, pode, rota(async (req, res) => res.json(await frota.painel(req.query)), 'Erro ao montar o painel.'));

// ---- Abastecimentos ----
router.get('/abastecimentos', autenticar, pode, rota(async (req, res) => res.json(await frota.listarAbastecimentos(req.query)), 'Erro ao listar.'));
router.post('/abastecimentos', autenticar, pode, rota(async (req, res) => {
  if (pagaAgora(req)) return negarPagamento(res);
  const a = await frota.criarAbastecimento(req.body || {}, req.usuario.nome);
  log(req, `Abastecimento ${a.placa}: ${a.litros} L de ${frota.COMBUSTIVEIS[a.combustivel]} por ${moeda(a.valor_total)}${a.km != null ? ` (km ${a.km})` : ''} — ${frota.PAGAMENTOS[a.pagamento]}`);
  res.status(201).json(a);
}, 'Erro ao lançar o abastecimento.'));
router.delete('/abastecimentos/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const a = await frota.excluirAbastecimento(Number(req.params.id));
  log(req, `Excluiu o abastecimento de ${a.placa} de ${String(a.data instanceof Date ? a.data.toISOString() : a.data).slice(0, 10)} (${moeda(a.valor_total)})`);
  res.json({ ok: true });
}, 'Erro ao excluir.'));

// ---- Manutenções ----
router.get('/manutencoes', autenticar, pode, rota(async (req, res) => res.json(await frota.listarManutencoes(req.query)), 'Erro ao listar.'));
router.post('/manutencoes', autenticar, pode, rota(async (req, res) => {
  if (pagaAgora(req)) return negarPagamento(res);
  const m = await frota.criarManutencao(req.body || {}, req.usuario.nome);
  log(req, `Manutenção ${m.id} (${frota.STATUS_MANUT[m.status]}): ${m.descricao} — ${moeda(m.valor_total)}`);
  res.status(201).json(m);
}, 'Erro ao salvar a manutenção.'));
router.put('/manutencoes/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  if (pagaAgora(req)) return negarPagamento(res);
  const m = await frota.alterarManutencao(Number(req.params.id), req.body || {}, req.usuario.nome);
  log(req, `Manutenção ${m.id} ${m.status === 'concluida' ? 'concluída' : 'alterada'}: ${m.descricao} — ${moeda(m.valor_total)}`);
  res.json(m);
}, 'Erro ao salvar a manutenção.'));
router.post('/manutencoes/:id(\\d+)/cancelar', autenticar, pode, rota(async (req, res) => {
  const m = await frota.cancelarManutencao(Number(req.params.id));
  log(req, `Cancelou a manutenção ${m.id}: ${m.descricao}`);
  res.json(m);
}, 'Erro.'));
router.delete('/manutencoes/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const m = await frota.excluirManutencao(Number(req.params.id));
  log(req, `Excluiu a manutenção ${m.id}: ${m.descricao} (${moeda(m.valor_total)})`);
  res.json({ ok: true });
}, 'Erro ao excluir.'));

// ---- Planos preventivos ----
router.get('/planos', autenticar, pode, rota(async (req, res) => res.json(await frota.listarPlanos(req.query)), 'Erro.'));
router.post('/planos', autenticar, pode, rota(async (req, res) => {
  const p = await frota.criarPlano(req.body || {});
  if (p.length) log(req, `Plano preventivo "${p[0].item}" em ${p.length} veículo(s)`);
  res.status(201).json(p);
}, 'Erro ao salvar o plano.'));
router.put('/planos/:id(\\d+)', autenticar, pode, rota(async (req, res) => res.json(await frota.alterarPlano(Number(req.params.id), req.body || {})), 'Erro ao salvar o plano.'));
router.delete('/planos/:id(\\d+)', autenticar, pode, rota(async (req, res) => { await frota.excluirPlano(Number(req.params.id)); res.json({ ok: true }); }, 'Erro.'));

// ---------- Documentos com vencimento (src/frotaDocumentos.js) ----------
const docs = require('../frotaDocumentos');
router.get('/documentos', autenticar, pode, rota(async (req, res) => res.json(await docs.quadro()), 'Erro ao listar os documentos.'));
router.post('/documentos', autenticar, pode, rota(async (req, res) => {
  const r = await docs.salvar(req.body || {}, req.usuario.nome);
  log(req, `Atualizou o documento "${r.nome}" (${req.body?.dono_tipo} #${req.body?.dono_id}): validade ${req.body?.validade || '—'}`);
  res.status(201).json(r);
}, 'Erro ao salvar o documento.'));
router.delete('/documentos/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const r = await docs.excluir(Number(req.params.id));
  log(req, `Apagou o documento ${r.tipo} (${r.dono_tipo} #${r.dono_id})`);
  res.json({ ok: true });
}, 'Erro.'));

// ---------- Pneus (src/pneus.js) ----------
const pneus = require('../pneus');
router.get('/pneus', autenticar, pode, rota(async (req, res) => res.json(await pneus.listar(req.query)), 'Erro ao listar os pneus.'));
router.post('/pneus', autenticar, pode, rota(async (req, res) => {
  const p = await pneus.cadastrar(req.body || {}, req.usuario.nome);
  log(req, `Cadastrou o pneu ${p.numero_fogo}`);
  res.status(201).json(p);
}, 'Erro ao cadastrar o pneu.'));
router.put('/pneus/:id(\\d+)', autenticar, pode, rota(async (req, res) => res.json(await pneus.alterar(Number(req.params.id), req.body || {})), 'Erro ao salvar o pneu.'));
router.get('/pneus/:id(\\d+)', autenticar, pode, rota(async (req, res) => res.json(await pneus.historico(Number(req.params.id))), 'Erro.'));
const ACOES_PNEU = { montar: 'Montou', desmontar: 'Desmontou', rodizio: 'Fez rodízio do', recapagem: 'Mandou para recapagem o', retorno: 'Recebeu da recapagem o', sucata: 'Mandou para a sucata o', medir: 'Mediu o sulco do' };
const FUNCOES_PNEU = { montar: pneus.montar, desmontar: pneus.desmontar, rodizio: pneus.rodizio, recapagem: pneus.enviarRecapagem, retorno: pneus.retornoRecapagem, sucata: pneus.sucata, medir: pneus.medir };
router.post('/pneus/:id(\\d+)/:acao(montar|desmontar|rodizio|recapagem|retorno|sucata|medir)', autenticar, pode, rota(async (req, res) => {
  if (req.params.acao === 'retorno' && req.body?.vencimento && !temAlguma(req, 'pode_ver_financeiro')) return res.status(403).json({ erro: 'Gerar a conta a pagar da recapagem precisa da permissão do financeiro.' });
  const r = await FUNCOES_PNEU[req.params.acao](Number(req.params.id), req.body || {}, req.usuario.nome);
  const { rows } = await pool.query('SELECT numero_fogo FROM pneus WHERE id = $1', [req.params.id]);
  log(req, `${ACOES_PNEU[req.params.acao]} pneu ${rows[0]?.numero_fogo || req.params.id}${r?.placa ? ` (${r.placa} ${r.posicao})` : ''}${r?.trocou_com ? `, trocando com o ${r.trocou_com}` : ''}`);
  res.json(r || { ok: true });
}, 'Erro no pneu.'));
router.get('/veiculos/:id(\\d+)/pneus', autenticar, pode, rota(async (req, res) => res.json(await pneus.mapa(Number(req.params.id))), 'Erro.'));
router.put('/veiculos/:id(\\d+)/eixos', autenticar, pode, rota(async (req, res) => { await pneus.definirEixos(Number(req.params.id), req.body?.eixos); res.json({ ok: true }); }, 'Erro.'));

// ---------- Jornada do motorista (src/jornada.js) ----------
const jornada = require('../jornada');
router.get('/jornadas', autenticar, pode, rota(async (req, res) => res.json(await jornada.listar(req.query)), 'Erro ao listar as jornadas.'));
router.get('/jornadas/:id(\\d+)', autenticar, pode, rota(async (req, res) => res.json(await jornada.detalhe(Number(req.params.id))), 'Erro.'));
// Lança pelo escritório: nova jornada (motorista + primeira marcação) ou marcação numa jornada.
router.post('/jornadas', autenticar, pode, rota(async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query('SELECT nome, cpf FROM motoristas WHERE id = $1', [Number(b.motorista_id)]);
  if (!rows[0]) return res.status(400).json({ erro: 'Escolha o motorista.' });
  const r = await jornada.marcar({ cpf: rows[0].cpf, nome: rows[0].nome }, { tipo: b.tipo, em: b.em, origem: 'sistema', usuario: req.usuario.nome, observacao: b.observacao });
  log(req, `Lançou na jornada de ${rows[0].nome}: ${jornada.TIPOS[b.tipo]} em ${b.em}`);
  res.status(201).json(r);
}, 'Erro ao lançar a jornada.'));
router.post('/jornadas/:id(\\d+)/eventos', autenticar, pode, rota(async (req, res) => {
  const r = await jornada.incluirEvento(Number(req.params.id), req.body || {}, req.usuario.nome);
  log(req, `Ajustou a jornada ${req.params.id} de ${r.motorista_nome}: incluiu ${jornada.TIPOS[req.body?.tipo]} em ${req.body?.em}`);
  res.status(201).json(r);
}, 'Erro ao ajustar a jornada.'));
router.delete('/jornadas/eventos/:id(\\d+)', autenticar, pode, rota(async (req, res) => {
  const r = await jornada.excluirEvento(Number(req.params.id));
  log(req, `Apagou a marcação "${jornada.TIPOS[r.tipo]}" de ${new Date(r.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} da jornada ${r.jornada_id}`);
  res.json(r);
}, 'Erro.'));
router.get('/jornadas/espelho', autenticar, pode, rota(async (req, res) => {
  const { rows: [e] } = await pool.query('SELECT razao_social, cnpj FROM empresa WHERE id = 1');
  res.type('html').send(await jornada.espelho(req.query, e || {}));
}, 'Erro ao montar o espelho.'));

module.exports = router;
