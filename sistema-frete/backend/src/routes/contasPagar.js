// Contas a pagar e acerto de viagem (motorista próprio e terceiro/agregado).
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');
const cp = require('../contasPagar');
const ac = require('../acertos');

const contasPagar = express.Router();
const acertos = express.Router();
const financeiro = permitirAlguma('pode_ver_financeiro');
const operacao = permitirAlguma('pode_ver_financeiro', 'pode_emitir_cte');
const erro = (res, err, padrao) => { if (!err.status) console.error('[contas a pagar]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const log = (req, acao, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao, detalhes });
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- Contas a pagar ----------------
const FILTROS = {
  abertas: `c.status = 'aberta'`,
  vencidas: `c.status = 'aberta' AND c.vencimento < $1::date`,
  semana: `c.status = 'aberta' AND c.vencimento BETWEEN $1::date AND $1::date + 7`,
  pagas: `c.status = 'paga'`,
  canceladas: `c.status = 'cancelada'`,
  todas: 'TRUE',
};

contasPagar.get('/categorias', autenticar, operacao, (req, res) => res.json({ categorias: cp.CATEGORIAS, formas: cp.FORMAS }));

contasPagar.get('/', autenticar, financeiro, async (req, res) => {
  try {
    const hoje = cp.hojeBr();
    const filtro = FILTROS[req.query.filtro] ? req.query.filtro : 'abertas';
    const valores = [hoje]; const onde = ['$1::date IS NOT NULL', FILTROS[filtro]];
    if (cp.CATEGORIAS[req.query.categoria]) { valores.push(req.query.categoria); onde.push(`c.categoria = $${valores.length}`); }
    const busca = String(req.query.busca || '').trim();
    if (busca) { valores.push(`%${busca}%`); onde.push(`(c.descricao ILIKE $${valores.length} OR c.fornecedor_nome ILIKE $${valores.length} OR c.documento ILIKE $${valores.length})`); }
    if (['pagas', 'todas', 'canceladas'].includes(filtro)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.de || '')) { valores.push(req.query.de); onde.push(`COALESCE(c.pago_em, c.vencimento) >= $${valores.length}`); }
      if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || '')) { valores.push(req.query.ate); onde.push(`COALESCE(c.pago_em, c.vencimento) <= $${valores.length}`); }
    }
    const { rows } = await pool.query(
      `SELECT c.*, (c.valor - c.valor_pago) AS falta FROM contas_pagar c WHERE ${onde.join(' AND ')}
        ORDER BY ${filtro === 'pagas' ? 'c.pago_em DESC' : 'c.vencimento'}, c.id LIMIT 1000`, valores);
    const { rows: r } = await pool.query(
      `SELECT COALESCE(SUM(valor - valor_pago) FILTER (WHERE status = 'aberta' AND vencimento < $1::date), 0)::float AS vencidas,
              COUNT(*) FILTER (WHERE status = 'aberta' AND vencimento < $1::date)::int AS vencidas_qtd,
              COALESCE(SUM(valor - valor_pago) FILTER (WHERE status = 'aberta' AND vencimento = $1::date), 0)::float AS hoje,
              COALESCE(SUM(valor - valor_pago) FILTER (WHERE status = 'aberta' AND vencimento BETWEEN $1::date + 1 AND $1::date + 7), 0)::float AS semana,
              COALESCE(SUM(valor - valor_pago) FILTER (WHERE status = 'aberta'), 0)::float AS aberto,
              (SELECT COALESCE(SUM(p.valor), 0)::float FROM contas_pagar_pagamentos p WHERE p.data >= date_trunc('month', $1::date)) AS pago_mes
         FROM contas_pagar`, [hoje]);
    // Fluxo dos próximos 30 dias: o que entra (faturas) e o que sai (contas).
    const { rows: f } = await pool.query(
      `SELECT (SELECT COALESCE(SUM(valor_bruto - desconto - valor_pago), 0)::float FROM faturas_transporte WHERE status IN ('aberta', 'parcial') AND vencimento <= $1::date + 30) AS receber,
              (SELECT COALESCE(SUM(valor - valor_pago), 0)::float FROM contas_pagar WHERE status = 'aberta' AND vencimento <= $1::date + 30) AS pagar`, [hoje]).catch(() => ({ rows: [{ receber: null, pagar: null }] }));
    res.json({ contas: rows, resumo: { ...r[0], fluxo30: f[0] } });
  } catch (err) { erro(res, err, 'Erro ao listar as contas.'); }
});

contasPagar.get('/:id(\\d+)', autenticar, financeiro, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contas_pagar WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Conta não encontrada.' });
    const { rows: pg } = await pool.query('SELECT * FROM contas_pagar_pagamentos WHERE conta_id = $1 ORDER BY data, id', [req.params.id]);
    const { rows: irmas } = rows[0].grupo ? await pool.query('SELECT id, parcela, vencimento, valor, status FROM contas_pagar WHERE grupo = $1 ORDER BY vencimento', [rows[0].grupo]) : { rows: [] };
    res.json({ ...rows[0], pagamentos: pg, parcelas: irmas });
  } catch (err) { erro(res, err, 'Erro ao abrir.'); }
});

contasPagar.post('/', autenticar, financeiro, async (req, res) => {
  try {
    const criadas = await cp.criar(req.body || {}, req.usuario.nome);
    log(req, 'conta_pagar', `Lançou "${criadas[0].descricao}"${criadas.length > 1 ? ` em ${criadas.length} parcelas` : ''}: ${brl(criadas.reduce((s, c) => s + Number(c.valor), 0))}`);
    res.status(201).json(criadas);
  } catch (err) { erro(res, err, 'Erro ao lançar.'); }
});

contasPagar.put('/:id(\\d+)', autenticar, financeiro, async (req, res) => {
  try { const c = await cp.alterar(Number(req.params.id), req.body || {}); log(req, 'conta_pagar', `Alterou a conta ${c.id} (${c.descricao})`); res.json(c); } catch (err) { erro(res, err, 'Erro ao salvar.'); }
});

contasPagar.post('/:id(\\d+)/pagar', autenticar, financeiro, async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const c = await cp.pagar(Number(req.params.id), req.body || {}, req.usuario.nome, cliente);
    await cliente.query('COMMIT');
    log(req, 'conta_pagar', `Pagou ${brl(req.body?.valor || c.valor_pago)} da conta ${c.id} (${c.descricao})${c.status === 'paga' ? ' — quitada' : ''}`);
    res.json(c);
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao pagar.'); } finally { cliente.release(); }
});

contasPagar.delete('/:id(\\d+)/pagamentos/:pid(\\d+)', autenticar, financeiro, async (req, res) => {
  try { const v = await cp.estornar(Number(req.params.id), Number(req.params.pid)); log(req, 'conta_pagar', `Estornou ${brl(v)} da conta ${req.params.id}`); res.json({ ok: true }); } catch (err) { erro(res, err, 'Erro ao estornar.'); }
});

contasPagar.post('/:id(\\d+)/cancelar', autenticar, financeiro, async (req, res) => {
  try {
    const motivo = String(req.body?.motivo || '').trim().slice(0, 200);
    if (!motivo) return res.status(400).json({ erro: 'Informe o motivo.' });
    const { rows } = await pool.query(
      `UPDATE contas_pagar SET status = 'cancelada', observacao = TRIM(COALESCE(observacao, '') || E'\\nCancelada: ' || $2) WHERE id = $1 AND status = 'aberta' AND valor_pago = 0 RETURNING descricao`, [req.params.id, motivo]);
    if (!rows[0]) return res.status(409).json({ erro: 'Só dá para cancelar conta em aberto e sem pagamento (estorne antes).' });
    log(req, 'conta_pagar', `Cancelou a conta ${req.params.id} (${rows[0].descricao}): ${motivo}`);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro ao cancelar.'); }
});

// ---------------- Acerto de viagem ----------------
acertos.get('/categorias', autenticar, operacao, (req, res) => res.json(ac.CATEGORIAS));
acertos.get('/impostos', autenticar, operacao, (req, res) => res.json(ac.impostosTac(cp.valor(req.query.frete) || 0)));

acertos.get('/', autenticar, operacao, async (req, res) => {
  try {
    const filtro = ['abertos', 'acertados', 'todos'].includes(req.query.filtro) ? req.query.filtro : 'abertos';
    const onde = { abertos: `a.status = 'aberto'`, acertados: `a.status = 'acertado'`, todos: `a.status <> 'cancelado' OR a.criado_em > NOW() - INTERVAL '30 days'` }[filtro];
    const { rows } = await pool.query(
      `SELECT a.*, m.serie AS mdfe_serie, m.numero AS mdfe_numero,
              COALESCE((SELECT SUM(valor) FILTER (WHERE tipo = 'despesa') FROM acerto_lancamentos l WHERE l.acerto_id = a.id), 0)::float AS despesas,
              COALESCE((SELECT SUM(valor) FILTER (WHERE tipo = 'desconto') FROM acerto_lancamentos l WHERE l.acerto_id = a.id), 0)::float AS descontos,
              COALESCE((SELECT SUM(valor) FILTER (WHERE tipo = 'acrescimo') FROM acerto_lancamentos l WHERE l.acerto_id = a.id), 0)::float AS acrescimos
         FROM acertos a LEFT JOIN mdfes m ON m.id = a.mdfe_id WHERE ${onde} ORDER BY a.status = 'acertado', a.data_saida DESC, a.id DESC LIMIT 300`);
    res.json(rows.map((a) => ({ ...a, totais: ac.calcular(a, [{ tipo: 'despesa', valor: a.despesas }, { tipo: 'desconto', valor: a.descontos }, { tipo: 'acrescimo', valor: a.acrescimos }]) })));
  } catch (err) { erro(res, err, 'Erro ao listar os acertos.'); }
});

// MDF-e recentes para ligar ao acerto (traz placa e motorista).
acertos.get('/mdfes', autenticar, operacao, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, serie, numero, status, placa, uf_ini, uf_fim, dados->'condutores' AS condutores, COALESCE(autorizado_em, criado_em) AS data
         FROM mdfes WHERE status NOT IN ('cancelado') AND COALESCE(autorizado_em, criado_em) > NOW() - INTERVAL '60 days' ORDER BY COALESCE(autorizado_em, criado_em) DESC LIMIT 100`);
    res.json(rows);
  } catch (err) { erro(res, err, 'Erro.'); }
});

acertos.get('/:id(\\d+)', autenticar, operacao, async (req, res) => {
  try { res.json(await ac.detalhe(Number(req.params.id))); } catch (err) { erro(res, err, 'Erro ao abrir.'); }
});
acertos.post('/', autenticar, operacao, async (req, res) => {
  try {
    const a = await ac.criar(req.body || {}, req.usuario.nome);
    log(req, 'acerto', `Abriu o acerto ${a.id} (${a.tipo === 'terceiro' ? 'terceiro' : 'motorista próprio'}: ${a.motorista_nome})${Number(a.adiantamento) ? `, adiantamento ${brl(a.adiantamento)}` : ''}`);
    res.status(201).json(a);
  } catch (err) { erro(res, err, 'Erro ao salvar.'); }
});
acertos.put('/:id(\\d+)', autenticar, operacao, async (req, res) => {
  try { const a = await ac.alterar(Number(req.params.id), req.body || {}, req.usuario.nome); log(req, 'acerto', `Alterou o acerto ${a.id}`); res.json(a); } catch (err) { erro(res, err, 'Erro ao salvar.'); }
});
acertos.post('/:id(\\d+)/lancamentos', autenticar, operacao, async (req, res) => {
  try { res.status(201).json(await ac.lancar(Number(req.params.id), req.body || {})); } catch (err) { erro(res, err, 'Erro ao lançar.'); }
});
acertos.delete('/:id(\\d+)/lancamentos/:lid(\\d+)', autenticar, operacao, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM acerto_lancamentos l USING acertos a WHERE l.id = $2 AND l.acerto_id = $1 AND a.id = l.acerto_id AND a.status = 'aberto'`, [req.params.id, req.params.lid]);
    if (!rowCount) return res.status(409).json({ erro: 'Não dá para tirar este lançamento (acerto fechado?).' });
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro.'); }
});
acertos.post('/:id(\\d+)/acertar', autenticar, operacao, async (req, res) => {
  try {
    const r = await ac.acertar(Number(req.params.id), req.usuario.nome);
    log(req, 'acerto', `Fechou o acerto ${req.params.id}: saldo ${brl(r.totais.saldo)}${r.totais.saldo > 0 ? ' a pagar' : r.totais.saldo < 0 ? ' a devolver' : ''}`);
    res.json(r);
  } catch (err) { erro(res, err, 'Erro ao fechar o acerto.'); }
});
acertos.post('/:id(\\d+)/reabrir', autenticar, operacao, async (req, res) => {
  try { await ac.reabrir(Number(req.params.id)); log(req, 'acerto', `Reabriu o acerto ${req.params.id}`); res.json({ ok: true }); } catch (err) { erro(res, err, 'Erro ao reabrir.'); }
});
acertos.post('/:id(\\d+)/cancelar', autenticar, operacao, async (req, res) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(`SELECT id FROM acertos WHERE id = $1 AND status = 'aberto' FOR UPDATE`, [req.params.id]);
    if (!rows[0]) throw Object.assign(new Error('Só dá para cancelar acerto em aberto.'), { status: 409 });
    const { rows: pagos } = await cliente.query(`SELECT 1 FROM contas_pagar WHERE acerto_id = $1 AND valor_pago > 0 AND status <> 'cancelada'`, [req.params.id]);
    if (pagos.length) throw Object.assign(new Error('O adiantamento já foi pago: estorne em Contas a pagar antes de cancelar.'), { status: 409 });
    await cliente.query(`UPDATE contas_pagar SET status = 'cancelada' WHERE acerto_id = $1 AND status = 'aberta'`, [req.params.id]);
    await cliente.query(`UPDATE acertos SET status = 'cancelado' WHERE id = $1`, [req.params.id]);
    await cliente.query('COMMIT');
    log(req, 'acerto', `Cancelou o acerto ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); erro(res, err, 'Erro ao cancelar.'); } finally { cliente.release(); }
});

// Demonstrativo do acerto para o motorista assinar (?token=...).
acertos.get('/:id(\\d+)/imprimir', autenticar, operacao, async (req, res) => {
  try {
    const a = await ac.detalhe(Number(req.params.id));
    const { rows: emp } = await pool.query('SELECT razao_social, cnpj, logo FROM empresa WHERE id = 1');
    const e = emp[0] || {}; const t = a.totais;
    const dia = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10).split('-').reverse().join('/') : '');
    const linha = (rot, v, forte = false) => `<tr><td>${rot}</td><td class="n">${forte ? `<b>${brl(v)}</b>` : brl(v)}</td></tr>`;
    const nomeCat = (k) => ac.CATEGORIAS[k] || k;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Acerto de viagem ${a.id}</title><style>
      @page { size: A4; margin: 14mm; } body { font: 12px Arial, sans-serif; color: #000; margin: 0; } h1 { font-size: 18px; margin: 0 0 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; } th, td { border: 1px solid #888; padding: 4px 6px; } th { background: #eee; text-align: left; } td.n { text-align: right; }
      .topo { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 8px; } .saldo { font-size: 16px; margin-top: 12px; padding: 8px; border: 2px solid #000; }
      .ass { margin-top: 50px; display: flex; gap: 60px; } .ass div { border-top: 1px solid #000; padding-top: 3px; min-width: 240px; text-align: center; }
      button { margin: 10px 0; padding: 8px 16px; } @media print { button { display: none; } }</style></head><body>
      <button onclick="window.print()">Imprimir</button>
      <div class="topo"><div>${e.logo ? `<img src="${esc(e.logo)}" alt="" style="max-height:40px;"><br>` : ''}<h1>Acerto de viagem nº ${a.id}</h1>${esc(e.razao_social || '')}</div>
        <div style="text-align:right;">${a.tipo === 'terceiro' ? 'Frete de terceiro / agregado' : 'Motorista próprio'}<br>Saída: ${dia(a.data_saida)}${a.acertado_em ? `<br>Acertado: ${dia(a.acertado_em)}` : ''}</div></div>
      <p><b>Motorista:</b> ${esc(a.motorista_nome)}${a.motorista_cpf ? ` · CPF ${esc(a.motorista_cpf)}` : ''}${a.placa ? ` · Placa ${esc(a.placa)}` : ''}
        ${a.tipo === 'terceiro' ? `<br><b>Contratado:</b> ${esc(a.proprietario_nome || '')}${a.proprietario_doc ? ` · ${esc(a.proprietario_doc)}` : ''}${a.rntrc ? ` · RNTRC ${esc(a.rntrc)}` : ''}` : ''}
        ${a.descricao ? `<br><b>Viagem:</b> ${esc(a.descricao)}` : ''}${a.mdfe_numero ? ` · MDF-e ${esc(a.mdfe_serie)}/${esc(a.mdfe_numero)}` : ''}${a.ciot ? ` · CIOT ${esc(a.ciot)}` : ''}</p>
      ${a.lancamentos.length ? `<table><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th class="n">Valor</th></tr></thead><tbody>
        ${a.lancamentos.map((l) => `<tr><td>${dia(l.data)}</td><td>${{ despesa: 'Despesa', desconto: 'Desconto', acrescimo: 'Acréscimo' }[l.tipo]}</td><td>${esc(nomeCat(l.categoria))}</td><td>${esc(l.descricao || '')}</td><td class="n">${brl(l.valor)}</td></tr>`).join('')}</tbody></table>` : ''}
      <table style="max-width:420px; margin-left:auto;"><tbody>
        ${a.tipo === 'terceiro' ? `${linha('Frete contratado', t.frete)}${t.acrescimos ? linha('(+) Acréscimos', t.acrescimos) : ''}${t.descontos ? linha('(−) Descontos', t.descontos) : ''}
          ${Number(a.inss) ? linha('(−) INSS retido', a.inss) : ''}${Number(a.sest_senat) ? linha('(−) SEST/SENAT retido', a.sest_senat) : ''}${Number(a.irrf) ? linha('(−) IRRF retido', a.irrf) : ''}${linha('(−) Adiantamento', t.adiantamento)}`
          : `${linha('Despesas comprovadas', t.despesas)}${t.acrescimos ? linha('(+) Acréscimos', t.acrescimos) : ''}${t.descontos ? linha('(−) Descontos', t.descontos) : ''}${linha('(−) Adiantamento recebido', t.adiantamento)}`}
      </tbody></table>
      <div class="saldo">${t.saldo > 0 ? `<b>Saldo a receber pelo ${a.tipo === 'terceiro' ? 'contratado' : 'motorista'}: ${brl(t.saldo)}</b>` : t.saldo < 0 ? `<b>Saldo a devolver à empresa: ${brl(-t.saldo)}</b>` : '<b>Acerto zerado.</b>'}</div>
      ${Number(a.vale_pedagio_valor) ? `<p>Vale-pedágio: ${brl(a.vale_pedagio_valor)}${a.vale_pedagio_compra ? ` (comprovante ${esc(a.vale_pedagio_compra)})` : ''} — pago pelo contratante, não entra no frete.</p>` : ''}
      ${a.observacao ? `<p><b>Observação:</b> ${esc(a.observacao)}</p>` : ''}
      <div class="ass"><div>${esc(a.tipo === 'terceiro' ? a.proprietario_nome || a.motorista_nome : a.motorista_nome)}</div><div>${esc(e.razao_social || 'Empresa')}</div></div></body></html>`);
  } catch (err) { res.status(err.status || 500).send(String(err.message || 'Erro.')); }
});

module.exports = { contasPagar, acertos };
