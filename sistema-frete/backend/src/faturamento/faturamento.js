// Faturamento da transportadora: junta os CT-e autorizados de um tomador numa
// fatura, controla vencimento e recebimentos (baixas parciais ou totais) e
// resume o contas a receber (a vencer, vencido, recebido, por cliente).
const pool = require('../db');

const docLimpo = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const dataIso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const somarDias = (iso, dias) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

// Quem paga o frete do CT-e (tomador): documento, nome e e-mail.
function tomadorDe(d = {}) {
  const p = { 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')] || {};
  return { doc: docLimpo(p.cnpj || p.cpf), nome: p.xNome || '', email: p.email || '' };
}
// Valor que a transportadora tem a receber pelo CT-e.
const valorCte = (r) => centavos(r.dados?.valores?.vRec ?? r.dados?.valores?.vTPrest ?? r.valor_total);

// CT-e autorizados ainda sem fatura (complementares entram: também são cobrança).
async function pendentes({ de, ate, tomador } = {}) {
  const cond = ["status = 'autorizado'", 'fatura_id IS NULL'];
  const val = [];
  if (dataIso(de)) { val.push(de); cond.push(`autorizado_em::date >= $${val.length}::date`); }
  if (dataIso(ate)) { val.push(ate); cond.push(`autorizado_em::date <= $${val.length}::date`); }
  const { rows } = await pool.query(`SELECT id, serie, numero, chave, autorizado_em, valor_total, dados, demonstracao, cidade_fim, uf_fim, destinatario_nome
    FROM ctes_emitidos WHERE ${cond.join(' AND ')} ORDER BY autorizado_em, numero LIMIT 3000`, val);
  const ctes = rows.map((r) => ({ ...r, tipo: 'cte', tomador: tomadorDe(r.dados), valor: valorCte(r), tp_cte: String(r.dados?.tpCTe ?? '0'), dados: undefined }));
  // NFS-e do frete municipal também são cobradas na fatura.
  const condN = ["status = 'autorizada'", 'fatura_id IS NULL'];
  const valN = [];
  if (dataIso(de)) { valN.push(de); condN.push(`autorizada_em >= $${valN.length}::date`); }
  if (dataIso(ate)) { valN.push(ate); condN.push(`autorizada_em < $${valN.length}::date + 1`); }
  const { rows: nfses } = await pool.query(`SELECT n.*, e.municipio, e.uf FROM nfse_emitidas n CROSS JOIN (SELECT municipio, uf FROM empresa WHERE id = 1) e
    WHERE ${condN.join(' AND ')} ORDER BY autorizada_em LIMIT 3000`, valN);
  const notas = nfses.map(itemNfse);
  const condD = ["status = 'emitida'", 'fatura_id IS NULL'];
  const valD = [];
  if (dataIso(de)) { valD.push(de); condD.push(`emissao >= $${valD.length}::date`); }
  if (dataIso(ate)) { valD.push(ate); condD.push(`emissao <= $${valD.length}::date`); }
  const { rows: debitos } = await pool.query(`SELECT * FROM notas_debito WHERE ${condD.join(' AND ')} ORDER BY emissao, numero LIMIT 3000`, valD);
  return [...ctes, ...notas, ...debitos.map(itemDebito)].filter((r) => !tomador || r.tomador.doc === docLimpo(tomador));
}
// NFS-e no formato dos itens da fatura.
function itemNfse(n) {
  return {
    id: n.id, tipo: 'nfse', serie: 'NFS-e', numero: n.numero_nfse, chave: n.chave, autorizado_em: n.autorizada_em, valor: centavos(n.valor_liquido ?? n.valor),
    demonstracao: n.demonstracao, cidade_fim: n.municipio || null, uf_fim: n.uf || null, destinatario_nome: n.dados?.servico?.descricao ? 'Frete municipal' : null,
    tomador: { doc: docLimpo(n.tomador_doc), nome: n.tomador_nome || '', email: n.dados?.tomador?.email || '' }, tp_cte: '0', nfs: (n.dados?.servico?.notas || []).map((k) => Number(String(k).slice(25, 34))),
    remetente: null, iss_retido: n.iss_retido,
  };
}

// Nota de débito (paletes não devolvidos) no formato dos itens da fatura.
function itemDebito(n) {
  return {
    id: n.id, tipo: 'debito', serie: 'ND', numero: n.numero, chave: null, autorizado_em: n.emissao, valor: centavos(n.valor), demonstracao: false, cidade_fim: null, uf_fim: null,
    destinatario_nome: n.origem === 'palete' ? 'Paletes não devolvidos' : 'Nota de débito', descricao: n.descricao,
    tomador: { doc: docLimpo(n.tomador_doc), nome: n.tomador_nome || '', email: n.tomador_email || '' }, tp_cte: '0', nfs: [], remetente: null,
  };
}

// Agrupa os pendentes por tomador (para a tela "A faturar").
async function pendentesPorTomador(filtro) {
  const mapa = new Map();
  (await pendentes(filtro)).forEach((c) => {
    const k = c.tomador.doc || '—';
    const g = mapa.get(k) || { doc: c.tomador.doc, nome: c.tomador.nome, email: c.tomador.email, ctes: [], valor: 0 };
    g.ctes.push(c); g.valor = centavos(g.valor + c.valor);
    if (!g.email && c.tomador.email) g.email = c.tomador.email;
    mapa.set(k, g);
  });
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

async function carregar(id) {
  const { rows } = await pool.query('SELECT * FROM faturas_transporte WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const f = rows[0];
  const { rows: itens } = await pool.query(`SELECT id, serie, numero, chave, autorizado_em, valor_total, dados, cidade_fim, uf_fim, destinatario_nome
    FROM ctes_emitidos WHERE fatura_id = $1 ORDER BY numero`, [id]);
  const { rows: pagamentos } = await pool.query('SELECT * FROM faturas_transporte_pagamentos WHERE fatura_id = $1 ORDER BY data, id', [id]);
  const { rows: nfses } = await pool.query(`SELECT n.*, e.municipio, e.uf FROM nfse_emitidas n CROSS JOIN (SELECT municipio, uf FROM empresa WHERE id = 1) e
    WHERE n.fatura_id = $1 ORDER BY n.numero_nfse`, [id]);
  const { rows: debitos } = await pool.query('SELECT * FROM notas_debito WHERE fatura_id = $1 ORDER BY numero', [id]);
  return {
    ...f, valor_liquido: centavos(f.valor_bruto - f.desconto), saldo: centavos(f.valor_bruto - f.desconto - f.valor_pago),
    vencida: ['aberta', 'parcial'].includes(f.status) && String(f.vencimento instanceof Date ? f.vencimento.toISOString() : f.vencimento).slice(0, 10) < hoje(),
    itens: [...itens.map((r) => ({ ...r, tipo: 'cte', valor: valorCte(r), tp_cte: String(r.dados?.tpCTe ?? '0'), nfs: (r.dados?.nfes || []).map((k) => Number(String(k).slice(25, 34))), remetente: r.dados?.remetente?.xNome, dados: undefined })), ...nfses.map(itemNfse), ...debitos.map(itemDebito)],
    pagamentos,
  };
}

// Cria a fatura com os CT-e escolhidos (todos do mesmo tomador, sem fatura).
async function criar({ cteIds, nfseIds, debitoIds, vencimento, desconto = 0, observacoes = '', usuarioNome }) {
  const ids = [...new Set((cteIds || []).map(Number).filter(Number.isInteger))];
  const idsN = [...new Set((nfseIds || []).map(Number).filter(Number.isInteger))];
  const idsD = [...new Set((debitoIds || []).map(Number).filter(Number.isInteger))];
  if (!ids.length && !idsN.length && !idsD.length) throw erro('Escolha os CT-e / NFS-e da fatura.');
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT id, numero, status, fatura_id, valor_total, dados, demonstracao FROM ctes_emitidos WHERE id = ANY($1::int[]) ORDER BY numero FOR UPDATE', [ids]);
    if (rows.length !== ids.length) throw erro('Algum CT-e não foi encontrado.');
    const problema = rows.find((r) => r.status !== 'autorizado' || r.fatura_id);
    if (problema) throw erro(`O CT-e ${problema.numero} ${problema.fatura_id ? 'já está em outra fatura' : `está ${problema.status}`}.`, 409);
    const { rows: nrows } = await cliente.query('SELECT * FROM nfse_emitidas WHERE id = ANY($1::int[]) FOR UPDATE', [idsN]);
    if (nrows.length !== idsN.length) throw erro('Alguma NFS-e não foi encontrada.');
    const probN = nrows.find((r) => r.status !== 'autorizada' || r.fatura_id);
    if (probN) throw erro(`A NFS-e ${probN.numero_nfse || probN.id} ${probN.fatura_id ? 'já está em outra fatura' : `está ${probN.status}`}.`, 409);
    const { rows: drows } = await cliente.query('SELECT * FROM notas_debito WHERE id = ANY($1::int[]) FOR UPDATE', [idsD]);
    if (drows.length !== idsD.length) throw erro('Alguma nota de débito não foi encontrada.');
    const probD = drows.find((r) => r.status !== 'emitida' || r.fatura_id);
    if (probD) throw erro(`A nota de débito ${probD.numero} ${probD.fatura_id ? 'já está em outra fatura' : 'está cancelada'}.`, 409);
    const partes = [...rows.map((r) => tomadorDe(r.dados)), ...nrows.map((n) => itemNfse(n).tomador), ...drows.map((d) => itemDebito(d).tomador)];
    const tomadores = [...new Set(partes.map((p) => p.doc))];
    if (tomadores.length > 1 || !tomadores[0]) throw erro('Uma fatura é de um tomador só: os documentos escolhidos são de clientes diferentes (ou sem CNPJ/CPF do tomador).');
    const t = partes.find((x) => x.email) || partes[0];
    const bruto = centavos(rows.reduce((s, r) => s + valorCte(r), 0) + nrows.reduce((s, n) => s + itemNfse(n).valor, 0) + drows.reduce((s, d) => s + itemDebito(d).valor, 0));
    const desc = centavos(desconto);
    if (desc < 0 || desc >= bruto) throw erro('O desconto tem que ser menor que o valor da fatura.');
    const { rows: emp } = await cliente.query('SELECT fatura_proximo_numero, fatura_prazo_dias FROM empresa WHERE id = 1 FOR UPDATE');
    const { rows: maior } = await cliente.query('SELECT COALESCE(MAX(numero), 0) AS n FROM faturas_transporte');
    const numero = Math.max(Number(emp[0]?.fatura_proximo_numero) || 1, Number(maior[0].n) + 1);
    const venc = dataIso(vencimento) || somarDias(hoje(), Number(emp[0]?.fatura_prazo_dias) || 15);
    const { rows: [f] } = await cliente.query(
      `INSERT INTO faturas_transporte (numero, tomador_doc, tomador_nome, tomador_email, emissao, vencimento, valor_bruto, desconto, observacoes, demonstracao, criado_por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [numero, tomadores[0], t.nome, t.email || null, hoje(), venc, bruto, desc, String(observacoes || '').slice(0, 2000) || null, [...rows, ...nrows].some((r) => r.demonstracao), usuarioNome || null]);
    await cliente.query('UPDATE ctes_emitidos SET fatura_id = $1 WHERE id = ANY($2::int[])', [f.id, ids]);
    await cliente.query('UPDATE nfse_emitidas SET fatura_id = $1 WHERE id = ANY($2::int[])', [f.id, idsN]);
    await cliente.query('UPDATE notas_debito SET fatura_id = $1 WHERE id = ANY($2::int[])', [f.id, idsD]);
    await cliente.query('UPDATE empresa SET fatura_proximo_numero = $1 WHERE id = 1', [numero + 1]);
    await cliente.query('COMMIT');
    return carregar(f.id);
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}

// Fatura todos os CT-e pendentes do período: uma fatura por tomador.
async function faturarPeriodo({ de, ate, vencimento, usuarioNome }) {
  const grupos = (await pendentesPorTomador({ de, ate })).filter((g) => g.doc);
  const criadas = [];
  for (const g of grupos) {
    criadas.push(await criar({ cteIds: g.ctes.filter((c) => c.tipo === 'cte').map((c) => c.id), nfseIds: g.ctes.filter((c) => c.tipo === 'nfse').map((c) => c.id), debitoIds: g.ctes.filter((c) => c.tipo === 'debito').map((c) => c.id), vencimento, usuarioNome }));
  }
  return criadas;
}

async function atualizarSituacao(cliente, id) {
  const { rows: [f] } = await cliente.query(
    `UPDATE faturas_transporte f SET valor_pago = COALESCE((SELECT SUM(valor) FROM faturas_transporte_pagamentos p WHERE p.fatura_id = f.id), 0) WHERE id = $1 RETURNING *`, [id]);
  const liquido = centavos(f.valor_bruto - f.desconto);
  const status = Number(f.valor_pago) >= liquido - 0.004 ? 'paga' : Number(f.valor_pago) > 0 ? 'parcial' : 'aberta';
  await cliente.query('UPDATE faturas_transporte SET status = $2 WHERE id = $1', [id, status]);
}

// Baixa (recebimento). Juros/multa entram como valor acima do saldo.
// Trava a fatura até o fim da transação: dois recebimentos/estornos/cancelamentos
// ao mesmo tempo (clique duplo, baixa manual + conciliação + retorno do banco)
// esperam um pelo outro e conferem a situação de novo.
async function travar(cliente, id) {
  const { rows: [f] } = await cliente.query('SELECT id, status, valor_bruto, desconto, valor_pago FROM faturas_transporte WHERE id = $1 FOR UPDATE', [id]);
  if (!f) throw erro('Fatura não encontrada.', 404);
  return { ...f, saldo: centavos(f.valor_bruto - f.desconto - f.valor_pago) };
}

// Baixa (recebimento). Juros/multa entram como valor acima do saldo.
// origem_chave: identifica um pagamento externo (boleto no retorno do banco) — o mesmo não baixa duas vezes.
async function receber(id, { data, valor, forma = 'pix', observacao, usuarioNome, conta_bancaria_id: contaId, origem_chave: origemChave = null }) {
  const formas = ['pix', 'boleto', 'deposito', 'dinheiro', 'cheque', 'outro'];
  const cliente = await pool.connect();
  let pagamentoId = null;
  try {
    await cliente.query('BEGIN');
    const f = await travar(cliente, id);
    if (f.status === 'cancelada') throw erro('Fatura cancelada não recebe pagamento.');
    if (f.status === 'paga') throw erro('Essa fatura já está paga.', 409);
    const v = centavos(valor ?? f.saldo);
    if (!(v > 0)) throw erro('Informe o valor recebido.');
    const f2 = formas.includes(forma) ? forma : 'outro';
    const banco = await require('../bancos/padrao').contaDoLancamento(contaId, f2, cliente);
    const { rows: [pg] } = await cliente.query('INSERT INTO faturas_transporte_pagamentos (fatura_id, data, valor, forma, observacao, usuario_nome, conta_bancaria_id, origem_chave) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [id, dataIso(data) || hoje(), v, f2, String(observacao || '').slice(0, 255) || null, usuarioNome || null, banco, origemChave]);
    pagamentoId = pg.id;
    await atualizarSituacao(cliente, id);
    await cliente.query('COMMIT');
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    if (e.code === '23505' && origemChave) throw erro('Este pagamento já foi baixado antes.', 409);
    throw e;
  } finally { cliente.release(); }
  return { ...(await carregar(id)), pagamento_id: pagamentoId };
}

async function estornar(id, pagamentoId) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await travar(cliente, id);
    const { rowCount } = await cliente.query('DELETE FROM faturas_transporte_pagamentos WHERE id = $1 AND fatura_id = $2', [pagamentoId, id]);
    if (!rowCount) throw erro('Recebimento não encontrado.', 404);
    // A linha do extrato que estava ligada a ele volta para "a conciliar".
    await cliente.query(`UPDATE extrato_linhas SET conciliado_tipo = NULL, conciliado_id = NULL, conciliado_acao = NULL, conciliado_em = NULL, conciliado_por = NULL
      WHERE conciliado_tipo = 'recebimento' AND conciliado_id = $1`, [pagamentoId]);
    await atualizarSituacao(cliente, id);
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
  return carregar(id);
}

// Cancela a fatura (sem recebimentos): os CT-e voltam para "a faturar".
async function cancelar(id, motivo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const f = await travar(cliente, id);
    if (f.status === 'cancelada') throw erro('Essa fatura já está cancelada.');
    const { rows: [p] } = await cliente.query('SELECT COUNT(*)::int AS n FROM faturas_transporte_pagamentos WHERE fatura_id = $1', [id]);
    if (p.n) throw erro('A fatura tem recebimentos: estorne os recebimentos antes de cancelar.');
    await cliente.query(`UPDATE faturas_transporte SET status = 'cancelada', cancelada_em = NOW(), motivo_cancelamento = $2 WHERE id = $1`, [id, String(motivo || '').slice(0, 255) || null]);
    await cliente.query('UPDATE ctes_emitidos SET fatura_id = NULL WHERE fatura_id = $1', [id]);
    await cliente.query('UPDATE nfse_emitidas SET fatura_id = NULL WHERE fatura_id = $1', [id]);
    await cliente.query('UPDATE notas_debito SET fatura_id = NULL WHERE fatura_id = $1', [id]);
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
  return carregar(id);
}

async function listar({ status, busca, tomador } = {}) {
  const cond = ['TRUE']; const val = [hoje()];
  if (status === 'vencidas') cond.push("status IN ('aberta', 'parcial') AND vencimento < $1::date");
  else if (status === 'abertas') cond.push("status IN ('aberta', 'parcial')");
  else if (['aberta', 'parcial', 'paga', 'cancelada'].includes(status)) { val.push(status); cond.push(`status = $${val.length}`); }
  if (tomador) { val.push(docLimpo(tomador)); cond.push(`tomador_doc = $${val.length}`); }
  if (busca) { val.push(`%${String(busca).trim()}%`); cond.push(`(CAST(numero AS TEXT) = TRIM($${val.length}, '%') OR tomador_nome ILIKE $${val.length} OR tomador_doc ILIKE $${val.length})`); }
  const { rows } = await pool.query(`SELECT *, (valor_bruto - desconto) AS valor_liquido, (valor_bruto - desconto - valor_pago) AS saldo,
      (status IN ('aberta', 'parcial') AND vencimento < $1::date) AS vencida, ($1::date - vencimento) AS dias_atraso,
      (SELECT COUNT(*)::int FROM ctes_emitidos c WHERE c.fatura_id = f.id) + (SELECT COUNT(*)::int FROM nfse_emitidas n WHERE n.fatura_id = f.id) AS qtd_ctes
    FROM faturas_transporte f WHERE ${cond.join(' AND ')} ORDER BY (status IN ('aberta', 'parcial')) DESC, vencimento, numero DESC LIMIT 500`, val);
  return rows;
}

// Contas a receber: totais, envelhecimento (aging) e maiores devedores.
async function resumo() {
  const h = hoje();
  const { rows: [t] } = await pool.query(`SELECT
      COALESCE(SUM(valor_bruto - desconto - valor_pago) FILTER (WHERE status IN ('aberta', 'parcial')), 0) AS a_receber,
      COALESCE(SUM(valor_bruto - desconto - valor_pago) FILTER (WHERE status IN ('aberta', 'parcial') AND vencimento < $1::date), 0) AS vencido,
      COALESCE(SUM(valor_bruto - desconto - valor_pago) FILTER (WHERE status IN ('aberta', 'parcial') AND vencimento BETWEEN $1::date AND $1::date + 7), 0) AS vence_7_dias,
      COUNT(*) FILTER (WHERE status IN ('aberta', 'parcial') AND vencimento < $1::date)::int AS qtd_vencidas,
      COUNT(*) FILTER (WHERE status IN ('aberta', 'parcial'))::int AS qtd_abertas
    FROM faturas_transporte`, [h]);
  const { rows: [r] } = await pool.query(`SELECT COALESCE(SUM(valor), 0) AS recebido_mes FROM faturas_transporte_pagamentos WHERE date_trunc('month', data) = date_trunc('month', $1::date)`, [h]);
  const { rows: aging } = await pool.query(`SELECT CASE WHEN vencimento >= $1::date THEN 'a_vencer' WHEN $1::date - vencimento <= 30 THEN 'ate_30'
        WHEN $1::date - vencimento <= 60 THEN 'ate_60' WHEN $1::date - vencimento <= 90 THEN 'ate_90' ELSE 'mais_90' END AS faixa,
      SUM(valor_bruto - desconto - valor_pago) AS valor, COUNT(*)::int AS qtd
    FROM faturas_transporte WHERE status IN ('aberta', 'parcial') GROUP BY 1`, [h]);
  const { rows: devedores } = await pool.query(`SELECT tomador_doc, MAX(tomador_nome) AS tomador_nome, SUM(valor_bruto - desconto - valor_pago) AS saldo,
      SUM(valor_bruto - desconto - valor_pago) FILTER (WHERE vencimento < $1::date) AS vencido, COUNT(*)::int AS faturas, MIN(vencimento) AS mais_antiga
    FROM faturas_transporte WHERE status IN ('aberta', 'parcial') GROUP BY tomador_doc ORDER BY saldo DESC LIMIT 10`, [h]);
  const aFaturar = await pendentes();
  return {
    ...t, recebido_mes: r.recebido_mes, aging: Object.fromEntries(aging.map((a) => [a.faixa, { valor: Number(a.valor), qtd: a.qtd }])), devedores,
    a_faturar: { qtd: aFaturar.length, valor: centavos(aFaturar.reduce((s, c) => s + c.valor, 0)) },
  };
}

module.exports = { pendentes, pendentesPorTomador, carregar, criar, faturarPeriodo, receber, estornar, cancelar, listar, resumo, tomadorDe, valorCte, hoje };
