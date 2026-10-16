// Centros de custo: para onde vai cada despesa (filial, veículo, rota,
// comercial, administrativo) e o resultado de cada um no período.
//  • Receita: CT-e e NFS-e pela filial de origem (sem filial = a matriz).
//  • Despesas: contas a pagar pelo centro (pelo vencimento, como no demonstrativo
//    da Margem). Abastecimento, manutenção e acerto pegam o centro do veículo;
//    a conta lançada à mão, o centro escolhido (ou o da filial).
const pool = require('./db');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const TIPOS = { filial: 'Filial', veiculo: 'Veículo', rota: 'Rota', comercial: 'Comercial', administrativo: 'Administrativo', outro: 'Outro' };

async function listar({ todos = false } = {}) {
  const { rows } = await pool.query(
    `SELECT c.id, c.nome, c.tipo, c.unidade_id, c.veiculo_id, c.ativo, u.sigla AS unidade_sigla, u.nome AS unidade_nome, v.placa
       FROM centros_custo c LEFT JOIN unidades u ON u.id = c.unidade_id LEFT JOIN veiculos v ON v.id = c.veiculo_id
      ${todos ? '' : 'WHERE c.ativo'} ORDER BY c.ativo DESC, c.tipo, c.nome`);
  return rows;
}

function lerCentro(b = {}) {
  const nome = String(b.nome || '').trim().slice(0, 80);
  if (!nome) throw falha('Dê um nome ao centro de custo.');
  const tipo = TIPOS[b.tipo] ? b.tipo : 'outro';
  return { nome, tipo, unidade_id: tipo === 'filial' ? Number(b.unidade_id) || null : null, veiculo_id: tipo === 'veiculo' ? Number(b.veiculo_id) || null : null };
}
const repetido = (e) => { if (e.code === '23505') throw falha('Já existe um centro de custo ativo para esta filial ou este veículo.', 409); throw e; };

async function criar(b) {
  const c = lerCentro(b);
  if (c.tipo === 'filial' && !c.unidade_id) throw falha('Escolha a filial.');
  if (c.tipo === 'veiculo' && !c.veiculo_id) throw falha('Escolha o veículo.');
  const { rows: [r] } = await pool.query('INSERT INTO centros_custo (nome, tipo, unidade_id, veiculo_id) VALUES ($1,$2,$3,$4) RETURNING *', [c.nome, c.tipo, c.unidade_id, c.veiculo_id]).catch(repetido);
  return r;
}

async function alterar(id, b) {
  const c = lerCentro(b);
  const { rows: [r] } = await pool.query('UPDATE centros_custo SET nome = $2, tipo = $3, unidade_id = $4, veiculo_id = $5, ativo = COALESCE($6, ativo) WHERE id = $1 RETURNING *',
    [id, c.nome, c.tipo, c.unidade_id, c.veiculo_id, b.ativo == null ? null : !!b.ativo]).catch(repetido);
  if (!r) throw falha('Centro de custo não encontrado.', 404);
  return r;
}

// Começo rápido: um centro para cada filial e cada veículo ativo, mais Comercial e Administrativo.
// Depois, as contas antigas sem centro pegam o do veículo (abastecimento, manutenção, acerto) ou da filial.
async function criarAutomatico() {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const f = await cliente.query(`INSERT INTO centros_custo (nome, tipo, unidade_id) SELECT u.nome, 'filial', u.id FROM unidades u
      WHERE NOT EXISTS (SELECT 1 FROM centros_custo c WHERE c.unidade_id = u.id AND c.ativo)`);
    const v = await cliente.query(`INSERT INTO centros_custo (nome, tipo, veiculo_id) SELECT 'Veículo ' || v.placa, 'veiculo', v.id FROM veiculos v
      WHERE v.ativo AND NOT EXISTS (SELECT 1 FROM centros_custo c WHERE c.veiculo_id = v.id AND c.ativo)`);
    let fixos = 0;
    for (const [nome, tipo] of [['Comercial', 'comercial'], ['Administrativo', 'administrativo']]) {
      const r = await cliente.query(`INSERT INTO centros_custo (nome, tipo) SELECT $1::varchar, $2::varchar WHERE NOT EXISTS (SELECT 1 FROM centros_custo WHERE tipo = $2::varchar AND ativo)`, [nome, tipo]);
      fixos += r.rowCount;
    }
    const contas = await atribuirContasAntigas(cliente);
    await cliente.query('COMMIT');
    return { filiais: f.rowCount, veiculos: v.rowCount, outros: fixos, contas };
  } catch (e) { await cliente.query('ROLLBACK').catch(() => {}); throw e; } finally { cliente.release(); }
}

async function atribuirContasAntigas(cliente = pool) {
  const passos = [
    // abastecimento → veículo
    `UPDATE contas_pagar cp SET centro_custo_id = c.id FROM abastecimentos a JOIN centros_custo c ON c.veiculo_id = a.veiculo_id AND c.ativo
      WHERE a.conta_pagar_id = cp.id AND cp.centro_custo_id IS NULL`,
    // manutenção → veículo
    `UPDATE contas_pagar cp SET centro_custo_id = c.id FROM manutencoes m JOIN centros_custo c ON c.veiculo_id = m.veiculo_id AND c.ativo
      WHERE cp.id = ANY(m.contas_ids) AND cp.centro_custo_id IS NULL`,
    // acerto com placa → veículo
    `UPDATE contas_pagar cp SET centro_custo_id = c.id FROM acertos a JOIN veiculos v ON upper(v.placa) = upper(a.placa) JOIN centros_custo c ON c.veiculo_id = v.id AND c.ativo
      WHERE cp.acerto_id = a.id AND cp.centro_custo_id IS NULL`,
    // filial da conta
    `UPDATE contas_pagar cp SET centro_custo_id = c.id FROM centros_custo c WHERE c.unidade_id = cp.unidade_id AND c.ativo AND cp.centro_custo_id IS NULL`,
    // comissão → comercial
    `UPDATE contas_pagar cp SET centro_custo_id = (SELECT id FROM centros_custo WHERE tipo = 'comercial' AND ativo ORDER BY id LIMIT 1)
      WHERE cp.categoria = 'comissao' AND cp.centro_custo_id IS NULL`,
  ];
  let n = 0;
  for (const sql of passos) n += (await cliente.query(sql)).rowCount;
  return n;
}

async function atribuir(contaIds, centroId) {
  const ids = (Array.isArray(contaIds) ? contaIds : []).map(Number).filter(Boolean).slice(0, 500);
  if (!ids.length) throw falha('Escolha as contas.');
  if (centroId) {
    const { rows } = await pool.query('SELECT id FROM centros_custo WHERE id = $1 AND ativo', [centroId]);
    if (!rows[0]) throw falha('Centro de custo não encontrado.');
  }
  const { rowCount } = await pool.query('UPDATE contas_pagar SET centro_custo_id = $2 WHERE id = ANY($1::int[])', [ids, centroId || null]);
  return rowCount;
}

// Resultado por centro no período.
async function resultado({ de, ate }) {
  if (!iso(de) || !iso(ate)) throw falha('Informe o período.');
  const { rows: [emp] } = await pool.query('SELECT cte_demonstracao FROM empresa WHERE id = 1');
  const demo = !!emp?.cte_demonstracao;
  const centros = await listar({ todos: true });
  const { rows: [matriz] } = await pool.query(`SELECT id FROM unidades ORDER BY matriz DESC, id LIMIT 1`);
  const centroDaUnidade = new Map(centros.filter((c) => c.unidade_id && c.ativo).map((c) => [c.unidade_id, c.id]));
  const linha = (c) => ({ id: c?.id ?? null, nome: c?.nome ?? 'Sem centro de custo', tipo: c?.tipo ?? null, ativo: c?.ativo ?? true, receita: 0, documentos: 0, despesas: 0, contas: 0, por_categoria: {} });
  const mapa = new Map(centros.map((c) => [c.id, linha(c)]));
  const sem = linha(null);
  const de_ = (id) => (id && mapa.get(id)) || sem;

  const { rows: rec } = await pool.query(
    `SELECT COALESCE(unidade_origem_id, $3) AS unidade, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE unidade_origem_id IS NULL)::int AS sem_filial,
            COALESCE(SUM(COALESCE((dados->'valores'->>'vTPrest')::numeric, valor_total)), 0)::float AS v
       FROM ctes_emitidos WHERE status = 'autorizado' AND demonstracao = $4 AND (autorizado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1 AND $2 GROUP BY 1`,
    [de, ate, matriz?.id || null, demo]);
  let semFilial = 0;
  rec.forEach((r) => { const l = de_(centroDaUnidade.get(r.unidade)); l.receita = centavos(l.receita + r.v); l.documentos += r.n; semFilial += r.sem_filial; });
  const { rows: [nf] } = await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(valor), 0)::float AS v FROM nfse_emitidas WHERE status = 'autorizada' AND demonstracao = $3
      AND (autorizada_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1 AND $2`, [de, ate, demo]);
  if (nf.n) { const l = de_(centroDaUnidade.get(matriz?.id)); l.receita = centavos(l.receita + nf.v); l.documentos += nf.n; }

  const { rows: desp } = await pool.query(
    `SELECT centro_custo_id AS centro, categoria, COUNT(*)::int AS n, COALESCE(SUM(valor), 0)::float AS v FROM contas_pagar
      WHERE status <> 'cancelada' AND vencimento BETWEEN $1 AND $2 GROUP BY 1, 2`, [de, ate]);
  desp.forEach((d) => {
    const l = de_(d.centro);
    l.despesas = centavos(l.despesas + d.v); l.contas += d.n; l.por_categoria[d.categoria] = centavos((l.por_categoria[d.categoria] || 0) + d.v);
  });
  const lista = [...mapa.values(), sem].filter((l) => l.ativo || l.receita || l.despesas)
    .map((l) => ({ ...l, resultado: centavos(l.receita - l.despesas), margem_pct: l.receita ? Math.round(((l.receita - l.despesas) / l.receita) * 1000) / 10 : null }));
  const tot = (k) => centavos(lista.reduce((s, l) => s + l[k], 0));
  return {
    periodo: { de, ate }, centros: lista.filter((l) => l.id || l.receita || l.despesas), tipos: TIPOS,
    totais: { receita: tot('receita'), despesas: tot('despesas'), resultado: tot('resultado') }, sem_filial: semFilial, matriz_id: matriz?.id || null,
    contas_sem_centro: sem.contas, despesas_sem_centro: sem.despesas,
  };
}

// Contas do período de um centro (ou sem centro), para conferir e reclassificar.
async function contas({ de, ate, centro }) {
  if (!iso(de) || !iso(ate)) throw falha('Informe o período.');
  const id = centro === 'sem' ? null : Number(centro) || null;
  const { rows } = await pool.query(
    `SELECT cp.id, cp.descricao, cp.categoria, cp.fornecedor_nome, cp.vencimento::text AS vencimento, cp.valor::float AS valor, cp.status, cp.centro_custo_id
       FROM contas_pagar cp WHERE cp.status <> 'cancelada' AND cp.vencimento BETWEEN $1 AND $2
        AND (($3::int IS NULL AND cp.centro_custo_id IS NULL) OR cp.centro_custo_id = $3) ORDER BY cp.vencimento, cp.id LIMIT 500`, [de, ate, id]);
  return rows;
}

module.exports = { TIPOS, listar, criar, alterar, criarAutomatico, atribuirContasAntigas, atribuir, resultado, contas };
