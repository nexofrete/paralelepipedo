// Resultado (margem) por CT-e e por cliente, estilo SSW:
//   receita do frete − impostos (ICMS/ISS + % de PIS/COFINS/IR) − seguro da carga
//   − custo da viagem rateado − custo da frota própria rateado = margem.
// O custo de cada viagem (MDF-e, romaneio de entrega, transferência entre
// filiais) é dividido entre os CT-e que ela levou pelo peso (ou pelo valor,
// quando não há peso). O custo da frota própria do período (abastecimentos e
// manutenções) é dividido entre os CT-e que cada caminhão levou.
// No fim, um demonstrativo do período com as despesas da empresa.
const pool = require('./db');
const { custosDoMdfe } = require('./acertos');

const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const pct = (parte, total) => (total ? Math.round((parte / total) * 1000) / 10 : null);
const docLimpo = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const placaLimpa = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const isoDe = (v) => (v ? (v instanceof Date ? new Date(v.getTime() - 3 * 3600000).toISOString() : String(v)).slice(0, 10) : null);
const somaCustos = (c) => centavos(['combustivel', 'pedagio', 'motorista', 'terceiro', 'outros'].reduce((s, k) => s + (Number(c?.[k]) || 0), 0));

const CONFIG_PADRAO = { impostos_pct: 0, seguro_pct: 0, meta_margem_pct: 15 };
// Despesas da empresa que entram no demonstrativo (as de viagem e de frota já estão nos custos acima).
const DESPESAS_EMPRESA = ['salarios', 'aluguel', 'administrativo', 'seguro', 'outros'];

async function config() {
  const { rows } = await pool.query('SELECT resultado_config FROM empresa WHERE id = 1');
  return { ...CONFIG_PADRAO, ...(rows[0]?.resultado_config || {}) };
}
async function salvarConfig(b = {}) {
  const num = (v, max) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : 0; };
  const c = { impostos_pct: num(b.impostos_pct, 40), seguro_pct: num(b.seguro_pct, 5), meta_margem_pct: num(b.meta_margem_pct, 100) };
  await pool.query('UPDATE empresa SET resultado_config = $1 WHERE id = 1', [JSON.stringify(c)]);
  return c;
}

// Peso do CT-e em kg (quantidade em KG ou TON).
function pesoKg(d = {}) {
  const q = d.carga?.quantidades || [];
  const kg = q.find((x) => String(x.cUnid).padStart(2, '0') === '01');
  if (kg) return Number(kg.qCarga) || 0;
  const t = q.find((x) => String(x.cUnid).padStart(2, '0') === '02');
  return t ? (Number(t.qCarga) || 0) * 1000 : 0;
}
function tomadorDe(d = {}) {
  const p = { 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')] || {};
  return { doc: docLimpo(p.cnpj || p.cpf), nome: p.xNome || '—' };
}

// Divide um valor entre itens proporcionalmente ao peso (ou à receita, sem peso), sem perder centavos.
function ratear(total, itens) {
  const valor = centavos(total);
  if (!itens.length || !valor) return itens.map(() => 0);
  const pesoTotal = itens.reduce((s, i) => s + (i.peso || 0), 0);
  const base = pesoTotal > 0 ? itens.map((i) => i.peso || 0) : itens.map((i) => i.receita || 0);
  const soma = base.reduce((s, x) => s + x, 0);
  const partes = soma > 0 ? base.map((x) => Math.floor((valor * x / soma) * 100) / 100) : itens.map(() => Math.floor((valor / itens.length) * 100) / 100);
  const resto = centavos(valor - partes.reduce((s, x) => s + x, 0));
  const maior = partes.indexOf(Math.max(...partes));
  partes[maior] = centavos(partes[maior] + resto);
  return partes;
}

// Monta o resultado do período (de/ate em AAAA-MM-DD).
async function calcular({ de, ate }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(de)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(ate)) || de > ate) throw Object.assign(new Error('Período inválido.'), { status: 400 });
  if ((Date.parse(ate) - Date.parse(de)) / 86400000 > 366) throw Object.assign(new Error('Escolha um período de até 1 ano.'), { status: 400 });
  const cfg = await config();
  // Viagens começam antes e terminam depois: pega uma janela maior para achar a viagem de cada CT-e.
  const janelaDe = new Date(Date.parse(`${de}T12:00:00Z`) - 45 * 86400000).toISOString().slice(0, 10);
  const janelaAte = new Date(Date.parse(`${ate}T12:00:00Z`) + 45 * 86400000).toISOString().slice(0, 10);

  const { rows: ctes } = await pool.query(
    `SELECT id, serie, numero, chave, autorizado_em, valor_total, dados, demonstracao, cidade_fim, uf_fim, destinatario_nome, vendedor_id
       FROM ctes_emitidos WHERE status = 'autorizado' AND (autorizado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date`, [janelaDe, janelaAte]);
  const noPeriodo = (d) => { const x = isoDe(d); return x >= de && x <= ate; };
  const docs = new Map();   // id → linha do CT-e com receita e custos
  for (const c of ctes) {
    const d = c.dados || {};
    const receita = centavos(Number(d.valores?.vTPrest ?? c.valor_total) || 0);
    const t = tomadorDe(d);
    docs.set(c.id, {
      id: c.id, tipo: 'cte', documento: `CT-e ${c.serie}/${c.numero}`, chave: c.chave, data: isoDe(c.autorizado_em), no_periodo: noPeriodo(c.autorizado_em),
      demonstracao: c.demonstracao, complementar: String(d.tpCTe ?? '0') === '1', tomador_doc: t.doc, tomador_nome: t.nome,
      origem: d.inicio ? `${d.inicio.xMun}/${d.inicio.UF}` : null, destino: d.fim ? `${d.fim.xMun}/${d.fim.UF}` : (c.cidade_fim ? `${c.cidade_fim}/${c.uf_fim}` : null),
      peso: String(d.tpCTe ?? '0') === '1' ? 0 : pesoKg(d), receita, icms: centavos(d.icms?.vICMS), valor_carga: Number(d.carga?.vCarga) || 0,
      viagem: 0, frota: 0, viagens: [], placas: new Set(), vendedor_id: c.vendedor_id,
    });
  }
  const porChave = new Map([...docs.values()].filter((x) => x.chave).map((x) => [x.chave, x]));

  // --- Viagens (MDF-e): custos lançados no MDF-e (à mão ou pelo acerto) ---
  const { rows: mdfes } = await pool.query(
    `SELECT id, serie, numero, placa, custos, dados, autorizado_em FROM mdfes WHERE status IN ('autorizado', 'encerrado')
      AND (autorizado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date`, [janelaDe, janelaAte]);
  const viagens = [];
  for (const m of mdfes) {
    const itens = [...new Set((m.dados?.descargas || []).flatMap((x) => x.ctes || []))].map((k) => porChave.get(k)).filter(Boolean);
    itens.forEach((i) => { if (m.placa) i.placas.add(placaLimpa(m.placa)); });
    viagens.push({ rotulo: `MDF-e ${m.serie}/${m.numero}`, custo: somaCustos(m.custos), itens, placa: placaLimpa(m.placa), combustivel: Number(m.custos?.combustivel) || 0,
      no_periodo: isoDe(m.autorizado_em) >= de && isoDe(m.autorizado_em) <= ate });
  }
  // --- Romaneios de entrega e transferências: custo do acerto ligado a eles (sem MDF-e) ---
  const ids = [...docs.keys()];
  const { rows: rom } = ids.length ? await pool.query(
    `SELECT ri.romaneio_id, ri.cte_id, r.placa FROM romaneio_itens ri JOIN romaneios r ON r.id = ri.romaneio_id WHERE ri.cte_id = ANY($1::int[])`, [ids]) : { rows: [] };
  const { rows: tra } = ids.length ? await pool.query(
    `SELECT ti.transferencia_id, ti.cte_id, t.placa FROM transferencia_itens ti JOIN transferencias t ON t.id = ti.transferencia_id WHERE ti.cte_id = ANY($1::int[])`, [ids]) : { rows: [] };
  rom.concat(tra).forEach((x) => { if (x.placa) docs.get(x.cte_id)?.placas.add(placaLimpa(x.placa)); });
  const { rows: acertos } = await pool.query(
    `SELECT * FROM acertos WHERE status = 'acertado' AND mdfe_id IS NULL AND (romaneio_id IS NOT NULL OR transferencia_id IS NOT NULL)`);
  if (acertos.length) {
    const { rows: lanc } = await pool.query('SELECT * FROM acerto_lancamentos WHERE acerto_id = ANY($1::int[])', [acertos.map((a) => a.id)]);
    for (const a of acertos) {
      const custo = somaCustos(custosDoMdfe(a, lanc.filter((l) => l.acerto_id === a.id)));
      const lista = a.romaneio_id ? rom.filter((x) => x.romaneio_id === a.romaneio_id) : tra.filter((x) => x.transferencia_id === a.transferencia_id);
      const itens = lista.map((x) => docs.get(x.cte_id)).filter(Boolean);
      if (itens.length) viagens.push({ rotulo: a.romaneio_id ? `Romaneio ${a.romaneio_id}` : `Transferência ${a.transferencia_id}`, custo, itens });
    }
  }
  let viagemSemCte = 0;
  for (const v of viagens) {
    // Viagem sem CT-e: só a do período (as da janela de ±45 dias são de outros meses).
    if (!v.itens.length) { if (v.no_periodo !== false) viagemSemCte = centavos(viagemSemCte + v.custo); continue; }
    ratear(v.custo, v.itens).forEach((parte, i) => { v.itens[i].viagem = centavos(v.itens[i].viagem + parte); if (v.custo > 0) v.itens[i].viagens.push(v.rotulo); });
  }

  // --- Frota própria: combustível (não pago pelo motorista, que já está no acerto) e manutenção do período ---
  const { rows: veics } = await pool.query(`SELECT id, placa FROM veiculos WHERE proprietario IS NULL`);
  const { rows: ab } = await pool.query(
    `SELECT veiculo_id, COALESCE(SUM(valor_total), 0)::float AS v FROM abastecimentos WHERE pagamento <> 'motorista' AND data BETWEEN $1::date AND $2::date GROUP BY 1`, [de, ate]);
  const { rows: mn } = await pool.query(
    `SELECT veiculo_id, COALESCE(SUM(valor_total), 0)::float AS v FROM manutencoes WHERE status = 'concluida' AND COALESCE(data_saida, data) BETWEEN $1::date AND $2::date GROUP BY 1`, [de, ate]);
  const frotaVeic = veics.map((v) => ({ ...v, placa: placaLimpa(v.placa), custo: centavos((ab.find((x) => x.veiculo_id === v.id)?.v || 0) + (mn.find((x) => x.veiculo_id === v.id)?.v || 0)) }))
    .filter((v) => v.custo > 0);
  // Combustível lançado no MDF-e de um caminhão próprio que também tem abastecimentos no período: pode estar contado duas vezes.
  const duplicidade = viagens.filter((v) => v.no_periodo && v.combustivel > 0 && v.placa && frotaVeic.some((f) => f.placa === v.placa && (ab.find((x) => x.veiculo_id === f.id)?.v || 0) > 0))
    .map((v) => ({ viagem: v.rotulo, placa: v.placa, combustivel: centavos(v.combustivel) }));
  let frotaSemCte = 0;
  for (const v of frotaVeic) {
    const itens = [...docs.values()].filter((x) => x.no_periodo && x.placas.has(v.placa));
    if (!itens.length) { frotaSemCte = centavos(frotaSemCte + v.custo); continue; }
    ratear(v.custo, itens).forEach((parte, i) => { itens[i].frota = centavos(itens[i].frota + parte); });
  }

  // --- NFS-e do frete municipal (receita com ISS) ---
  const { rows: nfses } = await pool.query(
    `SELECT id, numero_nfse, autorizada_em, valor, iss_valor, tomador_doc, tomador_nome, demonstracao, vendedor_id FROM nfse_emitidas
      WHERE status = 'autorizada' AND (autorizada_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date`, [de, ate]);

  const perc = await require('./comissoes').percentuais().catch(() => ({ porCliente: new Map(), porVendedor: new Map() }));
  // --- Linhas do período com a margem ---
  const linhas = [...docs.values()].filter((x) => x.no_periodo).map((x) => ({ ...x, iss: 0 }))
    .concat(nfses.map((n) => ({
      id: n.id, tipo: 'nfse', documento: `NFS-e ${n.numero_nfse}`, data: isoDe(n.autorizada_em), demonstracao: n.demonstracao, complementar: false,
      tomador_doc: docLimpo(n.tomador_doc), tomador_nome: n.tomador_nome, origem: null, destino: 'frete municipal', peso: 0, receita: centavos(n.valor),
      icms: 0, iss: centavos(n.iss_valor), valor_carga: 0, viagem: 0, frota: 0, viagens: [], placas: new Set(), vendedor_id: n.vendedor_id,
    })))
    .map((x) => {
      const impostos = centavos(x.icms + x.iss + (x.receita * cfg.impostos_pct) / 100);
      const seguro = centavos((x.valor_carga * cfg.seguro_pct) / 100);
      // Comissão do vendedor (o do documento, ou o do cliente), sobre a receita.
      // O % próprio do cliente vale quando o vendedor do documento é o do cliente (igual ao fechamento).
      const doCliente = perc.vendedorDoCliente?.get(x.tomador_doc);
      const pctCom = x.vendedor_id && x.vendedor_id !== doCliente ? (perc.porVendedor.get(x.vendedor_id) || 0) : (perc.porCliente.get(x.tomador_doc) || 0);
      const comissao = centavos((x.receita * pctCom) / 100);
      const custo = centavos(impostos + seguro + comissao + x.viagem + x.frota);
      const margem = centavos(x.receita - custo);
      return {
        id: x.id, tipo: x.tipo, documento: x.documento, chave: x.chave || null, data: x.data, demonstracao: x.demonstracao, complementar: x.complementar,
        tomador_doc: x.tomador_doc, tomador_nome: x.tomador_nome, origem: x.origem, destino: x.destino, peso: Math.round(x.peso),
        receita: x.receita, icms: x.icms, iss: x.iss, impostos, seguro, comissao, viagem: x.viagem, frota: x.frota, custo, margem, margem_pct: pct(margem, x.receita),
        sem_custo_operacional: !x.viagem && !x.frota && x.tipo === 'cte' && !x.complementar, viagens: x.viagens, placas: [...x.placas],
      };
    })
    .sort((a, b) => (a.data < b.data ? 1 : -1));

  // --- Por cliente (tomador) ---
  const mapa = new Map();
  for (const l of linhas) {
    const k = l.tomador_doc || '—';
    const g = mapa.get(k) || { doc: l.tomador_doc, nome: l.tomador_nome, documentos: 0, peso: 0, receita: 0, impostos: 0, seguro: 0, comissao: 0, viagem: 0, frota: 0, custo: 0, margem: 0, sem_custo: 0 };
    g.documentos += 1; g.peso += l.peso;
    ['receita', 'impostos', 'seguro', 'comissao', 'viagem', 'frota', 'custo', 'margem'].forEach((c) => { g[c] = centavos(g[c] + l[c]); });
    if (l.sem_custo_operacional) g.sem_custo += 1;
    mapa.set(k, g);
  }
  const clientes = [...mapa.values()].map((g) => ({
    ...g, margem_pct: pct(g.margem, g.receita), ticket: g.documentos ? centavos(g.receita / g.documentos) : null,
    frete_kg: g.peso ? Math.round((g.receita / g.peso) * 1000) / 1000 : null, custo_kg: g.peso ? Math.round(((g.custo - g.impostos) / g.peso) * 1000) / 1000 : null,
    abaixo_meta: g.receita > 0 && pct(g.margem, g.receita) < cfg.meta_margem_pct,
  })).sort((a, b) => b.margem - a.margem);

  // --- Demonstrativo do período ---
  const soma = (campo) => centavos(linhas.reduce((s, l) => s + l[campo], 0));
  const receita = soma('receita');
  const { rows: desp } = await pool.query(
    `SELECT categoria, COALESCE(SUM(valor), 0)::float AS v FROM contas_pagar
      WHERE status <> 'cancelada' AND acerto_id IS NULL AND categoria = ANY($3::text[]) AND vencimento BETWEEN $1::date AND $2::date GROUP BY 1`,
    [de, ate, DESPESAS_EMPRESA]);
  const despesas = centavos(desp.reduce((s, d) => s + d.v, 0));
  const margemContribuicao = centavos(receita - soma('impostos') - soma('seguro') - soma('comissao') - soma('viagem') - soma('frota'));
  const naoRateado = centavos(viagemSemCte + frotaSemCte);
  const resultado = centavos(margemContribuicao - naoRateado - despesas);
  const comCusto = linhas.filter((l) => l.tipo === 'cte' && !l.complementar);
  return {
    periodo: { de, ate }, config: cfg,
    demonstrativo: {
      receita, icms: soma('icms'), iss: soma('iss'), outros_impostos: centavos(soma('impostos') - soma('icms') - soma('iss')), impostos: soma('impostos'),
      seguro: soma('seguro'), comissao: soma('comissao'), viagem: soma('viagem'), frota: soma('frota'), margem_contribuicao: margemContribuicao, margem_contribuicao_pct: pct(margemContribuicao, receita),
      nao_rateado: naoRateado, viagem_sem_cte: viagemSemCte, frota_sem_cte: frotaSemCte,
      despesas, despesas_detalhe: Object.fromEntries(desp.map((d) => [d.categoria, centavos(d.v)])), resultado, resultado_pct: pct(resultado, receita),
      documentos: linhas.length, sem_custo: comCusto.filter((l) => l.sem_custo_operacional).length, ctes_carga: comCusto.length,
      demonstracao: linhas.some((l) => l.demonstracao), duplicidade,
      // Seguro da carga pelo % e também contas "Seguro" no período: se forem do seguro de carga, está contado duas vezes.
      seguro_em_dobro: cfg.seguro_pct > 0 && desp.some((d) => d.categoria === 'seguro' && d.v > 0) ? centavos(desp.find((d) => d.categoria === 'seguro').v) : 0,
    },
    clientes, documentos: linhas,
  };
}

module.exports = { CONFIG_PADRAO, config, salvarConfig, calcular, ratear, pesoKg };
