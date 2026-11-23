// Cargas (embarcador, tela Cargas: Embarques 430, Pré-conhecimentos 431, Cargas fracionadas 432, Capacidade 433).
//  - Embarque: a expedição monta a carga (notas, transportadora, veículo, data), vê o peso, os m³ e a ocupação do veículo,
//    o frete previsto (soma do fracionado pela tabela, ou a viagem da tabela de lotação) e o aviso de capacidade da
//    transportadora no dia; fechado, gera os pré-conhecimentos e a ordem de coleta (src/ordensColeta.js).
//  - Pré-conhecimento: o frete esperado de cada nota (componentes da tabela ou o rateio da lotação pelo peso), numerado,
//    mandado à transportadora e conferido com o CT-e quando ele chega (confere / divergente, tolerância de 2% ou R$ 2).
//  - Cargas fracionadas: as notas que esperam embarque, por destino, com o frete fracionado somado × a melhor tabela de
//    lotação que comporta o peso e os m³; sugere virar lotação quando sai mais barato.
//  - Capacidade: quanto cada transportadora aguenta por dia (veículos, kg, m³) × o que está programado para ela
//    (embarques e ordens de coleta), nos próximos dias.
const pool = require('./db');
const { consultaCliente } = require('./permissoes');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
// "1.234,56" ou "1234.56" → 1234.56.
const numero = (v) => {
  if (v === '' || v == null) return null;
  let t = String(v).trim(); if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t); return Number.isFinite(n) ? n : null;
};
const r2 = (v) => (v == null ? null : Math.round(Number(v) * 100) / 100);
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const mesmoNome = (a, b) => { const x = norm(a); const y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
const hojeSP = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const dataOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
// Capacidade típica de cada veículo (quando a tabela de lotação não traz): kg e m³.
const VEICULOS = {
  utilitario: { nome: 'Utilitário / VUC', kg: 1500, m3: 8 }, toco: { nome: 'Toco', kg: 6000, m3: 30 }, truck: { nome: 'Truck', kg: 12000, m3: 45 },
  carreta: { nome: 'Carreta', kg: 27000, m3: 90 }, bitrem: { nome: 'Bitrem / rodotrem', kg: 37000, m3: 110 }, container: { nome: 'Contêiner', kg: 26000, m3: 67 },
};
const TOL_PCT = 0.02; const TOL_RS = 2;
const FOB = "COALESCE(f.frete_cif_fob, '') NOT IN ('FOB', 'Destinatário', 'Destinatario', 'Sem frete', 'Próprio destinatário')";
const EMB_ABERTO = "e.status IN ('montagem', 'fechado') AND NOT EXISTS (SELECT 1 FROM ordens_coleta o LEFT JOIN patio_visitas v ON v.id = o.visita_id WHERE o.id = e.ordem_id AND (o.status IN ('cancelada', 'recusada') OR v.status = 'saiu'))";

// Ocupação do veículo: o maior entre peso/cap e m³/cap.
function ocupacao(peso, m3, capKg, capM3) {
  const a = capKg ? (Number(peso) || 0) / capKg : null; const b = capM3 ? (Number(m3) || 0) / capM3 : null;
  if (a == null && b == null) return null;
  return Math.max(a || 0, b || 0);
}
// Conferência do pré-conhecimento com o CT-e.
function conferir(previsto, cobrado) {
  if (previsto == null || cobrado == null) return null;
  const dif = r2(Number(cobrado) - Number(previsto));
  return { dif, confere: Math.abs(dif) <= Math.max(TOL_RS, Math.abs(Number(previsto)) * TOL_PCT) };
}
// Rateio da viagem de lotação: pelo peso quando todas as notas têm peso; senão pelo valor da mercadoria; senão em
// partes iguais. A última nota fecha os centavos.
function ratear(total, notas) {
  const base = notas.every((n) => Number(n.peso) > 0) ? 'peso' : notas.every((n) => Number(n.valor) > 0) ? 'valor' : null;
  const pesos = notas.map((n) => (base ? Number(n[base]) : 1)); const soma = pesos.reduce((a, b) => a + b, 0);
  let acum = 0;
  return notas.map((n, i) => {
    if (i === notas.length - 1) return r2(total - acum);
    const v = r2(soma ? (total * pesos[i]) / soma : total / notas.length); acum = r2(acum + v); return v;
  });
}

const CAMPOS_NOTA = `f.id, LTRIM(f.numero_nf, '0') AS numero, f.numero_pedido AS pedido, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS emissao, f.cliente, f.cidade, f.uf,
  f.qtd_volumes AS volumes, COALESCE(f.peso_bruto, f.peso_kg)::float AS peso, f.cubagem_m3::float AS m3, f.valor_faturado::float AS valor,
  COALESCE(f.transportadora, f.transportadora_nfe) AS transportadora, COALESCE(f.valor_total_frete, f.valor_total_calculado)::float AS frete_previsto,
  f.auditoria_calculo, f.tabela_frete, f.prazo_dias_tabela AS prazo, f.chave_cte, f.numero_cte, f.valor_total_cte::float AS valor_cte, f.redespacho`;
async function notasPorIds(req, ids) {
  if (!ids.length) return [];
  const { rows } = await consultaCliente(req, `SELECT ${CAMPOS_NOTA} FROM fretes f WHERE f.id = ANY($1) ORDER BY f.numero_nf`, [ids]);
  return rows;
}
// Notas que esperam embarque: CIF, últimos 45 dias, sem CT-e, sem saída e fora de outro embarque aberto.
async function candidatas(req, q = {}, { exceto = 0 } = {}) {
  const p = [exceto]; const cond = [];
  if (String(q.transportadora || '').trim()) { p.push(`%${String(q.transportadora).trim()}%`); cond.push(`COALESCE(f.transportadora, f.transportadora_nfe) ILIKE $${p.length}`); }
  if (/^[A-Za-z]{2}$/.test(q.uf || '')) { p.push(String(q.uf).toUpperCase()); cond.push(`UPPER(f.uf) = $${p.length}`); }
  const { rows } = await consultaCliente(req, `SELECT ${CAMPOS_NOTA} FROM fretes f
    WHERE f.frete_principal_id IS NULL AND COALESCE(f.numero_nf, '') <> '' AND f.nf_cancelada IS NOT TRUE AND f.nf_entrada IS NOT TRUE AND ${FOB}
      AND f.data_saida IS NULL AND f.data_entrega IS NULL AND f.chave_cte IS NULL AND f.cte_coberto_por IS NULL
      AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado') AND f.data_emissao_nf >= CURRENT_DATE - 45
      AND NOT EXISTS (SELECT 1 FROM embarques e WHERE f.id = ANY(e.frete_ids) AND e.id <> $1 AND ${EMB_ABERTO})
      ${cond.length ? `AND ${cond.join(' AND ')}` : ''}
    ORDER BY f.uf, f.cidade, f.data_emissao_nf LIMIT 2000`, p);
  return rows.map(({ auditoria_calculo: _a, ...r }) => r);
}

// ---------------- Tabelas de lotação ----------------
async function lotacoes({ todas = false } = {}) {
  const { rows } = await pool.query(`SELECT * FROM tabelas_lotacao ${todas ? '' : 'WHERE ativa'} ORDER BY transportadora, uf_destino, cidade_destino NULLS FIRST, valor_viagem`);
  return rows.map((l) => ({ ...l, valor_viagem: Number(l.valor_viagem), cap_kg: l.cap_kg != null ? Number(l.cap_kg) : VEICULOS[l.tipo_veiculo]?.kg ?? null,
    cap_m3: l.cap_m3 != null ? Number(l.cap_m3) : VEICULOS[l.tipo_veiculo]?.m3 ?? null }));
}
async function salvarLotacao(id, b) {
  const v = [texto(b.transportadora, 160), /^[A-Za-z]{2}$/.test(b.uf_destino || '') ? String(b.uf_destino).toUpperCase() : null, texto(b.cidade_destino, 120),
    VEICULOS[b.tipo_veiculo] ? b.tipo_veiculo : null, numero(b.valor_viagem), numero(b.cap_kg), numero(b.cap_m3), parseInt(b.prazo_dias, 10) || null, b.ativa !== false, texto(b.observacao, 500)];
  if (!v[0]) throw falha('Informe a transportadora.');
  if (!v[1]) throw falha('Informe a UF de destino.');
  if (!v[4] || v[4] <= 0) throw falha('Informe o valor da viagem.');
  if (id) await pool.query('UPDATE tabelas_lotacao SET transportadora=$1, uf_destino=$2, cidade_destino=$3, tipo_veiculo=$4, valor_viagem=$5, cap_kg=$6, cap_m3=$7, prazo_dias=$8, ativa=$9, observacao=$10 WHERE id=$11', [...v, id]);
  else await pool.query('INSERT INTO tabelas_lotacao (transportadora, uf_destino, cidade_destino, tipo_veiculo, valor_viagem, cap_kg, cap_m3, prazo_dias, ativa, observacao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', v);
  return lotacoes({ todas: true });
}
async function excluirLotacao(id) { await pool.query('DELETE FROM tabelas_lotacao WHERE id = $1', [id]); return lotacoes({ todas: true }); }
// Lotações que servem ao destino (cidade exata ou a UF toda) e comportam a carga; a mais barata primeiro.
function opcoesLotacao(tabs, { cidade, uf, peso, m3 }) {
  return tabs.filter((t) => t.ativa && t.uf_destino === String(uf || '').toUpperCase() && (!t.cidade_destino || norm(t.cidade_destino) === norm(cidade))
    && (!t.cap_kg || (Number(peso) || 0) <= t.cap_kg) && (!t.cap_m3 || (Number(m3) || 0) <= t.cap_m3))
    .sort((a, b) => a.valor_viagem - b.valor_viagem);
}

// ---------------- Cargas fracionadas ----------------
async function fracionadas(req, q = {}) {
  const [notas, tabs] = await Promise.all([candidatas(req, q), lotacoes()]);
  const grupos = new Map();
  for (const n of notas) {
    const k = `${norm(n.cidade)}|${String(n.uf || '').toUpperCase()}`;
    const g = grupos.get(k) || { cidade: n.cidade, uf: String(n.uf || '').toUpperCase(), notas: [], peso: 0, m3: 0, valor: 0, volumes: 0, fracionado: 0, sem_calculo: 0, transportadoras: new Set() };
    g.notas.push(n.id); g.peso += Number(n.peso) || 0; g.m3 += Number(n.m3) || 0; g.valor += Number(n.valor) || 0; g.volumes += Number(n.volumes) || 0;
    if (n.frete_previsto) g.fracionado += n.frete_previsto; else g.sem_calculo += 1;
    if (n.transportadora) g.transportadoras.add(n.transportadora);
    grupos.set(k, g);
  }
  const destinos = [...grupos.values()].map((g) => {
    const ops = opcoesLotacao(tabs, g); const best = ops[0] || null;
    const fr = r2(g.fracionado);
    const economia = best && fr && !g.sem_calculo ? r2(fr - best.valor_viagem) : null;
    const oc = best ? ocupacao(g.peso, g.m3, best.cap_kg, best.cap_m3) : null;
    return { destino: [g.cidade, g.uf].filter(Boolean).join('/'), cidade: g.cidade, uf: g.uf, notas: g.notas.length, frete_ids: g.notas, volumes: g.volumes, peso: r2(g.peso), m3: r2(g.m3), valor: r2(g.valor),
      fracionado: fr, sem_calculo: g.sem_calculo, transportadoras: [...g.transportadoras], lotacao: best ? { id: best.id, transportadora: best.transportadora, tipo_veiculo: best.tipo_veiculo,
        veiculo: VEICULOS[best.tipo_veiculo]?.nome || best.tipo_veiculo || '', valor: best.valor_viagem, cap_kg: best.cap_kg, cap_m3: best.cap_m3, prazo_dias: best.prazo_dias } : null,
      opcoes: ops.length, ocupacao: oc, economia,
      sugestao: !best ? 'Sem tabela de lotação para o destino' : g.sem_calculo ? 'Notas sem frete calculado: confira' : economia > 0 ? 'Virar lotação' : 'Manter fracionada' };
  }).sort((a, b) => (b.economia || -1e9) - (a.economia || -1e9) || b.peso - a.peso);
  const vira = destinos.filter((d) => d.sugestao === 'Virar lotação');
  return { destinos, resumo: { destinos: destinos.length, notas: notas.length, peso: r2(destinos.reduce((t, d) => t + d.peso, 0)), fracionado: r2(destinos.reduce((t, d) => t + (d.fracionado || 0), 0)),
    virar_lotacao: vira.length, economia: r2(vira.reduce((t, d) => t + d.economia, 0)) }, veiculos: VEICULOS };
}

// ---------------- Capacidade ----------------
async function capacidades({ todas = false } = {}) {
  const { rows } = await pool.query(`SELECT * FROM transportadora_capacidades ${todas ? '' : 'WHERE ativa'} ORDER BY transportadora, regiao NULLS FIRST`);
  return rows.map((c) => ({ ...c, peso_dia_kg: c.peso_dia_kg != null ? Number(c.peso_dia_kg) : null, m3_dia: c.m3_dia != null ? Number(c.m3_dia) : null }));
}
async function salvarCapacidade(id, b) {
  const v = [texto(b.transportadora, 160), texto(b.regiao, 120), parseInt(b.veiculos_dia, 10) || null, numero(b.peso_dia_kg), numero(b.m3_dia), texto(b.observacao, 500), b.ativa !== false];
  if (!v[0]) throw falha('Informe a transportadora.');
  if (!v[2] && !v[3] && !v[4]) throw falha('Informe pelo menos uma capacidade (veículos, kg ou m³ por dia).');
  if (id) await pool.query('UPDATE transportadora_capacidades SET transportadora=$1, regiao=$2, veiculos_dia=$3, peso_dia_kg=$4, m3_dia=$5, observacao=$6, ativa=$7 WHERE id=$8', [...v, id]);
  else await pool.query('INSERT INTO transportadora_capacidades (transportadora, regiao, veiculos_dia, peso_dia_kg, m3_dia, observacao, ativa) VALUES ($1,$2,$3,$4,$5,$6,$7)', v);
  return capacidades({ todas: true });
}
async function excluirCapacidade(id) { await pool.query('DELETE FROM transportadora_capacidades WHERE id = $1', [id]); return capacidades({ todas: true }); }
// O que está programado por transportadora e dia: embarques abertos (pela data prevista) e ordens de coleta enviadas ou
// aceitas que não vieram de um embarque (pela chegada confirmada ou pela data pronta).
async function programado(de, ate) {
  const { rows } = await pool.query(`
    SELECT e.transportadora, to_char(e.data_prevista, 'YYYY-MM-DD') AS dia, COUNT(*)::int AS veiculos, COALESCE(SUM(e.peso_kg), 0)::float AS peso, COALESCE(SUM(e.cubagem_m3), 0)::float AS m3
      FROM embarques e WHERE ${EMB_ABERTO} AND e.data_prevista BETWEEN $1::date AND $2::date GROUP BY 1, 2
    UNION ALL
    SELECT o.transportadora, to_char(COALESCE(o.previsto_em, o.coletar_em) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD'), COUNT(*)::int, COALESCE(SUM(o.peso_kg), 0)::float, COALESCE(SUM(o.cubagem_m3), 0)::float
      FROM ordens_coleta o WHERE o.tipo = 'coleta' AND o.status IN ('enviada', 'aceita') AND NOT EXISTS (SELECT 1 FROM embarques e WHERE e.ordem_id = o.id)
        AND (COALESCE(o.previsto_em, o.coletar_em) AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date GROUP BY 1, 2`, [de, ate]).catch(() => ({ rows: [] }));
  return rows;
}
const capDe = (caps, transportadora) => caps.filter((c) => c.ativa && !c.regiao && mesmoNome(c.transportadora, transportadora))[0]
  || caps.filter((c) => c.ativa && mesmoNome(c.transportadora, transportadora))[0] || null;
// Aviso quando o que se quer programar passa da capacidade do dia (null = cabe ou não há capacidade cadastrada).
function avisoCapacidade(cap, uso, extra = { veiculos: 0, peso: 0, m3: 0 }) {
  if (!cap) return null;
  const v = (uso?.veiculos || 0) + (extra.veiculos || 0); const p = (uso?.peso || 0) + (extra.peso || 0); const m = (uso?.m3 || 0) + (extra.m3 || 0);
  const passa = [];
  if (cap.veiculos_dia && v > cap.veiculos_dia) passa.push(`${v} veículos para ${cap.veiculos_dia} por dia`);
  if (cap.peso_dia_kg && p > cap.peso_dia_kg) passa.push(`${Math.round(p).toLocaleString('pt-BR')} kg para ${Math.round(cap.peso_dia_kg).toLocaleString('pt-BR')} kg por dia`);
  if (cap.m3_dia && m > cap.m3_dia) passa.push(`${Math.round(m * 10) / 10} m³ para ${cap.m3_dia} m³ por dia`);
  return passa.length ? `Passa da capacidade de ${cap.transportadora} no dia: ${passa.join('; ')}.` : null;
}
async function painelCapacidade(q = {}) {
  const de = dataOk(q.de) || hojeSP(); const dias = Math.min(31, Math.max(1, parseInt(q.dias, 10) || 7));
  const lista = Array.from({ length: dias }, (_, i) => { const d = new Date(`${de}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  const [caps, prog] = await Promise.all([capacidades(), programado(lista[0], lista[lista.length - 1])]);
  const nomes = [...new Set([...caps.map((c) => c.transportadora), ...prog.map((p) => p.transportadora).filter(Boolean)])];
  // Junta os nomes parecidos ("TRANSP X LTDA" e "TRANSP X") na linha da capacidade cadastrada.
  const linhas = [];
  for (const nome of nomes) {
    if (linhas.some((l) => mesmoNome(l.transportadora, nome))) continue;
    const cap = capDe(caps, nome);
    const usos = Object.fromEntries(lista.map((d) => [d, { veiculos: 0, peso: 0, m3: 0 }]));
    prog.filter((p) => mesmoNome(p.transportadora, nome)).forEach((p) => { const u = usos[p.dia]; if (u) { u.veiculos += p.veiculos; u.peso += p.peso; u.m3 += p.m3; } });
    linhas.push({ transportadora: cap?.transportadora || nome, capacidade: cap, dias: lista.map((d) => {
      const u = usos[d]; const occ = cap ? Math.max(cap.veiculos_dia ? u.veiculos / cap.veiculos_dia : 0, cap.peso_dia_kg ? u.peso / cap.peso_dia_kg : 0, cap.m3_dia ? u.m3 / cap.m3_dia : 0) : null;
      return { dia: d, ...u, peso: r2(u.peso), m3: r2(u.m3), ocupacao: occ, acima: !!avisoCapacidade(cap, u) };
    }) });
  }
  linhas.sort((a, b) => (b.capacidade ? 1 : 0) - (a.capacidade ? 1 : 0) || a.transportadora.localeCompare(b.transportadora));
  return { dias: lista, linhas, capacidades: await capacidades({ todas: true }) };
}

// ---------------- Embarques ----------------
function situacaoEmbarque(e) {
  if (e.status === 'cancelado') return 'Cancelado';
  if (e.status === 'montagem') return 'Em montagem';
  if (!e.ordem_id) return 'Fechado';
  if (e.ordem_situacao === 'Coletada') return 'Saiu';
  return e.ordem_situacao ? `Coleta: ${e.ordem_situacao.toLowerCase()}` : 'Fechado';
}
const CAMPOS_EMB = `e.*, to_char(e.data_prevista, 'YYYY-MM-DD') AS data, o.status AS ordem_status, o.enviada_em AS ordem_enviada_em, o.coletar_em AS ordem_coletar_em,
  o.previsto_em AS ordem_previsto_em, o.janela_min AS ordem_janela_min, o.placa AS ordem_placa, o.token AS ordem_token, v.status AS ordem_visita_status`;
async function comSituacao(rows) {
  const oc = require('./ordensColeta');
  return rows.map((e) => {
    const ordem_situacao = e.ordem_id ? oc.situacao({ status: e.ordem_status, enviada_em: e.ordem_enviada_em, coletar_em: e.ordem_coletar_em, previsto_em: e.ordem_previsto_em,
      janela_min: e.ordem_janela_min, visita_status: e.ordem_visita_status, tipo: 'coleta' }) : null;
    const x = { ...e, ordem_situacao, peso_kg: e.peso_kg != null ? Number(e.peso_kg) : null, cubagem_m3: e.cubagem_m3 != null ? Number(e.cubagem_m3) : null,
      cap_kg: e.cap_kg != null ? Number(e.cap_kg) : null, cap_m3: e.cap_m3 != null ? Number(e.cap_m3) : null, frete_previsto: e.frete_previsto != null ? Number(e.frete_previsto) : null, valor: e.valor != null ? Number(e.valor) : null };
    return { ...x, situacao: situacaoEmbarque(x), ocupacao: ocupacao(x.peso_kg, x.cubagem_m3, x.cap_kg, x.cap_m3) };
  });
}
async function embarque(id) {
  const { rows } = await pool.query(`SELECT ${CAMPOS_EMB} FROM embarques e LEFT JOIN ordens_coleta o ON o.id = e.ordem_id LEFT JOIN patio_visitas v ON v.id = o.visita_id WHERE e.id = $1`, [id]);
  if (!rows[0]) throw falha('Embarque não encontrado.', 404);
  return (await comSituacao(rows))[0];
}
async function embarques(q = {}) {
  const p = []; const cond = [];
  if (String(q.transportadora || '').trim()) { p.push(`%${String(q.transportadora).trim()}%`); cond.push(`e.transportadora ILIKE $${p.length}`); }
  if (!q.todos) cond.push("(e.status <> 'cancelado' AND (e.data_prevista IS NULL OR e.data_prevista >= CURRENT_DATE - 15))");
  const { rows } = await pool.query(`SELECT ${CAMPOS_EMB} FROM embarques e LEFT JOIN ordens_coleta o ON o.id = e.ordem_id LEFT JOIN patio_visitas v ON v.id = o.visita_id
    ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY e.data_prevista DESC NULLS FIRST, e.id DESC LIMIT 500`, p);
  return comSituacao(rows);
}

async function salvarEmbarque(req, id, b, usuario) {
  const atual = id ? await embarque(id) : null;
  if (atual && atual.status !== 'montagem') throw falha('O embarque já foi fechado; cancele e monte outro para mudar.', 409);
  const ids = [...new Set((Array.isArray(b.frete_ids) ? b.frete_ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
  if (!ids.length) throw falha('Escolha pelo menos uma nota para o embarque.');
  const notas = await notasPorIds(req, ids);
  if (!notas.length) throw falha('Nenhuma das notas foi encontrada.');
  const { rows: outras } = await pool.query(`SELECT e.id FROM embarques e WHERE e.frete_ids && $1::int[] AND e.id <> COALESCE($2, 0) AND ${EMB_ABERTO} LIMIT 1`, [notas.map((n) => n.id), id]);
  if (outras.length) throw falha(`Uma ou mais notas já estão no embarque nº ${outras[0].id}.`, 409);
  const modalidade = b.modalidade === 'lotacao' ? 'lotacao' : 'fracionada';
  const tipo = VEICULOS[b.tipo_veiculo] ? b.tipo_veiculo : null;
  let lot = null;
  if (modalidade === 'lotacao' && b.lotacao_id) lot = (await lotacoes({ todas: true })).find((l) => l.id === Number(b.lotacao_id)) || null;
  const transportadora = texto(b.transportadora, 160) || lot?.transportadora || notas.find((n) => n.transportadora)?.transportadora || null;
  if (!transportadora) throw falha('Informe a transportadora.');
  const data = dataOk(b.data_prevista) || hojeSP();
  const capKg = numero(b.cap_kg) || lot?.cap_kg || VEICULOS[tipo || lot?.tipo_veiculo]?.kg || null;
  const capM3 = numero(b.cap_m3) || lot?.cap_m3 || VEICULOS[tipo || lot?.tipo_veiculo]?.m3 || null;
  const tot = (k) => notas.reduce((s, n) => s + (Number(n[k]) || 0), 0);
  const previsto = modalidade === 'lotacao' ? (lot ? lot.valor_viagem : numero(b.frete_previsto)) : r2(tot('frete_previsto')) || null;
  const vals = [modalidade, transportadora, tipo || lot?.tipo_veiculo || null, data, notas.map((n) => n.id), notas.map((n) => n.numero), Math.round(tot('volumes')) || null, r2(tot('peso')) || null,
    Math.round(tot('m3') * 1000) / 1000 || null, r2(tot('valor')) || null, capKg, capM3, lot?.id || null, previsto, texto(b.observacao, 2000)];
  let novoId = id;
  if (id) {
    await pool.query(`UPDATE embarques SET modalidade=$1, transportadora=$2, tipo_veiculo=$3, data_prevista=$4, frete_ids=$5, notas=$6, volumes=$7, peso_kg=$8, cubagem_m3=$9, valor=$10,
      cap_kg=$11, cap_m3=$12, lotacao_id=$13, frete_previsto=$14, observacao=$15, atualizado_em=NOW() WHERE id=$16`, [...vals, id]);
  } else {
    const { rows: [e] } = await pool.query(`INSERT INTO embarques (modalidade, transportadora, tipo_veiculo, data_prevista, frete_ids, notas, volumes, peso_kg, cubagem_m3, valor, cap_kg, cap_m3,
      lotacao_id, frete_previsto, observacao, criado_por_nome) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`, [...vals, usuario]);
    novoId = e.id;
  }
  const e = await embarque(novoId);
  return { ...e, aviso: await avisoDoEmbarque(e) };
}
// Avisos do embarque: veículo acima da capacidade e capacidade da transportadora no dia.
async function avisoDoEmbarque(e) {
  const avisos = [];
  if (e.ocupacao != null && e.ocupacao > 1) avisos.push(`A carga passa da capacidade do veículo (${Math.round(e.ocupacao * 100)}%).`);
  const caps = await capacidades();
  const cap = capDe(caps, e.transportadora);
  if (cap && e.data) {
    const uso = (await programado(e.data, e.data)).filter((p) => mesmoNome(p.transportadora, e.transportadora))
      .reduce((u, p) => ({ veiculos: u.veiculos + p.veiculos, peso: u.peso + p.peso, m3: u.m3 + p.m3 }), { veiculos: 0, peso: 0, m3: 0 });
    // O próprio embarque já conta quando está aberto; o aviso é sobre o dia inteiro.
    const a = avisoCapacidade(cap, uso);
    if (a) avisos.push(a);
  }
  return avisos.join(' ') || null;
}

// Fecha: gera os pré-conhecimentos das notas (rateio da lotação ou o frete da tabela).
async function fecharEmbarque(req, id, usuario) {
  const e = await embarque(id);
  if (e.status !== 'montagem') throw falha('O embarque já foi fechado.', 409);
  await pool.query("UPDATE embarques SET status = 'fechado', fechado_em = NOW(), atualizado_em = NOW() WHERE id = $1", [id]);
  const pre = await gerarPre(req, e.frete_ids, usuario, { embarque: e });
  const x = await embarque(id);
  return { ...x, pre_gerados: pre.length, aviso: await avisoDoEmbarque(x) };
}
async function cancelarEmbarque(id) {
  const e = await embarque(id);
  if (e.status === 'cancelado') throw falha('O embarque já está cancelado.', 409);
  if (e.ordem_id && ['No pátio', 'Coletada'].includes(e.ordem_situacao)) throw falha('O caminhão já está no pátio (ou já saiu): o embarque não pode mais ser cancelado.', 409);
  await pool.query("UPDATE embarques SET status = 'cancelado', atualizado_em = NOW() WHERE id = $1", [id]);
  await pool.query("UPDATE pre_conhecimentos SET status = 'cancelado' WHERE embarque_id = $1 AND status <> 'cancelado'", [id]);
  if (e.ordem_id) await require('./ordensColeta').cancelar(e.ordem_id, `Embarque ${id} cancelado`, 'Cargas').catch(() => {});
  return embarque(id);
}
// Gera a ordem de coleta das notas do embarque (e manda, se pedir).
async function ordemDoEmbarque(req, id, b, usuario, linkBase) {
  const e = await embarque(id);
  if (e.status === 'montagem') throw falha('Feche o embarque antes de pedir a coleta.');
  if (e.status === 'cancelado') throw falha('O embarque está cancelado.', 409);
  if (e.ordem_id && !['Cancelada', 'Recusada'].includes(e.ordem_situacao)) throw falha(`O embarque já tem a ordem de coleta nº ${e.ordem_id}.`, 409);
  const oc = require('./ordensColeta');
  const hora = /^\d{2}:\d{2}$/.test(b.hora || '') ? b.hora : '08:00';
  const o = await oc.salvar(req, null, { tipo: 'coleta', frete_ids: e.frete_ids, transportadora: e.transportadora, email_para: b.email_para, coletar_em: `${e.data || hojeSP()}T${hora}`,
    janela_min: b.janela_min ?? 240, tipo_veiculo: e.tipo_veiculo, observacao: [`Embarque nº ${e.id}${e.modalidade === 'lotacao' ? ' (lotação, veículo exclusivo)' : ''}`, texto(b.observacao, 500)].filter(Boolean).join(' — ') }, usuario);
  await pool.query('UPDATE embarques SET ordem_id = $2, atualizado_em = NOW() WHERE id = $1', [id, o.id]);
  let aviso = null;
  if (b.enviar) { try { await oc.enviar(o.id, linkBase, usuario, {}); } catch (err) { aviso = err.message; } }
  return { ...(await embarque(id)), ordem: o.id, aviso };
}

// ---------------- Pré-conhecimentos ----------------
function componentesDe(ac) {
  let c = ac; if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = null; } }
  if (!c) return null;
  const k = c.componentes || {};
  const x = { frete_peso: r2(c.valor_resultado), ad_valorem: r2(k.adValorem), gris: r2(k.gris), pedagio: r2(k.pedagio), tde: r2(k.tde), tda: r2(k.tda), trt: r2(k.trt),
    despacho: r2(k.despacho), descarga: r2(k.descarga), icms: r2(k.icms) };
  return Object.fromEntries(Object.entries(x).filter(([, v]) => v));
}
// Gera (ou refaz) o pré-conhecimento de cada nota ainda sem CT-e. embarque: rateio da lotação.
async function gerarPre(req, ids, usuario, { embarque: e = null } = {}) {
  const { rows } = await consultaCliente(req, `SELECT ${CAMPOS_NOTA} FROM fretes f WHERE f.id = ANY($1) AND f.chave_cte IS NULL ORDER BY f.numero_nf`, [ids]);
  if (!rows.length) return [];
  const rateio = e && e.modalidade === 'lotacao' && e.frete_previsto ? ratear(Number(e.frete_previsto), rows) : null;
  const criados = [];
  for (const [i, n] of rows.entries()) {
    const valor = rateio ? rateio[i] : n.frete_previsto;
    await pool.query("UPDATE pre_conhecimentos SET status = 'cancelado' WHERE frete_id = $1 AND status <> 'cancelado'", [n.id]);
    const { rows: [p] } = await pool.query(`INSERT INTO pre_conhecimentos (frete_id, embarque_id, transportadora, valor_previsto, componentes, tabela, prazo_dias, origem, criado_por_nome)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [n.id, e?.id || null, e?.transportadora || n.transportadora, valor != null ? r2(valor) : null, rateio ? null : componentesDe(n.auditoria_calculo),
      rateio ? `Lotação (${VEICULOS[e.tipo_veiculo]?.nome || 'veículo'}) rateada entre as notas` : n.tabela_frete, rateio ? null : n.prazo, rateio ? 'lotacao' : 'tabela', usuario]);
    criados.push(p.id);
  }
  return criados;
}
function situacaoPre(p) {
  if (p.status === 'cancelado') return 'Cancelado';
  if (!p.chave_cte) return p.valor_previsto == null ? 'Sem frete calculado' : p.status === 'enviado' ? 'Enviado, aguardando CT-e' : 'Aguardando CT-e';
  const c = conferir(p.valor_previsto, p.valor_cte);
  return !c ? 'CT-e recebido' : c.confere ? 'CT-e confere' : 'CT-e divergente';
}
async function preConhecimentos(req, q = {}) {
  const p = []; const cond = [];
  if (String(q.transportadora || '').trim()) { p.push(`%${String(q.transportadora).trim()}%`); cond.push(`pc.transportadora ILIKE $${p.length}`); }
  if (/^\d+$/.test(String(q.embarque || ''))) { p.push(Number(q.embarque)); cond.push(`pc.embarque_id = $${p.length}`); }
  if (!q.todos) cond.push("(pc.status <> 'cancelado' AND pc.criado_em >= NOW() - INTERVAL '90 days')");
  const { rows } = await consultaCliente(req, `SELECT pc.*, LTRIM(f.numero_nf, '0') AS numero, f.cliente, f.cidade, f.uf, COALESCE(f.peso_bruto, f.peso_kg)::float AS peso, f.qtd_volumes AS volumes,
      f.valor_faturado::float AS valor_nf, f.chave_cte, f.numero_cte, f.valor_total_cte::float AS valor_cte, to_char(f.data_emissao_cte, 'YYYY-MM-DD') AS emissao_cte
    FROM pre_conhecimentos pc JOIN fretes f ON f.id = pc.frete_id ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY pc.id DESC LIMIT 2000`, p);
  const lista = rows.map((r) => {
    const x = { ...r, valor_previsto: r.valor_previsto != null ? Number(r.valor_previsto) : null };
    const c = conferir(x.valor_previsto, x.valor_cte);
    return { ...x, diferenca: c?.dif ?? null, situacao: situacaoPre(x) };
  });
  const SIT = ['Aguardando CT-e', 'Enviado, aguardando CT-e', 'Sem frete calculado', 'CT-e confere', 'CT-e divergente', 'CT-e recebido', 'Cancelado'];
  const contagem = Object.fromEntries(SIT.map((s) => [s, lista.filter((l) => l.situacao === s).length]));
  const filtro = String(q.situacao || '');
  return { situacoes: SIT, contagem, lista: filtro ? lista.filter((l) => l.situacao === filtro) : lista };
}
async function cancelarPre(id) { await pool.query("UPDATE pre_conhecimentos SET status = 'cancelado' WHERE id = $1", [id]); return { ok: true }; }

// Documento (impressão e anexo do e-mail) com os pré-conhecimentos escolhidos.
async function documentoPre(req, ids) {
  const { rows } = await consultaCliente(req, `SELECT pc.*, LTRIM(f.numero_nf, '0') AS numero, f.chave_nfe, f.cliente, f.cliente_documento, f.cidade, f.uf, COALESCE(f.peso_bruto, f.peso_kg)::float AS peso,
      f.qtd_volumes AS volumes, f.cubagem_m3::float AS m3, f.valor_faturado::float AS valor_nf, f.numero_pedido
    FROM pre_conhecimentos pc JOIN fretes f ON f.id = pc.frete_id WHERE pc.id = ANY($1) AND pc.status <> 'cancelado' ORDER BY pc.transportadora, pc.id`, [ids]);
  if (!rows.length) throw falha('Nenhum pré-conhecimento para imprimir.', 404);
  const { rows: [emp] } = await pool.query('SELECT razao_social, nome_fantasia, cnpj, endereco, numero, bairro, municipio, uf, cep, telefone, email FROM empresa WHERE id = 1').catch(() => ({ rows: [{}] }));
  const e = emp || {};
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, c = 2) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const NOMES = { frete_peso: 'Frete peso', ad_valorem: 'Ad valorem', gris: 'GRIS', pedagio: 'Pedágio', tde: 'TDE', tda: 'TDA', trt: 'TRT', despacho: 'Despacho', descarga: 'Descarga', icms: 'ICMS' };
  const origem = [[e.endereco, e.numero].filter(Boolean).join(', '), e.bairro, [e.municipio, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' - ');
  const blocos = rows.map((p) => `<section class="pc">
    <div class="cab"><div><b>PRÉ-CONHECIMENTO Nº ${p.id}</b>${p.embarque_id ? ` · embarque nº ${p.embarque_id}` : ''}</div><div>${esc(p.transportadora || '')}</div></div>
    <div class="grade"><div><b>NF-e</b>${esc(p.numero)}${p.numero_pedido ? ` · pedido ${esc(p.numero_pedido)}` : ''}</div><div><b>Chave da NF-e</b><span class="ch">${esc(p.chave_nfe || '')}</span></div>
      <div><b>Remetente</b>${esc(e.razao_social || '')} ${e.cnpj ? `(${esc(e.cnpj)})` : ''}<br><small>${esc(origem)}</small></div><div><b>Destinatário</b>${esc(p.cliente)}${p.cliente_documento ? ` (${esc(p.cliente_documento)})` : ''}<br><small>${esc([p.cidade, p.uf].filter(Boolean).join('/'))}</small></div>
      <div><b>Carga</b>${num(p.volumes, 0)} vol. · ${num(p.peso, 1)} kg${p.m3 ? ` · ${num(p.m3, 3)} m³` : ''}</div><div><b>Valor da mercadoria</b>R$ ${num(p.valor_nf)}</div></div>
    <table><thead><tr><th>Componente</th><th class="n">Valor (R$)</th></tr></thead><tbody>
      ${p.componentes && Object.keys(p.componentes).length ? Object.entries(p.componentes).map(([k, v]) => `<tr><td>${esc(NOMES[k] || k)}</td><td class="n">${num(v)}</td></tr>`).join('') : `<tr><td>${esc(p.tabela || 'Frete')}</td><td class="n">${num(p.valor_previsto)}</td></tr>`}
    </tbody><tfoot><tr><td>Total do frete a cobrar no CT-e</td><td class="n">${num(p.valor_previsto)}</td></tr></tfoot></table>
    <div class="rod">${esc(p.tabela ? `Tabela: ${p.tabela}` : '')}${p.prazo_dias ? ` · prazo ${p.prazo_dias} dia(s)` : ''} · emitido em ${new Date(p.criado_em).toLocaleDateString('pt-BR')}</div></section>`).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pré-conhecimentos (${rows.length})</title><style>
    @page { size: A4; margin: 12mm; } body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0; }
    @media screen { body { padding: 18px; max-width: 920px; margin: 0 auto; } } .acoes { margin-bottom: 10px; } @media print { .acoes { display: none; } }
    .pc { border: 1px solid #111; margin-bottom: 14px; page-break-inside: avoid; } .cab { display: flex; justify-content: space-between; background: #eee; padding: 6px 8px; border-bottom: 1px solid #111; font-size: 13px; }
    .grade { display: grid; grid-template-columns: 1fr 1fr; } .grade div { padding: 5px 8px; border-bottom: 1px solid #ccc; } .grade b { display: block; font-size: 10px; text-transform: uppercase; color: #444; }
    .ch { font-family: monospace; font-size: 11px; } table { width: 100%; border-collapse: collapse; } th, td { padding: 4px 8px; border-bottom: 1px solid #ddd; text-align: left; } .n { text-align: right; }
    tfoot td { font-weight: 700; border-top: 1px solid #111; } .rod { padding: 5px 8px; font-size: 11px; color: #444; }
  </style></head><body><div class="acoes"><button type="button" onclick="window.print()">Imprimir</button></div>
  <h2 style="margin:0 0 4px;">Pré-conhecimentos de frete</h2><p style="margin:0 0 12px;">${esc(e.razao_social || e.nome_fantasia || '')} · o CT-e deve sair com estes valores; diferença será conferida na auditoria.</p>${blocos}</body></html>`;
}
// Manda os pré-conhecimentos (de uma transportadora) por e-mail, com o documento anexo.
async function enviarPre(req, ids, para, usuario) {
  const email = String(para || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw falha('Informe o e-mail da transportadora.');
  const html = await documentoPre(req, ids);
  const { rows: [emp] } = await pool.query('SELECT razao_social, nome_fantasia FROM empresa WHERE id = 1').catch(() => ({ rows: [{}] }));
  const nome = emp?.nome_fantasia || emp?.razao_social || 'Expedição';
  try {
    await require('./email').enviarRelatorio({ para: email, assunto: `Pré-conhecimentos de frete — ${nome}`, html: `<p>Seguem os pré-conhecimentos (${ids.length}) com os valores de frete a cobrar no CT-e.</p>`,
      anexos: [{ filename: 'pre-conhecimentos.html', content: html, contentType: 'text/html; charset=utf-8' }] });
  } catch (e) { throw falha(`Não consegui mandar o e-mail: ${e.message}`, 502); }
  await pool.query("UPDATE pre_conhecimentos SET status = 'enviado', enviado_em = NOW(), enviado_para = $2 WHERE id = ANY($1) AND status <> 'cancelado'", [ids, email]);
  return { ok: true, enviados: ids.length };
}
// Notas esperando CT-e ainda sem pré-conhecimento (para gerar à mão).
async function semPre(req, q = {}) {
  const lista = await candidatas(req, q, { exceto: -1 });
  const { rows } = await pool.query("SELECT frete_id FROM pre_conhecimentos WHERE frete_id = ANY($1) AND status <> 'cancelado'", [lista.map((n) => n.id)]);
  const tem = new Set(rows.map((r) => r.frete_id));
  return lista.filter((n) => !tem.has(n.id));
}

// Espelho do embarque (impressão).
async function documentoEmbarque(req, id) {
  const e = await embarque(id); const notas = await notasPorIds(req, e.frete_ids);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, c = 0) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Embarque nº ${e.id}</title><style>
    @page { size: A4; margin: 12mm; } body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 0; } @media screen { body { padding: 18px; max-width: 920px; margin: 0 auto; } }
    .acoes { margin-bottom: 10px; } @media print { .acoes { display: none; } } table { width: 100%; border-collapse: collapse; margin-top: 10px; } th, td { border: 1px solid #111; padding: 4px 6px; text-align: left; } th { background: #eee; }
    .n { text-align: right; } .g { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 14px; margin-top: 8px; } .g b { display: block; font-size: 10px; text-transform: uppercase; color: #444; }
    .ass { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 44px; } .ass div { border-top: 1px solid #111; text-align: center; padding-top: 4px; }
  </style></head><body><div class="acoes"><button type="button" onclick="window.print()">Imprimir</button></div>
  <h2 style="margin:0;">ESPELHO DO EMBARQUE Nº ${e.id}</h2>
  <div class="g"><div><b>Transportadora</b>${esc(e.transportadora)}</div><div><b>Data</b>${e.data ? new Date(`${e.data}T12:00:00`).toLocaleDateString('pt-BR') : ''}</div><div><b>Modalidade</b>${e.modalidade === 'lotacao' ? 'Lotação' : 'Fracionada'}</div>
    <div><b>Veículo</b>${esc(VEICULOS[e.tipo_veiculo]?.nome || '')}${e.cap_kg ? ` · ${num(e.cap_kg)} kg` : ''}${e.cap_m3 ? ` · ${num(e.cap_m3)} m³` : ''}</div><div><b>Ocupação</b>${e.ocupacao != null ? `${Math.round(e.ocupacao * 100)}%` : '—'}</div><div><b>Frete previsto</b>R$ ${num(e.frete_previsto, 2)}</div></div>
  <table><thead><tr><th>NF-e</th><th>Cliente</th><th>Destino</th><th class="n">Volumes</th><th class="n">Peso (kg)</th><th class="n">m³</th><th class="n">Valor (R$)</th></tr></thead><tbody>
  ${notas.map((n) => `<tr><td>${esc(n.numero)}</td><td>${esc(n.cliente)}</td><td>${esc([n.cidade, n.uf].filter(Boolean).join('/'))}</td><td class="n">${num(n.volumes)}</td><td class="n">${num(n.peso, 1)}</td><td class="n">${num(n.m3, 3)}</td><td class="n">${num(n.valor, 2)}</td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="3"><b>${notas.length} nota(s)</b></td><td class="n"><b>${num(e.volumes)}</b></td><td class="n"><b>${num(e.peso_kg, 1)}</b></td><td class="n"><b>${num(e.cubagem_m3, 3)}</b></td><td class="n"><b>${num(e.valor, 2)}</b></td></tr></tfoot></table>
  ${e.observacao ? `<p><b>Observação:</b> ${esc(e.observacao)}</p>` : ''}
  <div class="ass"><div>Expedição</div><div>Motorista (nome, documento e placa)</div></div></body></html>`;
}

module.exports = {
  VEICULOS, ocupacao, conferir, ratear, opcoesLotacao, avisoCapacidade, situacaoEmbarque, situacaoPre,
  candidatas, lotacoes, salvarLotacao, excluirLotacao, fracionadas, capacidades, salvarCapacidade, excluirCapacidade, painelCapacidade,
  embarques, embarque, salvarEmbarque, fecharEmbarque, cancelarEmbarque, ordemDoEmbarque, documentoEmbarque,
  gerarPre, preConhecimentos, cancelarPre, documentoPre, enviarPre, semPre,
};
