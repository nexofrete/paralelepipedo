// Cotações de frete: cálculo, proposta, envio, aprovação (vira coleta) e recusa.
const express = require('express');
const pool = require('../db');
const { autenticar, permitir, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const cot = require('../cotacoes');

const router = express.Router();
const emitir = permitir('pode_emitir_cte');
const log = (req, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'cotacao', detalhes });
const erro = (res, err, padrao) => { if (!err.status) console.error('[cotacoes]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const comSituacao = (c) => ({ ...c, situacao: cot.situacao(c) });

const FILTROS = {
  abertas: `t.status IN ('aberta', 'enviada') AND t.validade >= $HOJE`,
  vencidas: `t.status IN ('aberta', 'enviada') AND t.validade < $HOJE`,
  aprovadas: `t.status = 'aprovada'`,
  recusadas: `t.status IN ('recusada', 'cancelada')`,
  todas: 'TRUE',
};

router.get('/config', autenticar, emitir, async (req, res) => {
  try {
    const e = await cot.empresa();
    res.json({ validade_dias: e.cotacao_validade_dias || 10, condicoes: e.cotacao_condicoes || '', origem: { cidade: e.municipio || '', uf: e.uf || '' } });
  } catch (err) { erro(res, err, 'Erro ao ler a configuração.'); }
});
router.put('/config', autenticar, apenasAdmin, async (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(req.body?.validade_dias, 10) || 10, 1), 180);
    await pool.query('UPDATE empresa SET cotacao_validade_dias = $1, cotacao_condicoes = $2 WHERE id = 1', [dias, String(req.body?.condicoes || '').slice(0, 4000) || null]);
    log(req, 'Alterou as condições das cotações');
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro ao salvar.'); }
});

router.post('/calcular', autenticar, emitir, async (req, res) => {
  try { res.json(await cot.calcular(req.body || {})); } catch (err) { erro(res, err, 'Erro ao calcular.'); }
});

// Lista + resumo. ?filtro=abertas&busca=
router.get('/', autenticar, emitir, async (req, res) => {
  try {
    const hoje = cot.hojeBr();
    const filtro = FILTROS[req.query.filtro] ? req.query.filtro : 'abertas';
    const valores = [hoje]; const onde = ['$1::date IS NOT NULL', FILTROS[filtro].replace(/\$HOJE/g, '$1::date')];
    const busca = String(req.query.busca || '').trim();
    if (busca) {
      valores.push(`%${busca}%`, busca.replace(/\D/g, '') || '__nada__');
      onde.push(`(t.cliente_nome ILIKE $2 OR t.destino_cidade ILIKE $2 OR t.origem_cidade ILIKE $2 OR t.cliente_doc LIKE '%' || $3 || '%' OR t.id::text = $3)`);
    }
    const { rows } = await pool.query(
      `SELECT t.*, k.status AS coleta_status FROM cotacoes t LEFT JOIN coletas k ON k.id = t.coleta_id
        WHERE ${onde.join(' AND ')} ORDER BY t.criado_em DESC LIMIT 500`, valores);
    // Resumo do mês: quanto foi cotado, aprovado e a taxa de conversão.
    const { rows: r } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE status IN ('aberta', 'enviada') AND validade >= $1::date)::int AS abertas,
              COALESCE(SUM(valor_total) FILTER (WHERE status IN ('aberta', 'enviada') AND validade >= $1::date), 0)::float AS valor_aberto,
              COUNT(*) FILTER (WHERE status IN ('aberta', 'enviada') AND validade >= $1::date AND validade <= $1::date + 2)::int AS vencendo,
              COUNT(*) FILTER (WHERE criado_em >= date_trunc('month', $1::date))::int AS mes_total,
              COUNT(*) FILTER (WHERE criado_em >= date_trunc('month', $1::date) AND status = 'aprovada')::int AS mes_aprovadas,
              COALESCE(SUM(valor_total) FILTER (WHERE criado_em >= date_trunc('month', $1::date) AND status = 'aprovada'), 0)::float AS mes_valor_aprovado,
              COUNT(*) FILTER (WHERE criado_em >= date_trunc('month', $1::date) AND status IN ('recusada', 'aprovada', 'cancelada'))::int AS mes_decididas
         FROM cotacoes`, [hoje]);
    res.json({ cotacoes: rows.map(comSituacao), resumo: r[0] });
  } catch (err) { erro(res, err, 'Erro ao listar as cotações.'); }
});

router.get('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT t.*, k.status AS coleta_status, k.cte_id FROM cotacoes t LEFT JOIN coletas k ON k.id = t.coleta_id WHERE t.id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Cotação não encontrada.' });
    const e = await cot.empresa();
    res.json({ ...comSituacao(rows[0]), whatsapp: cot.textoWhatsapp(rows[0], e) });
  } catch (err) { erro(res, err, 'Erro ao abrir a cotação.'); }
});

router.post('/', autenticar, emitir, async (req, res) => {
  try {
    const c = await cot.criar(req.body || {}, req.usuario.nome);
    log(req, `Fez a cotação ${c.id} para ${c.cliente_nome} (${c.origem_cidade}/${c.origem_uf} → ${c.destino_cidade}/${c.destino_uf}): R$ ${c.valor_total}`);
    res.status(201).json(c);
  } catch (err) { erro(res, err, 'Erro ao salvar a cotação.'); }
});

router.put('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const c = await cot.alterar(Number(req.params.id), req.body || {});
    log(req, `Alterou a cotação ${c.id}: R$ ${c.valor_total}`);
    res.json(c);
  } catch (err) { erro(res, err, 'Erro ao salvar a cotação.'); }
});

// Proposta para imprimir / salvar em PDF (?token=...).
router.get('/:id(\\d+)/proposta', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM cotacoes WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).send('Cotação não encontrada.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(cot.propostaHtml(rows[0], await cot.empresa()));
  } catch (err) { console.error(err); res.status(500).send('Erro ao montar a proposta.'); }
});

router.post('/:id(\\d+)/enviar', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM cotacoes WHERE id = $1', [req.params.id]);
    const c = rows[0];
    if (!c) throw Object.assign(new Error('Cotação não encontrada.'), { status: 404 });
    if (!['aberta', 'enviada'].includes(c.status)) throw Object.assign(new Error('Esta cotação já foi decidida.'), { status: 409 });
    const para = String(req.body?.email || c.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) throw Object.assign(new Error('Informe o e-mail do cliente.'), { status: 400 });
    const e = await cot.empresa();
    const nomeEmpresa = e.nome_fantasia || e.razao_social || 'Transportadora';
    await require('../email').enviarFatura({
      destinatarioEmail: para, copia: String(req.body?.copia || '').trim() || null,
      assunto: `Cotação de frete nº ${c.id} — ${nomeEmpresa} (${c.origem_cidade}/${c.origem_uf} → ${c.destino_cidade}/${c.destino_uf})`,
      html: cot.propostaHtml(c, e, { paraEmail: true }),
      anexos: [{ filename: `cotacao-${c.id}.html`, content: cot.propostaHtml(c, e), contentType: 'text/html; charset=utf-8' }],
    });
    await pool.query(`UPDATE cotacoes SET status = 'enviada', enviada_em = NOW(), email = COALESCE(email, $2), atualizado_em = NOW() WHERE id = $1`, [c.id, para]);
    log(req, `Enviou a cotação ${c.id} para ${para}`);
    res.json({ ok: true, para });
  } catch (err) { erro(res, err, 'Erro ao enviar.'); }
});

// Enviada por WhatsApp / em mãos (marca como enviada).
router.post('/:id(\\d+)/marcar-enviada', autenticar, emitir, async (req, res) => {
  try {
    await pool.query(`UPDATE cotacoes SET status = 'enviada', enviada_em = COALESCE(enviada_em, NOW()), atualizado_em = NOW() WHERE id = $1 AND status = 'aberta'`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro.'); }
});

router.post('/:id(\\d+)/aprovar', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE cotacoes SET status = 'aprovada', decidida_em = NOW(), motivo = NULL, atualizado_em = NOW() WHERE id = $1 AND status IN ('aberta', 'enviada') RETURNING *`, [req.params.id]);
    if (!rows[0]) return res.status(409).json({ erro: 'Esta cotação não está em aberto.' });
    log(req, `Cotação ${req.params.id} aprovada pelo cliente (R$ ${rows[0].valor_total})`);
    res.json(rows[0]);
  } catch (err) { erro(res, err, 'Erro ao aprovar.'); }
});

router.post('/:id(\\d+)/recusar', autenticar, emitir, async (req, res) => {
  try {
    const motivo = String(req.body?.motivo || '').trim().slice(0, 250);
    if (!motivo) return res.status(400).json({ erro: 'Informe o motivo (ajuda a entender por que as cotações não fecham).' });
    const status = req.body?.cancelar ? 'cancelada' : 'recusada';
    const { rowCount } = await pool.query(
      `UPDATE cotacoes SET status = $2, motivo = $3, decidida_em = NOW(), atualizado_em = NOW() WHERE id = $1 AND status IN ('aberta', 'enviada')`, [req.params.id, status, motivo]);
    if (!rowCount) return res.status(409).json({ erro: 'Esta cotação não está em aberto.' });
    log(req, `Cotação ${req.params.id} ${status}: ${motivo}`);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro.'); }
});

router.post('/:id(\\d+)/reabrir', autenticar, emitir, async (req, res) => {
  try {
    const e = await cot.empresa();
    const { rowCount } = await pool.query(
      `UPDATE cotacoes SET status = 'aberta', motivo = NULL, decidida_em = NULL, validade = GREATEST(validade, $2::date + $3::int), atualizado_em = NOW()
        WHERE id = $1 AND (status IN ('recusada', 'cancelada') OR (status = 'aprovada' AND coleta_id IS NULL) OR (status IN ('aberta', 'enviada') AND validade < $2::date))`,
      [req.params.id, cot.hojeBr(), e.cotacao_validade_dias || 10]);
    if (!rowCount) return res.status(409).json({ erro: 'Não dá para reabrir esta cotação.' });
    log(req, `Reabriu a cotação ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro.'); }
});

module.exports = router;
