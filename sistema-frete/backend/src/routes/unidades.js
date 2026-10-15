// Filiais (unidades), onde está a mercadoria e manifestos de transferência.
const express = require('express');
const pool = require('../db');
const { autenticar, permitir, apenasAdmin } = require('../middlewareAuth');
const { registrar } = require('../auditoria');
const un = require('../unidades');

const unidades = express.Router();
const transferencias = express.Router();
const emitir = permitir('pode_emitir_cte');
const erro = (res, err, padrao) => { if (!err.status) console.error('[unidades]', err.message); res.status(err.status || 400).json({ erro: err.message || padrao }); };
const log = (req, acao, detalhes) => registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao, detalhes });
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- Unidades ----------------
unidades.get('/', autenticar, emitir, async (req, res) => {
  try {
    await un.garantirMatriz();
    const { rows } = await pool.query('SELECT * FROM unidades ORDER BY matriz DESC, ativa DESC, sigla');
    res.json(rows);
  } catch (err) { erro(res, err, 'Erro ao listar as unidades.'); }
});

unidades.post('/', autenticar, apenasAdmin, async (req, res) => {
  try {
    await un.garantirMatriz();
    const u = un.lerUnidade(req.body || {});
    const { rows } = await pool.query(
      `INSERT INTO unidades (sigla, nome, cidade, uf, endereco, telefone, responsavel, cidades, ativa) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [u.sigla, u.nome, u.cidade, u.uf, u.endereco, u.telefone, u.responsavel, u.cidades, u.ativa]);
    const n = await un.recalcularDestinos();
    log(req, 'unidade', `Cadastrou a unidade ${u.sigla} (${u.nome})${n ? `; ${n} CT-e passaram a ser entregues por ela` : ''}`);
    res.status(201).json({ ...rows[0], ctes_recalculados: n });
  } catch (err) { erro(res, err.code === '23505' ? Object.assign(new Error('Já existe uma unidade com essa sigla.'), { status: 409 }) : err, 'Erro ao salvar.'); }
});

unidades.put('/:id(\\d+)', autenticar, apenasAdmin, async (req, res) => {
  try {
    const u = un.lerUnidade(req.body || {});
    const { rows: atual } = await pool.query('SELECT matriz FROM unidades WHERE id = $1', [req.params.id]);
    if (!atual[0]) return res.status(404).json({ erro: 'Unidade não encontrada.' });
    if (atual[0].matriz && !u.ativa) return res.status(400).json({ erro: 'A matriz não pode ser desativada.' });
    const { rows } = await pool.query(
      `UPDATE unidades SET sigla = $2, nome = $3, cidade = $4, uf = $5, endereco = $6, telefone = $7, responsavel = $8, cidades = $9, ativa = $10 WHERE id = $1 RETURNING *`,
      [req.params.id, u.sigla, u.nome, u.cidade, u.uf, u.endereco, u.telefone, u.responsavel, u.cidades, u.ativa]);
    const n = await un.recalcularDestinos();
    log(req, 'unidade', `Alterou a unidade ${u.sigla}${n ? `; ${n} CT-e mudaram a unidade de entrega` : ''}`);
    res.json({ ...rows[0], ctes_recalculados: n });
  } catch (err) { erro(res, err.code === '23505' ? Object.assign(new Error('Já existe uma unidade com essa sigla.'), { status: 409 }) : err, 'Erro ao salvar.'); }
});

// Onde está a mercadoria: CT-e em andamento por unidade.
unidades.get('/estoque', autenticar, emitir, async (req, res) => {
  try { res.json(await un.estoque()); } catch (err) { erro(res, err, 'Erro ao montar o estoque.'); }
});

// Acerto manual (mercadoria que chegou por outro caminho, cadastro errado...).
unidades.post('/ctes/:id(\\d+)/local', autenticar, emitir, async (req, res) => {
  try {
    const atual = req.body?.unidade_atual_id === undefined ? undefined : Number(req.body.unidade_atual_id) || null;
    const destino = req.body?.unidade_destino_id === undefined ? undefined : Number(req.body.unidade_destino_id) || null;
    const { rows } = await pool.query('SELECT numero, em_transferencia_id FROM ctes_emitidos WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'CT-e não encontrado.' });
    if (atual !== undefined && rows[0].em_transferencia_id) return res.status(409).json({ erro: 'Este CT-e está numa transferência: receba a transferência no destino.' });
    if (atual !== undefined) await pool.query('UPDATE ctes_emitidos SET unidade_atual_id = $2 WHERE id = $1', [req.params.id, atual]);
    if (destino !== undefined) await pool.query('UPDATE ctes_emitidos SET unidade_destino_id = $2 WHERE id = $1', [req.params.id, destino]);
    log(req, 'unidade', `Acertou a unidade do CT-e ${rows[0].numero}${atual !== undefined ? ` (está em #${atual})` : ''}${destino !== undefined ? ` (entrega por #${destino})` : ''}`);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro.'); }
});

// ---------------- Transferências ----------------
transferencias.get('/', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, o.sigla AS origem_sigla, d.sigla AS destino_sigla,
              (SELECT COUNT(*)::int FROM transferencia_itens i WHERE i.transferencia_id = t.id) AS ctes
         FROM transferencias t JOIN unidades o ON o.id = t.origem_id JOIN unidades d ON d.id = t.destino_id
        WHERE t.status <> 'recebida' OR t.criado_em > NOW() - INTERVAL '45 days'
        ORDER BY CASE t.status WHEN 'em_transito' THEN 0 WHEN 'aberta' THEN 1 ELSE 2 END, t.criado_em DESC LIMIT 200`);
    res.json(rows);
  } catch (err) { erro(res, err, 'Erro ao listar.'); }
});

// CT-e que estão na origem e são entregues pelo destino (sugestão do manifesto).
transferencias.get('/disponiveis', autenticar, emitir, async (req, res) => {
  try {
    const origem = Number(req.query.origem) || 0; const destino = Number(req.query.destino) || 0; const ignorar = Number(req.query.transferencia) || 0;
    const { ctes } = await un.estoque();
    const { rows: presos } = await pool.query(
      `SELECT i.cte_id FROM transferencia_itens i JOIN transferencias t ON t.id = i.transferencia_id WHERE t.status = 'aberta' AND t.id <> $1`, [ignorar]);
    const ocupados = new Set(presos.map((p) => p.cte_id));
    res.json(ctes.filter((c) => c.unidade_atual_id === origem && !ocupados.has(c.id) && !c.romaneio_id)
      .map((c) => ({ ...c, sugerido: c.unidade_destino_id === destino })));
  } catch (err) { erro(res, err, 'Erro.'); }
});

transferencias.get('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try { res.json(await un.detalhe(Number(req.params.id))); } catch (err) { erro(res, err, 'Erro ao abrir.'); }
});

transferencias.post('/', autenticar, emitir, async (req, res) => {
  try {
    const t = await un.criarTransferencia(req.body || {}, req.usuario.nome);
    log(req, 'transferencia', `Montou a transferência ${t.id} com ${req.body.ctes.length} CT-e`);
    res.status(201).json({ id: t.id });
  } catch (err) { erro(res, err, 'Erro ao montar a transferência.'); }
});

transferencias.put('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try { await un.alterarTransferencia(Number(req.params.id), req.body || {}); log(req, 'transferencia', `Alterou a transferência ${req.params.id}`); res.json({ ok: true }); } catch (err) { erro(res, err, 'Erro ao salvar.'); }
});

transferencias.delete('/:id(\\d+)', autenticar, emitir, async (req, res) => {
  try {
    const { rows } = await pool.query(`DELETE FROM transferencias WHERE id = $1 AND status = 'aberta' RETURNING id`, [req.params.id]);
    if (!rows[0]) return res.status(409).json({ erro: 'Só dá para excluir transferência que ainda não saiu.' });
    log(req, 'transferencia', `Excluiu a transferência ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro ao excluir.'); }
});

transferencias.post('/:id(\\d+)/saida', autenticar, emitir, async (req, res) => {
  try {
    const n = await un.darSaida(Number(req.params.id), req.usuario.nome);
    log(req, 'transferencia', `Saída da transferência ${req.params.id}: ${n} CT-e em transferência`);
    res.json({ ok: true, ctes: n });
  } catch (err) { erro(res, err, 'Erro ao dar saída.'); }
});

// Chegada no destino: { conferencia_id } (opcional: a bipagem da descarga).
transferencias.post('/:id(\\d+)/receber', autenticar, emitir, async (req, res) => {
  try {
    const r = await un.receber(Number(req.params.id), { usuarioNome: req.usuario.nome, conferenciaId: Number(req.body?.conferencia_id) || null });
    log(req, 'transferencia', `Recebeu a transferência ${req.params.id}: ${r.ctes} CT-e na unidade${r.nao_chegaram ? `, ${r.nao_chegaram} não chegaram` : ''}`);
    res.json(r);
  } catch (err) { erro(res, err, 'Erro ao receber.'); }
});

transferencias.post('/:id(\\d+)/chegou-depois', autenticar, emitir, async (req, res) => {
  try {
    await un.chegouDepois(Number(req.params.id), Number(req.body?.cte_id), req.usuario.nome);
    log(req, 'transferencia', `Registrou a chegada atrasada do CT-e #${req.body?.cte_id} da transferência ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'Erro.'); }
});

// Manifesto de transferência para imprimir (?token=...).
transferencias.get('/:id(\\d+)/imprimir', autenticar, emitir, async (req, res) => {
  try {
    const t = await un.detalhe(Number(req.params.id));
    const { rows: emp } = await pool.query('SELECT razao_social, cnpj, logo FROM empresa WHERE id = 1');
    const e = emp[0] || {};
    const n = (v, c = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
    const tot = t.itens.reduce((s, i) => ({ vol: s.vol + i.volumes, peso: s.peso + i.peso, carga: s.carga + i.valor_carga }), { vol: 0, peso: 0, carga: 0 });
    const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Transferência ${t.id}</title><style>
      @page { size: A4 landscape; margin: 10mm; } body { font: 11px Arial, sans-serif; margin: 0; color: #000; }
      .topo { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; gap: 16px; }
      h1 { font-size: 18px; margin: 0 0 4px; } .rota { font-size: 16px; font-weight: bold; } table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #555; padding: 4px 5px; } th { background: #eee; font-size: 10px; text-align: left; } td.n { text-align: right; }
      .rodape { margin-top: 26px; display: flex; gap: 50px; } .rodape div { border-top: 1px solid #000; padding-top: 3px; min-width: 220px; text-align: center; }
      button { margin: 10px; padding: 8px 16px; } @media print { button { display: none; } }</style></head><body>
      <button onclick="window.print()">Imprimir</button>
      <div class="topo"><div>${e.logo ? `<img src="${esc(e.logo)}" alt="" style="max-height:40px;"><br>` : ''}<h1>Manifesto de transferência nº ${t.id}</h1>${esc(e.razao_social || '')}</div>
        <div><div class="rota">${esc(t.origem_sigla)} ${esc(t.origem_cidade || '')}/${esc(t.origem_uf || '')} → ${esc(t.destino_sigla)} ${esc(t.destino_cidade || '')}/${esc(t.destino_uf || '')}</div>
        Motorista: <b>${esc(t.motorista_nome || '—')}</b>${t.motorista_documento ? ` (${esc(t.motorista_documento)})` : ''} · Placa: <b>${esc(t.placa || '—')}</b>${t.veiculo ? ` · ${esc(t.veiculo)}` : ''}${t.lacre ? ` · Lacre: <b>${esc(t.lacre)}</b>` : ''}<br>
        Saída: ${quando(t.saiu_em)} · Chegada: ${quando(t.chegou_em)}</div></div>
      <table><thead><tr><th>#</th><th>CT-e</th><th>NF</th><th>Remetente</th><th>Destinatário</th><th>Cidade de entrega</th><th class="n">Vol.</th><th class="n">Peso (kg)</th><th class="n">Valor carga</th><th>Conferido</th></tr></thead><tbody>
      ${t.itens.map((i, k) => `<tr><td>${k + 1}</td><td>${esc(i.serie)}/${esc(i.numero)}</td><td>${esc(i.nfs.join(', '))}</td><td>${esc(i.remetente_nome || '')}</td><td>${esc(i.destinatario_nome || '')}</td>
        <td>${esc(i.cidade_fim || '')}/${esc(i.uf_fim || '')}</td><td class="n">${n(i.volumes)}</td><td class="n">${n(i.peso, 1)}</td><td class="n">${n(i.valor_carga, 2)}</td><td></td></tr>`).join('')}
      <tr><th colspan="6">${t.itens.length} CT-e</th><th class="n">${n(tot.vol)}</th><th class="n">${n(tot.peso, 1)}</th><th class="n">${n(tot.carga, 2)}</th><th></th></tr></tbody></table>
      ${t.observacao ? `<p><b>Observação:</b> ${esc(t.observacao)}</p>` : ''}
      <div class="rodape"><div>Conferente (origem ${esc(t.origem_sigla)})</div><div>Motorista</div><div>Conferente (destino ${esc(t.destino_sigla)})</div></div></body></html>`);
  } catch (err) { res.status(err.status || 500).send(String(err.message || 'Erro.')); }
});

module.exports = { unidades, transferencias };
