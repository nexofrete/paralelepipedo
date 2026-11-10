// Reajuste de tabelas de preço em lote: aplica um % (acréscimo ou desconto) em várias tabelas
// de uma vez — filtradas por transportadora, tipo (gerais / de clientes), cliente e UF — agora
// ou numa data de vigência futura. Antes de mexer, cada tabela ganha uma "foto" em
// tabelas_preco_versoes (o mesmo histórico da edição manual); dá para desfazer o reajuste
// inteiro enquanto a tabela não tiver sido editada depois dele.
const pool = require('./db');
const { registrar } = require('./auditoria');

// O que cada opção reajusta. Casas = casas decimais da coluna.
const GRUPOS = {
  frete: { tabela: [['excedente_por_kg', 4]], faixa: [['valor_por_kg', 4], ['valor_kg_excedente', 4]] },
  minimos: { tabela: [['valor_minimo', 2]], faixa: [['frete_minimo', 2]] },
  taxas: { tabela: [['pedagio', 2], ['tde', 2], ['tda', 2], ['trt', 2], ['despacho_valor', 2], ['gris_minimo', 2], ['valor_pallet', 2], ['descarga_valor', 4], ['descarga_minimo', 2]], faixa: [] },
  percentuais: { tabela: [['ad_valorem_percentual', 3], ['gris_percentual', 3]], faixa: [] },
};
const PADRAO_CAMPOS = { frete: true, minimos: true, taxas: true, percentuais: false };

const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const arred = (v, f, casas) => (v == null ? null : Math.round(Number(v) * f * 10 ** casas) / 10 ** casas);

function lerParametros(b = {}) {
  const pct = Number(String(b.percentual ?? '').replace(',', '.'));
  if (!Number.isFinite(pct) || pct === 0) return { erro: 'Informe o percentual do reajuste (ex.: 6,5 para aumentar ou -3 para baixar).' };
  if (pct <= -50 || pct > 100) return { erro: 'O reajuste precisa ficar entre -50% e +100%.' };
  const campos = { ...PADRAO_CAMPOS, ...(b.campos || {}) };
  Object.keys(campos).forEach((k) => { campos[k] = !!campos[k]; });
  if (!Object.keys(GRUPOS).some((k) => campos[k])) return { erro: 'Marque pelo menos um grupo de valores para reajustar.' };
  const f = b.filtros || {};
  const filtros = {
    transportadora_id: Number(f.transportadora_id) || null,
    tipo: ['gerais', 'clientes'].includes(f.tipo) ? f.tipo : '',
    cliente_doc: String(f.cliente_doc || '').replace(/\D/g, '') || null,
    uf: /^[A-Za-z]{2}$/.test(String(f.uf || '').trim()) ? String(f.uf).trim().toUpperCase() : null,
    incluir_inativas: !!f.incluir_inativas,
  };
  const excluir = Array.isArray(b.excluir) ? b.excluir.map(Number).filter(Boolean) : [];
  let vigencia = String(b.vigencia || '').slice(0, 10) || hoje();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigencia) || Number.isNaN(Date.parse(vigencia))) return { erro: 'Data de vigência inválida.' };
  if (vigencia < hoje()) vigencia = hoje();
  return {
    percentual: pct, campos, filtros, excluir, vigencia,
    renovar_validade: b.renovar_validade !== false,
    indice: String(b.indice || '').trim().slice(0, 80) || null,
    observacao: String(b.observacao || '').trim().slice(0, 300) || null,
  };
}

// Tabelas que o filtro alcança.
async function selecionar(filtros, excluir = [], db = pool) {
  const cond = []; const v = [];
  if (!filtros.incluir_inativas) cond.push('tp.ativa');
  if (filtros.transportadora_id) { v.push(filtros.transportadora_id); cond.push(`tp.transportadora_id = $${v.length}`); }
  if (filtros.tipo === 'gerais') cond.push('tp.cliente_doc IS NULL');
  if (filtros.tipo === 'clientes') cond.push('tp.cliente_doc IS NOT NULL');
  if (filtros.cliente_doc) { v.push(filtros.cliente_doc); cond.push(`(tp.cliente_doc = $${v.length} OR (tp.cliente_por_raiz AND LEFT(tp.cliente_doc, 8) = LEFT($${v.length}, 8)))`); }
  if (filtros.uf) { v.push(filtros.uf); cond.push(`tp.uf_destino = $${v.length}`); }
  if (excluir.length) { v.push(excluir); cond.push(`NOT (tp.id = ANY($${v.length}::int[]))`); }
  const { rows } = await db.query(
    `SELECT tp.*, t.razao_social AS transportadora_nome
       FROM tabelas_preco tp JOIN transportadoras t ON t.id = tp.transportadora_id
      ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
      ORDER BY t.razao_social, (tp.cliente_doc IS NOT NULL), tp.cliente_nome NULLS FIRST, tp.nome`, v);
  return rows;
}

// Prévia: cada tabela com alguns valores antes e depois.
async function previa(b) {
  const p = lerParametros(b);
  if (p.erro) return p;
  const f = 1 + p.percentual / 100;
  const tabelas = await selecionar(p.filtros);
  const ids = tabelas.map((t) => t.id);
  const { rows: faixas } = ids.length ? await pool.query(
    `SELECT DISTINCT ON (tabela_preco_id) tabela_preco_id, valor_por_kg, frete_minimo,
            COUNT(*) OVER (PARTITION BY tabela_preco_id)::int AS total
       FROM tabela_preco_faixas WHERE tabela_preco_id = ANY($1::int[]) ORDER BY tabela_preco_id, ordem, peso_de NULLS FIRST`, [ids]) : { rows: [] };
  const fx = Object.fromEntries(faixas.map((x) => [x.tabela_preco_id, x]));
  const par = (antes, grupo, casas) => (antes == null ? null : { antes: Number(antes), depois: p.campos[grupo] ? arred(antes, f, casas) : Number(antes) });
  return {
    percentual: p.percentual, vigencia: p.vigencia, campos: p.campos,
    tabelas: tabelas.map((t) => ({
      id: t.id, nome: t.nome, transportadora: t.transportadora_nome, cliente: t.cliente_doc ? (t.cliente_nome || t.cliente_doc) : null,
      uf: t.uf_destino, ativa: t.ativa, trechos: fx[t.id]?.total || 0,
      kg: par(fx[t.id]?.valor_por_kg, 'frete', 4),
      minimo: par(fx[t.id]?.frete_minimo ?? t.valor_minimo, 'minimos', 2),
      pedagio: par(t.pedagio, 'taxas', 2),
      ad_valorem: par(t.ad_valorem_percentual, 'percentuais', 3),
    })),
  };
}

// Aplica em uma tabela (dentro da transação do chamador). Devolve o id da foto.
async function aplicarNaTabela(db, t, p, usuarioNome) {
  const f = 1 + Number(p.percentual) / 100;
  const { rows: faixas } = await db.query('SELECT * FROM tabela_preco_faixas WHERE tabela_preco_id = $1 ORDER BY ordem ASC, peso_de ASC', [t.id]);
  const foto = { ...t, faixas };
  delete foto.transportadora_nome;
  const { rows: [v] } = await db.query('INSERT INTO tabelas_preco_versoes (tabela_preco_id, dados_json, usuario_nome) VALUES ($1, $2, $3) RETURNING id',
    [t.id, JSON.stringify(foto), `${usuarioNome || 'Sistema'} (antes do reajuste)`]);
  const colsTabela = Object.entries(GRUPOS).filter(([g]) => p.campos[g]).flatMap(([, x]) => x.tabela);
  const colsFaixa = Object.entries(GRUPOS).filter(([g]) => p.campos[g]).flatMap(([, x]) => x.faixa);
  const sets = colsTabela.map(([c, casas]) => `${c} = ROUND(${c} * $1::numeric, ${casas})`);
  const marca = `Reajuste de ${String(p.percentual).replace('.', ',')}%${p.indice ? ` (${p.indice})` : ''} em ${p.vigencia.split('-').reverse().join('/')}`;
  sets.push(`observacoes = TRIM(BOTH E'\\n' FROM COALESCE(observacoes, '') || E'\\n' || $3)`);
  if (p.renovar_validade) sets.push('vigencia_desde = $4::date');
  await db.query(`UPDATE tabelas_preco SET ${sets.join(', ')}, atualizado_em = NOW() WHERE id = $2`,
    [f, t.id, marca, p.vigencia].slice(0, p.renovar_validade ? 4 : 3));
  if (colsFaixa.length) {
    await db.query(`UPDATE tabela_preco_faixas SET ${colsFaixa.map(([c, casas]) => `${c} = ROUND(${c} * $1::numeric, ${casas})`).join(', ')} WHERE tabela_preco_id = $2`, [f, t.id]);
  }
  return v.id;
}

// Aplica um reajuste já gravado (agora ou quando chega a data).
async function aplicar(id, usuarioNome) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [r] } = await db.query("SELECT *, to_char(vigencia, 'YYYY-MM-DD') AS vigencia_txt FROM reajustes_tabela WHERE id = $1 AND status = 'agendado' FOR UPDATE", [id]);
    if (!r) { await db.query('ROLLBACK'); return null; }
    const p = { percentual: Number(r.percentual), campos: r.campos, indice: r.indice, vigencia: r.vigencia_txt, renovar_validade: r.renovar_validade };
    const tabelas = await selecionar(r.filtros, r.excluir || [], db);
    const versoes = {};
    for (const t of tabelas) versoes[t.id] = await aplicarNaTabela(db, t, p, usuarioNome || r.usuario_nome);
    await db.query(`UPDATE reajustes_tabela SET status = 'aplicado', aplicado_em = clock_timestamp(), tabelas = $2::int[], versoes = $3 WHERE id = $1`,
      [id, Object.keys(versoes).map(Number), JSON.stringify(versoes)]);
    await db.query('COMMIT');
    registrar({ usuarioId: r.usuario_id, usuarioNome: usuarioNome || r.usuario_nome || 'Sistema', acao: 'editar_tabela_preco',
      detalhes: `Reajuste em lote #${id}: ${Number(r.percentual) > 0 ? '+' : ''}${r.percentual}% em ${tabelas.length} tabela(s) de preço` });
    return { aplicadas: tabelas.length };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { db.release(); }
}

async function criar(b, usuario) {
  const p = lerParametros(b);
  if (p.erro) return p;
  const alvo = await selecionar(p.filtros, p.excluir);
  if (!alvo.length) return { erro: 'Nenhuma tabela de preço com esse filtro.' };
  const { rows: [r] } = await pool.query(
    `INSERT INTO reajustes_tabela (usuario_id, usuario_nome, percentual, campos, filtros, excluir, vigencia, renovar_validade, indice, observacao, previstas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [usuario.id, usuario.nome, p.percentual, JSON.stringify(p.campos), JSON.stringify(p.filtros), p.excluir, p.vigencia, p.renovar_validade, p.indice, p.observacao, alvo.length]);
  if (p.vigencia <= hoje()) {
    const res = await aplicar(r.id, usuario.nome);
    return { id: r.id, status: 'aplicado', aplicadas: res?.aplicadas || 0 };
  }
  registrar({ usuarioId: usuario.id, usuarioNome: usuario.nome, acao: 'editar_tabela_preco',
    detalhes: `Agendou o reajuste #${r.id} de ${p.percentual}% em ${alvo.length} tabela(s) para ${p.vigencia.split('-').reverse().join('/')}` });
  return { id: r.id, status: 'agendado', previstas: alvo.length, vigencia: p.vigencia };
}

async function listar() {
  const { rows } = await pool.query(
    `SELECT r.id, r.criado_em, r.usuario_nome, r.percentual, r.campos, r.filtros, to_char(r.vigencia, 'YYYY-MM-DD') AS vigencia, r.renovar_validade, r.indice, r.observacao,
            r.status, r.aplicado_em, r.desfeito_em, r.desfeito_por, r.previstas, COALESCE(array_length(r.tabelas, 1), 0) AS aplicadas,
            t.razao_social AS transportadora_nome
       FROM reajustes_tabela r LEFT JOIN transportadoras t ON t.id = (r.filtros->>'transportadora_id')::int
      ORDER BY r.id DESC LIMIT 100`);
  return rows;
}

async function cancelar(id, usuario) {
  const { rowCount } = await pool.query("UPDATE reajustes_tabela SET status = 'cancelado', desfeito_em = NOW(), desfeito_por = $2 WHERE id = $1 AND status = 'agendado'", [id, usuario.nome]);
  if (rowCount) registrar({ usuarioId: usuario.id, usuarioNome: usuario.nome, acao: 'editar_tabela_preco', detalhes: `Cancelou o reajuste agendado #${id}` });
  return rowCount > 0;
}

// Desfaz: volta cada tabela para a foto de antes do reajuste — menos as que foram editadas
// depois (essas ficam como estão e aparecem na resposta, para conferir à mão).
const COLS_RESTAURAR = [...new Set(Object.values(GRUPOS).flatMap((g) => g.tabela.map(([c]) => c)))].concat(['observacoes', 'vigencia_desde']);
async function desfazer(id, usuario) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [r] } = await db.query("SELECT * FROM reajustes_tabela WHERE id = $1 AND status = 'aplicado' FOR UPDATE", [id]);
    if (!r) { await db.query('ROLLBACK'); return { erro: 'Este reajuste não está aplicado.' }; }
    const { rows: depois } = await db.query('SELECT id FROM reajustes_tabela WHERE status = \'aplicado\' AND id > $1 AND tabelas && $2::int[]', [id, r.tabelas || []]);
    if (depois.length) { await db.query('ROLLBACK'); return { erro: `Há reajuste(s) mais novo(s) nessas tabelas (#${depois.map((x) => x.id).join(', #')}). Desfaça primeiro o mais novo.` }; }
    const voltaram = []; const puladas = [];
    for (const [tabelaId, versaoId] of Object.entries(r.versoes || {})) {
      const { rows: [t] } = await db.query('SELECT id, nome, atualizado_em FROM tabelas_preco WHERE id = $1', [tabelaId]);
      if (!t) continue;
      if (new Date(t.atualizado_em) - new Date(r.aplicado_em) > 2000) { puladas.push(t.nome); continue; }
      const { rows: [v] } = await db.query('SELECT dados_json FROM tabelas_preco_versoes WHERE id = $1', [versaoId]);
      if (!v) { puladas.push(t.nome); continue; }
      const d = v.dados_json;
      await db.query(`UPDATE tabelas_preco SET ${COLS_RESTAURAR.map((c, i) => `${c} = $${i + 2}`).join(', ')}, atualizado_em = NOW() WHERE id = $1`,
        [t.id, ...COLS_RESTAURAR.map((c) => d[c] ?? null)]);
      for (const fx of d.faixas || []) {
        await db.query('UPDATE tabela_preco_faixas SET valor_por_kg = $2, valor_kg_excedente = $3, frete_minimo = $4 WHERE id = $1 AND tabela_preco_id = $5',
          [fx.id, fx.valor_por_kg, fx.valor_kg_excedente, fx.frete_minimo, t.id]);
      }
      voltaram.push(t.nome);
    }
    await db.query("UPDATE reajustes_tabela SET status = 'desfeito', desfeito_em = NOW(), desfeito_por = $2 WHERE id = $1", [id, usuario.nome]);
    await db.query('COMMIT');
    registrar({ usuarioId: usuario.id, usuarioNome: usuario.nome, acao: 'editar_tabela_preco',
      detalhes: `Desfez o reajuste em lote #${id} (${voltaram.length} tabela(s) voltaram${puladas.length ? `; ${puladas.length} editada(s) depois ficaram como estavam` : ''})` });
    return { voltaram: voltaram.length, puladas };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { db.release(); }
}

// Aplica os agendados cuja data chegou (ao ligar e de hora em hora).
async function aplicarVencidos() {
  const { rows } = await pool.query("SELECT id FROM reajustes_tabela WHERE status = 'agendado' AND vigencia <= $1::date ORDER BY vigencia, id", [hoje()]);
  for (const r of rows) {
    try {
      const res = await aplicar(r.id);
      if (res) console.log(`[reajuste] #${r.id} aplicado em ${res.aplicadas} tabela(s)`);
    } catch (err) { console.error(`[reajuste] #${r.id}:`, err.message); }
  }
  return rows.length;
}
let agendado = false;
function agendar() {
  if (agendado) return;
  agendado = true;
  setTimeout(() => aplicarVencidos().catch((e) => console.error('[reajuste]', e.message)), 12000);
  setInterval(() => aplicarVencidos().catch((e) => console.error('[reajuste]', e.message)), 3600 * 1000).unref();
}

module.exports = { GRUPOS, lerParametros, selecionar, previa, criar, aplicar, listar, cancelar, desfazer, aplicarVencidos, agendar };
