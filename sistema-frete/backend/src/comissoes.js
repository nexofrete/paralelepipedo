// Comissão de vendedores.
//  • O vendedor é o do cliente (tomador do frete); dá para trocar em um CT-e.
//  • Percentual do vendedor, ou o do cliente quando ele tem um próprio.
//  • Base "recebido": entra quando a fatura do documento é quitada (não paga
//    comissão de quem não pagou). Base "faturado": quando o CT-e é autorizado.
//  • O fechamento do mês vira uma conta a pagar (categoria Comissão) e guarda
//    cada documento: nenhum é comissionado duas vezes, e o CT-e cancelado depois
//    de comissionado volta como estorno no fechamento seguinte. Na base "recebido",
//    o recebimento estornado (fatura que deixou de estar paga) também estorna; se
//    for pago de novo, comissiona outra vez (próximo "ciclo" do documento).
//  • Na base "recebido", o desconto dado na fatura reduz a base na proporção.
const pool = require('./db');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const dia = (v) => String(v || '').slice(0, 10).split('-').reverse().join('/');
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const BASES = { recebido: 'Sobre o recebido (fatura paga)', faturado: 'Sobre o faturado (CT-e autorizado)' };

// ---------- Vendedores ----------
async function listarVendedores({ todos = false } = {}) {
  const { rows } = await pool.query(
    `SELECT v.id, v.nome, v.documento, v.email, v.telefone, v.comissao_pct::float, v.base, v.ativo,
            (SELECT COUNT(*) FROM clientes c WHERE c.vendedor_id = v.id)::int AS clientes
       FROM vendedores v ${todos ? '' : 'WHERE v.ativo'} ORDER BY v.ativo DESC, v.nome`);
  return rows;
}

function lerVendedor(b = {}) {
  const nome = String(b.nome || '').trim().slice(0, 120);
  if (!nome) throw falha('Informe o nome do vendedor.');
  const pct = Number(String(b.comissao_pct ?? '').replace(',', '.'));
  if (!(pct >= 0 && pct <= 50)) throw falha('Comissão entre 0% e 50%.');
  const documento = soDigitos(b.documento) || null;
  if (documento && ![11, 14].includes(documento.length)) throw falha('CPF/CNPJ do vendedor inválido.');
  const email = String(b.email || '').trim().slice(0, 160) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw falha('E-mail inválido.');
  return { nome, documento, email, telefone: String(b.telefone || '').trim().slice(0, 30) || null, comissao_pct: pct, base: b.base === 'faturado' ? 'faturado' : 'recebido' };
}

async function criarVendedor(b) {
  const v = lerVendedor(b);
  const { rows: [r] } = await pool.query('INSERT INTO vendedores (nome, documento, email, telefone, comissao_pct, base) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [v.nome, v.documento, v.email, v.telefone, v.comissao_pct, v.base]);
  return r;
}
async function alterarVendedor(id, b) {
  const v = lerVendedor(b);
  const { rows: [r] } = await pool.query('UPDATE vendedores SET nome = $2, documento = $3, email = $4, telefone = $5, comissao_pct = $6, base = $7, ativo = COALESCE($8, ativo) WHERE id = $1 RETURNING *',
    [id, v.nome, v.documento, v.email, v.telefone, v.comissao_pct, v.base, b.ativo == null ? null : !!b.ativo]);
  if (!r) throw falha('Vendedor não encontrado.', 404);
  return r;
}

// ---------- Carteira (cliente → vendedor) ----------
// Clientes que pagam frete (tomadores das faturas e dos CT-e), com o vendedor de cada um.
async function carteira() {
  const { tomadorDe } = require('./faturamento/faturamento');
  const { rows: ctes } = await pool.query(`SELECT dados FROM ctes_emitidos WHERE status = 'autorizado' ORDER BY autorizado_em DESC LIMIT 3000`);
  const tomadores = new Map();
  ctes.forEach((c) => { const t = tomadorDe(c.dados || {}); if (t.doc && !tomadores.has(t.doc)) tomadores.set(t.doc, t.nome); });
  const { rows: fat } = await pool.query('SELECT DISTINCT tomador_doc, tomador_nome FROM faturas_transporte WHERE tomador_doc IS NOT NULL');
  fat.forEach((f) => { if (!tomadores.has(f.tomador_doc)) tomadores.set(f.tomador_doc, f.tomador_nome); });
  const { rows: cli } = await pool.query(`SELECT documento, COALESCE(razao_social, nome_fantasia) AS nome, vendedor_id, comissao_pct::float FROM clientes
    WHERE vendedor_id IS NOT NULL OR comissao_pct IS NOT NULL OR documento = ANY($1::text[])`, [[...tomadores.keys()]]);
  const porDoc = new Map(cli.map((c) => [c.documento, c]));
  const docs = new Set([...tomadores.keys(), ...cli.filter((c) => c.vendedor_id || c.comissao_pct != null).map((c) => c.documento)]);
  return [...docs].map((d) => ({ documento: d, nome: porDoc.get(d)?.nome || tomadores.get(d) || '', vendedor_id: porDoc.get(d)?.vendedor_id || null, comissao_pct: porDoc.get(d)?.comissao_pct ?? null }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
}

async function definirCarteira(documentos, { vendedor_id, comissao_pct, nome } = {}) {
  const docs = (Array.isArray(documentos) ? documentos : [documentos]).map(soDigitos).filter((d) => [11, 14].includes(d.length)).slice(0, 500);
  if (!docs.length) throw falha('Escolha os clientes.');
  const vend = vendedor_id ? Number(vendedor_id) : null;
  if (vend) { const { rows } = await pool.query('SELECT id FROM vendedores WHERE id = $1 AND ativo', [vend]); if (!rows[0]) throw falha('Vendedor não encontrado ou inativo.'); }
  const pctTxt = String(comissao_pct ?? '').trim();
  const pct = pctTxt === '' ? null : Number(pctTxt.replace(',', '.'));
  if (pct != null && !(pct >= 0 && pct <= 50)) throw falha('Comissão do cliente entre 0% e 50% (ou em branco para usar a do vendedor).');
  for (const d of docs) {
    await pool.query(`INSERT INTO clientes (documento, razao_social, vendedor_id, comissao_pct, origem) VALUES ($1,$2,$3,$4,'manual')
      ON CONFLICT (documento) DO UPDATE SET vendedor_id = EXCLUDED.vendedor_id, comissao_pct = EXCLUDED.comissao_pct`, [d, docs.length === 1 ? (nome || null) : null, vend, pct]);
  }
  return docs.length;
}

// ---------- Apuração ----------
async function documentosDoPeriodo(base, { de, ate }) {
  const { rows: [emp] } = await pool.query('SELECT cte_demonstracao FROM empresa WHERE id = 1');
  const demo = !!emp?.cte_demonstracao;
  const { tomadorDe } = require('./faturamento/faturamento');
  const quitacao = `(SELECT MAX(p.data) FROM faturas_transporte_pagamentos p WHERE p.fatura_id = f.id)`;
  // Desconto da fatura rateado entre os documentos dela.
  const fator = `(CASE WHEN f.valor_bruto > 0 THEN GREATEST(f.valor_bruto - f.desconto, 0) / f.valor_bruto ELSE 1 END)::float`;
  const ctes = base === 'faturado'
    ? (await pool.query(`SELECT c.id, c.serie, c.numero, c.dados, c.valor_total, c.vendedor_id, (c.autorizado_em AT TIME ZONE 'America/Sao_Paulo')::date::text AS data_ref
        FROM ctes_emitidos c WHERE c.status = 'autorizado' AND c.demonstracao = $3 AND (c.autorizado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1 AND $2`, [de, ate, demo])).rows
    : (await pool.query(`SELECT c.id, c.serie, c.numero, c.dados, c.valor_total, c.vendedor_id, ${quitacao}::text AS data_ref, ${fator} AS fator
        FROM ctes_emitidos c JOIN faturas_transporte f ON f.id = c.fatura_id WHERE c.status = 'autorizado' AND c.demonstracao = $3 AND f.status = 'paga'
         AND ${quitacao} BETWEEN $1 AND $2`, [de, ate, demo])).rows;
  const nfse = base === 'faturado'
    ? (await pool.query(`SELECT n.id, n.numero_nfse, n.valor, n.tomador_doc, n.tomador_nome, n.vendedor_id, (n.autorizada_em AT TIME ZONE 'America/Sao_Paulo')::date::text AS data_ref
        FROM nfse_emitidas n WHERE n.status = 'autorizada' AND n.demonstracao = $3 AND (n.autorizada_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1 AND $2`, [de, ate, demo])).rows
    : (await pool.query(`SELECT n.id, n.numero_nfse, n.valor, n.tomador_doc, n.tomador_nome, n.vendedor_id, ${quitacao}::text AS data_ref, ${fator} AS fator
        FROM nfse_emitidas n JOIN faturas_transporte f ON f.id = n.fatura_id WHERE n.status = 'autorizada' AND n.demonstracao = $3 AND f.status = 'paga'
         AND ${quitacao} BETWEEN $1 AND $2`, [de, ate, demo])).rows;
  return [
    ...ctes.map((c) => { const t = tomadorDe(c.dados || {}); const d = c.dados || {};
      return { doc_tipo: 'cte', doc_id: c.id, documento: `CT-e ${c.serie}/${c.numero}${String(d.tpCTe ?? '0') === '1' ? ' (compl.)' : ''}`, cliente_doc: t.doc, cliente: t.nome,
        valor: centavos(Number(d.valores?.vTPrest ?? c.valor_total) * (c.fator ?? 1)), vendedor_id: c.vendedor_id, data_ref: c.data_ref }; }),
    ...nfse.map((n) => ({ doc_tipo: 'nfse', doc_id: n.id, documento: `NFS-e ${n.numero_nfse}`, cliente_doc: soDigitos(n.tomador_doc), cliente: n.tomador_nome, valor: centavos(Number(n.valor) * (n.fator ?? 1)), vendedor_id: n.vendedor_id, data_ref: n.data_ref })),
  ];
}

async function apurar({ de, ate, vendedorId = null } = {}) {
  if (!iso(de) || !iso(ate) || de > ate) throw falha('Informe o período.');
  const vendedores = (await listarVendedores({ todos: true })).filter((v) => !vendedorId || v.id === Number(vendedorId));
  const porId = new Map(vendedores.map((v) => [v.id, v]));
  const { rows: cli } = await pool.query('SELECT documento, vendedor_id, comissao_pct::float FROM clientes WHERE vendedor_id IS NOT NULL OR comissao_pct IS NOT NULL');
  const cliente = new Map(cli.map((c) => [c.documento, c]));
  // Em aberto = comissionado mais vezes do que estornado. O próximo ciclo é o nº de estornos.
  const { rows: feitos } = await pool.query(
    `SELECT i.doc_tipo, i.doc_id, COUNT(*) FILTER (WHERE i.tipo = 'comissao')::int AS c, COUNT(*) FILTER (WHERE i.tipo = 'estorno')::int AS e
       FROM comissao_itens i JOIN comissao_fechamentos f ON f.id = i.fechamento_id WHERE f.status = 'fechado' GROUP BY 1, 2`);
  const ciclos = new Map(feitos.map((x) => [`${x.doc_tipo}:${x.doc_id}`, x]));
  const jaPago = new Set(feitos.filter((x) => x.c > x.e).map((x) => `${x.doc_tipo}:${x.doc_id}`));
  const resultado = new Map(vendedores.map((v) => [v.id, { vendedor: v, itens: [], estornos: [], total: 0 }]));
  const semVendedor = { qtd: 0, valor: 0, clientes: new Map() };
  for (const base of ['recebido', 'faturado']) {
    if (!vendedores.some((v) => v.base === base) && !(base === 'recebido')) continue;
    for (const d of await documentosDoPeriodo(base, { de, ate })) {
      const c = cliente.get(d.cliente_doc);
      const vid = d.vendedor_id || c?.vendedor_id || null;
      if (!vid) { if (base === 'recebido') { semVendedor.qtd += 1; semVendedor.valor = centavos(semVendedor.valor + d.valor); semVendedor.clientes.set(d.cliente_doc, d.cliente); } continue; }
      const v = porId.get(vid);
      if (!v || v.base !== base || jaPago.has(`${d.doc_tipo}:${d.doc_id}`)) continue;
      const pct = c?.comissao_pct != null && c.vendedor_id === vid ? c.comissao_pct : v.comissao_pct;
      resultado.get(vid).itens.push({ ...d, tipo: 'comissao', pct, comissao: centavos((d.valor * pct) / 100), ciclo: ciclos.get(`${d.doc_tipo}:${d.doc_id}`)?.e || 0 });
    }
  }
  // Estornos: comissionado (no ciclo atual) e depois cancelado/substituído — ou, na base "recebido",
  // a fatura deixou de estar paga (recebimento estornado, documento tirado da fatura).
  const { rows: est } = await pool.query(
    `SELECT i.doc_tipo, i.doc_id, i.documento, i.cliente, i.base_valor::float, i.pct::float, i.valor::float, i.ciclo, f.vendedor_id
       FROM comissao_itens i JOIN comissao_fechamentos f ON f.id = i.fechamento_id
      WHERE f.status = 'fechado' AND i.tipo = 'comissao'
        AND NOT EXISTS (SELECT 1 FROM comissao_itens e JOIN comissao_fechamentos fe ON fe.id = e.fechamento_id
                         WHERE fe.status = 'fechado' AND e.tipo = 'estorno' AND e.doc_tipo = i.doc_tipo AND e.doc_id = i.doc_id AND e.ciclo = i.ciclo)
        AND ((i.doc_tipo = 'cte' AND EXISTS (SELECT 1 FROM ctes_emitidos c LEFT JOIN faturas_transporte ft ON ft.id = c.fatura_id WHERE c.id = i.doc_id
                AND (c.status IN ('cancelado', 'substituido') OR (f.base = 'recebido' AND ft.status IS DISTINCT FROM 'paga'))))
          OR (i.doc_tipo = 'nfse' AND EXISTS (SELECT 1 FROM nfse_emitidas n LEFT JOIN faturas_transporte ft ON ft.id = n.fatura_id WHERE n.id = i.doc_id
                AND (n.status = 'cancelada' OR (f.base = 'recebido' AND ft.status IS DISTINCT FROM 'paga')))))`);
  est.forEach((e) => {
    const r = resultado.get(e.vendedor_id); if (!r) return;
    r.estornos.push({ doc_tipo: e.doc_tipo, doc_id: e.doc_id, documento: e.documento, cliente: e.cliente, valor: -e.base_valor, pct: e.pct, comissao: -e.valor, tipo: 'estorno', data_ref: null, ciclo: e.ciclo });
  });
  const lista = [...resultado.values()].map((r) => {
    r.itens.sort((a, b) => String(a.data_ref).localeCompare(String(b.data_ref)));
    const total = centavos([...r.itens, ...r.estornos].reduce((s, x) => s + x.comissao, 0));
    return { ...r, total, base_total: centavos(r.itens.reduce((s, x) => s + x.valor, 0)) };
  }).filter((r) => r.vendedor.ativo || r.itens.length || r.estornos.length);
  return {
    periodo: { de, ate }, bases: BASES, vendedores: lista, total: centavos(lista.reduce((s, r) => s + r.total, 0)),
    sem_vendedor: { qtd: semVendedor.qtd, valor: semVendedor.valor, clientes: [...semVendedor.clientes].map(([doc, nome]) => ({ doc, nome })).slice(0, 50) },
  };
}

// ---------- Fechamento ----------
async function fechar(vendedorId, { de, ate, vencimento, centro_custo_id } = {}, usuarioNome) {
  const ap = await apurar({ de, ate, vendedorId });
  const r = ap.vendedores.find((x) => x.vendedor.id === Number(vendedorId));
  if (!r) throw falha('Vendedor não encontrado.', 404);
  if (!r.itens.length && !r.estornos.length) throw falha('Nada a fechar para este vendedor no período.');
  if (!(r.total > 0)) throw falha(`Os estornos (${r.total.toFixed(2).replace('.', ',')}) são maiores que a comissão do período: ficam para o próximo fechamento.`);
  const venc = iso(vencimento) || new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const contas = require('./contasPagar');
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [f] } = await cliente.query(
      'INSERT INTO comissao_fechamentos (vendedor_id, de, ate, base, total, usuario_nome) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [r.vendedor.id, de, ate, r.vendedor.base, r.total, usuarioNome]);
    for (const x of [...r.itens, ...r.estornos]) {
      await cliente.query(`INSERT INTO comissao_itens (fechamento_id, doc_tipo, doc_id, tipo, documento, cliente, data_ref, base_valor, pct, valor, ciclo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [f.id, x.doc_tipo, x.doc_id, x.tipo, x.documento.slice(0, 40), String(x.cliente || '').slice(0, 200), x.data_ref, Math.abs(x.valor), x.pct, x.tipo === 'estorno' ? Math.abs(x.comissao) * -1 : x.comissao, x.ciclo || 0]);
    }
    let centro = Number(centro_custo_id) || null;
    if (!centro) centro = (await cliente.query(`SELECT id FROM centros_custo WHERE tipo = 'comercial' AND ativo ORDER BY id LIMIT 1`)).rows[0]?.id || null;
    const [conta] = await contas.criar({
      descricao: `Comissão ${r.vendedor.nome} — ${dia(de)} a ${dia(ate)} (${r.itens.length} doc.${r.estornos.length ? `, ${r.estornos.length} estorno(s)` : ''})`, categoria: 'comissao',
      fornecedor_nome: r.vendedor.nome, fornecedor_doc: r.vendedor.documento, documento: `COM ${f.id}`, vencimento: venc, valor: r.total, centro_custo_id: centro,
      observacao: `Fechamento de comissão ${f.id} — ${BASES[r.vendedor.base]}.`,
    }, usuarioNome, { cliente });
    await cliente.query('UPDATE comissao_fechamentos SET conta_pagar_id = $2 WHERE id = $1', [f.id, conta.id]);
    await cliente.query('COMMIT');
    return { ...f, conta_pagar_id: conta.id, vendedor: r.vendedor.nome, itens: r.itens.length, estornos: r.estornos.length };
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') throw falha('Algum documento deste período acabou de ser comissionado (outro fechamento). Atualize a apuração.', 409);
    throw e;
  } finally { cliente.release(); }
}

async function fechamentos({ vendedorId = null } = {}) {
  const { rows } = await pool.query(
    `SELECT f.id, f.vendedor_id, v.nome AS vendedor, f.de::text, f.ate::text, f.base, f.total::float, f.status, f.usuario_nome, f.criado_em, f.conta_pagar_id,
            cp.status AS conta_status, cp.valor_pago::float AS conta_pago, cp.vencimento::text AS conta_vencimento,
            (SELECT COUNT(*) FROM comissao_itens i WHERE i.fechamento_id = f.id AND i.tipo = 'comissao')::int AS itens,
            (SELECT COUNT(*) FROM comissao_itens i WHERE i.fechamento_id = f.id AND i.tipo = 'estorno')::int AS estornos
       FROM comissao_fechamentos f JOIN vendedores v ON v.id = f.vendedor_id LEFT JOIN contas_pagar cp ON cp.id = f.conta_pagar_id
      WHERE ($1::int IS NULL OR f.vendedor_id = $1) ORDER BY f.criado_em DESC LIMIT 200`, [vendedorId]);
  return rows;
}

async function itensDoFechamento(id) {
  const { rows } = await pool.query(`SELECT doc_tipo, doc_id, tipo, documento, cliente, data_ref::text, base_valor::float, pct::float, valor::float FROM comissao_itens WHERE fechamento_id = $1 ORDER BY tipo, data_ref, id`, [id]);
  return rows;
}

// Desfaz o fechamento: a conta a pagar é cancelada e os documentos voltam para a apuração.
async function cancelarFechamento(id) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [f] } = await cliente.query('SELECT * FROM comissao_fechamentos WHERE id = $1 FOR UPDATE', [id]);
    if (!f) throw falha('Fechamento não encontrado.', 404);
    if (f.status !== 'fechado') throw falha('Este fechamento já foi cancelado.', 409);
    // Documento deste fechamento que já tem continuação em outro (o estorno dele, ou a comissão do ciclo seguinte):
    // desfazer este deixaria o outro sem par. Cancele primeiro o fechamento mais novo.
    const { rows: depois } = await cliente.query(
      `SELECT DISTINCT o.fechamento_id, i.documento FROM comissao_itens i
         JOIN comissao_itens o ON o.doc_tipo = i.doc_tipo AND o.doc_id = i.doc_id AND o.fechamento_id <> i.fechamento_id
         JOIN comissao_fechamentos fo ON fo.id = o.fechamento_id AND fo.status = 'fechado'
        WHERE i.fechamento_id = $1 AND (o.ciclo > i.ciclo OR (o.ciclo = i.ciclo AND i.tipo = 'comissao' AND o.tipo = 'estorno'))`, [id]);
    if (depois.length) throw falha(`O fechamento ${depois[0].fechamento_id} já estornou ou recomissionou documentos deste (${[...new Set(depois.map((d) => d.documento))].slice(0, 3).join(', ')}). Cancele aquele primeiro.`, 409);
    if (f.conta_pagar_id) {
      const { rows: [cp] } = await cliente.query('SELECT valor_pago FROM contas_pagar WHERE id = $1 FOR UPDATE', [f.conta_pagar_id]);
      if (cp && Number(cp.valor_pago) > 0) throw falha('A comissão já foi paga (total ou em parte). Estorne o pagamento em Contas a pagar antes de cancelar o fechamento.', 409);
      await cliente.query(`UPDATE contas_pagar SET status = 'cancelada' WHERE id = $1`, [f.conta_pagar_id]);
    }
    await cliente.query('DELETE FROM comissao_itens WHERE fechamento_id = $1', [id]);
    await cliente.query(`UPDATE comissao_fechamentos SET status = 'cancelado' WHERE id = $1`, [id]);
    await cliente.query('COMMIT');
    return f;
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}

// Vendedor de um documento (troca só daquele CT-e/NFS-e).
async function vendedorDoDocumento(tipo, id, vendedorId) {
  const tabela = { cte: 'ctes_emitidos', nfse: 'nfse_emitidas' }[tipo];
  if (!tabela) throw falha('Documento inválido.');
  const { rows: ja } = await pool.query(`SELECT 1 FROM comissao_itens i JOIN comissao_fechamentos f ON f.id = i.fechamento_id WHERE f.status = 'fechado' AND i.doc_tipo = $1 AND i.doc_id = $2`, [tipo, id]);
  if (ja[0]) throw falha('Este documento já está num fechamento de comissão. Cancele o fechamento para trocar o vendedor.', 409);
  const { rowCount } = await pool.query(`UPDATE ${tabela} SET vendedor_id = $2 WHERE id = $1`, [id, Number(vendedorId) || null]);
  if (!rowCount) throw falha('Documento não encontrado.', 404);
  return true;
}

// Percentual de comissão de cada cliente (para a Margem: comissão estimada por documento).
async function percentuais() {
  const { rows } = await pool.query(`SELECT c.documento, v.id AS vendedor_id, COALESCE(c.comissao_pct, v.comissao_pct)::float AS pct
    FROM clientes c JOIN vendedores v ON v.id = c.vendedor_id WHERE v.ativo`);
  const { rows: vs } = await pool.query('SELECT id, comissao_pct::float AS pct FROM vendedores WHERE ativo');
  return { porCliente: new Map(rows.map((r) => [r.documento, r.pct])), vendedorDoCliente: new Map(rows.map((r) => [r.documento, r.vendedor_id])), porVendedor: new Map(vs.map((v) => [v.id, v.pct])) };
}

module.exports = {
  BASES, listarVendedores, criarVendedor, alterarVendedor, carteira, definirCarteira, apurar, fechar, fechamentos, itensDoFechamento, cancelarFechamento,
  vendedorDoDocumento, percentuais, lerVendedor,
};
