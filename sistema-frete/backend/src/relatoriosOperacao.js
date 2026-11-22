// Relatórios de roteirização e operação (tela 328, transportadora): os números 71 a 80 da lista da empresa. Montado por
// src/relatoriosEntregas.js. Base: os romaneios (cada romaneio é uma viagem/rota) do período (data do romaneio), das
// unidades que o usuário enxerga, com os CT-e e as coletas de cada um.
//  - Rota planejada: as paradas e o traçado que o monitoramento guarda no romaneio (rota_planejada); sem traçado, a
//    distância é estimada pelas cidades das entregas na ordem do romaneio (linha reta × 1,3, como a roteirização).
//  - Rota realizada: as posições do GPS do app do motorista (veiculo_posicoes; guardadas pelo prazo do monitoramento).
//  - Capacidade: cap_kg / cap_m3 do cadastro do veículo (pela placa). Peso e m³: dos CT-e (infQ) e das coletas.
//  - Custo realizado: acerto do terceiro (frete + vale-pedágio), diárias dos ajudantes e combustível lançado para a placa
//    no dia; custo estimado: km × custo por km do veículo no painel da frota (90 dias) + diárias.
const pool = require('./db');
const { condicaoUnidades } = require('./permissoes');
const { municipio, distanciaKm } = require('./roteirizacao/municipios');

const r2 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(Number(v) * 100) / 100);
const r1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(Number(v) * 10) / 10);
const div = (a, b) => (b ? a / b : null);
const dia = (v) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);
const horas = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 3600000 : null);
const STATUS = { aberto: 'Montando', em_rota: 'Em rota', fechado: 'Fechado' };
const LIMITE = 3000;

// Comprimento (km) de uma linha [[lat, lon], ...] ou [{lat, lon}, ...].
function comprimento(linha) {
  let km = 0;
  for (let i = 1; i < (linha || []).length; i++) {
    const a = Array.isArray(linha[i - 1]) ? { lat: linha[i - 1][0], lon: linha[i - 1][1] } : linha[i - 1];
    const b = Array.isArray(linha[i]) ? { lat: linha[i][0], lon: linha[i][1] } : linha[i];
    if (a && b) km += distanciaKm(a, b);
  }
  return km;
}

module.exports = function criar() {
  // Romaneios do período, com veículo, itens (CT-e), coletas, GPS e custos.
  async function viagens(req, q, de, ate, { comPontos = false } = {}) {
    const params = [de, ate];
    const cond = [];
    if (String(q.placa || '').trim()) { params.push(`%${String(q.placa).replace(/[^A-Za-z0-9]/g, '')}%`); cond.push(`regexp_replace(COALESCE(r.placa, ''), '[^A-Za-z0-9]', '', 'g') ILIKE $${params.length}`); }
    if (String(q.motorista || '').trim()) { params.push(`%${String(q.motorista).trim()}%`); cond.push(`r.motorista_nome ILIKE $${params.length}`); }
    if (/^\d+$/.test(String(q.filial || ''))) { params.push(Number(q.filial)); cond.push(`r.unidade_id = $${params.length}`); }
    if (['aberto', 'em_rota', 'fechado'].includes(q.status)) { params.push(q.status); cond.push(`r.status = $${params.length}`); }
    if (String(q.transportadora || '').trim()) { params.push(`%${String(q.transportadora).trim()}%`); cond.push(`EXISTS (SELECT 1 FROM parceiros px WHERE px.id = r.parceiro_id AND px.nome ILIKE $${params.length})`); }
    const unid = condicaoUnidades(req, ['r.unidade_id'], params);
    const { rows: rs } = await pool.query(`SELECT r.id, to_char(r.data, 'YYYY-MM-DD') AS data, r.status, r.placa, r.veiculo, r.motorista_nome, r.saiu_em, r.fechado_em, r.parceiro_id,
        r.rota_planejada, r.ajudante_ids, u.sigla AS unidade, u.cidade AS unidade_cidade, u.uf AS unidade_uf, pa.nome AS parceiro,
        v.id AS veiculo_id, v.tipo AS veiculo_tipo, v.descricao AS veiculo_desc, v.cap_kg::float AS cap_kg, v.cap_m3::float AS cap_m3
      FROM romaneios r LEFT JOIN unidades u ON u.id = r.unidade_id LEFT JOIN parceiros pa ON pa.id = r.parceiro_id
      LEFT JOIN LATERAL (SELECT * FROM veiculos v WHERE regexp_replace(UPPER(v.placa), '[^A-Z0-9]', '', 'g') = regexp_replace(UPPER(COALESCE(r.placa, '')), '[^A-Z0-9]', '', 'g') LIMIT 1) v ON TRUE
      WHERE r.data BETWEEN $1::date AND $2::date AND ${unid}${cond.length ? ` AND ${cond.join(' AND ')}` : ''}
      ORDER BY r.data DESC, r.id DESC LIMIT ${LIMITE + 1}`, params);
    const lista = rs.slice(0, LIMITE);
    const ids = lista.map((r) => r.id);
    if (!ids.length) return { lista: [], mais: false };
    const { itemDoCte } = require('./routes/romaneios');
    const [{ rows: itens }, { rows: cols }, { rows: gps }, { rows: acertos }, { rows: ajud }, { rows: comb }] = await Promise.all([
      pool.query(`SELECT i.romaneio_id, c.id, c.serie, c.numero, c.chave, c.dados, c.valor_total, c.destinatario_nome, c.previsao_entrega, c.situacao_entrega, c.data_entrega, c.recebedor_nome, i.ordem, i.chegada_em,
          (SELECT json_build_object('descricao', o.descricao, 'data_hora', o.data_hora, 'tipo', o.tipo) FROM cte_ocorrencias o WHERE o.cte_id = c.id ORDER BY o.data_hora DESC, o.id DESC LIMIT 1) AS ultima
        FROM romaneio_itens i JOIN ctes_emitidos c ON c.id = i.cte_id WHERE i.romaneio_id = ANY($1::int[]) ORDER BY i.romaneio_id, i.ordem, c.numero`, [ids]),
      pool.query(`SELECT romaneio_id, COUNT(*)::int AS coletas, COUNT(*) FILTER (WHERE status = 'coletada' OR coletado_em IS NOT NULL)::int AS coletadas,
          COALESCE(SUM(COALESCE(peso_coletado, peso_kg)), 0)::float AS peso, COALESCE(SUM(COALESCE(volumes_coletados, volumes)), 0)::int AS volumes, COALESCE(SUM(cubagem_m3), 0)::float AS m3
        FROM coletas WHERE romaneio_id = ANY($1::int[]) GROUP BY 1`, [ids]),
      pool.query(`SELECT romaneio_id, COUNT(*)::int AS pontos, COALESCE(SUM(d), 0)::float AS km, MIN(registrado_em) AS primeiro, MAX(registrado_em) AS ultimo FROM (
          SELECT romaneio_id, registrado_em, CASE WHEN lag_lat IS NULL THEN 0 ELSE 2 * 6371 * asin(sqrt(power(sin(radians(lat - lag_lat) / 2), 2)
            + cos(radians(lag_lat)) * cos(radians(lat)) * power(sin(radians(lon - lag_lon) / 2), 2))) END AS d
          FROM (SELECT romaneio_id, registrado_em, lat::float AS lat, lon::float AS lon, LAG(lat::float) OVER w AS lag_lat, LAG(lon::float) OVER w AS lag_lon
                  FROM veiculo_posicoes WHERE romaneio_id = ANY($1::int[]) AND COALESCE(precisao::float, 0) <= 200 WINDOW w AS (PARTITION BY romaneio_id ORDER BY registrado_em)) x) y
        GROUP BY 1`, [ids]),
      pool.query(`SELECT romaneio_id, COALESCE(SUM(valor_frete), 0)::float AS frete, COALESCE(SUM(vale_pedagio_valor), 0)::float AS pedagio FROM acertos
        WHERE romaneio_id = ANY($1::int[]) AND COALESCE(status, '') <> 'cancelado' GROUP BY 1`, [ids]),
      pool.query('SELECT id, diaria::float AS diaria FROM ajudantes'),
      pool.query(`SELECT regexp_replace(UPPER(v.placa), '[^A-Z0-9]', '', 'g') AS placa, to_char(a.data, 'YYYY-MM-DD') AS data, SUM(a.valor_total)::float AS valor, SUM(a.litros)::float AS litros
        FROM abastecimentos a JOIN veiculos v ON v.id = a.veiculo_id WHERE a.data BETWEEN $1::date AND $2::date GROUP BY 1, 2`, [de, ate]),
    ]);
    // Custo por km de cada veículo (painel da frota, últimos 90 dias).
    let custoKm = new Map();
    try {
      const ini = new Date(Date.parse(`${ate}T12:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);
      const p = await require('./frota').painel({ de: ini, ate });
      custoKm = new Map(p.veiculos.filter((v) => v.custo_km).map((v) => [v.veiculo_id, v.custo_km]));
    } catch { /* sem frota */ }
    const diaria = new Map(ajud.map((a) => [a.id, a.diaria || 0]));
    const porRom = (rows) => { const m = new Map(); rows.forEach((x) => { if (!m.has(x.romaneio_id)) m.set(x.romaneio_id, []); m.get(x.romaneio_id).push(x); }); return m; };
    const itensPor = porRom(itens); const colPor = new Map(cols.map((c) => [c.romaneio_id, c])); const gpsPor = new Map(gps.map((g) => [g.romaneio_id, g]));
    const acPor = new Map(acertos.map((a) => [a.romaneio_id, a])); const combPor = new Map(comb.map((c) => [`${c.placa}|${c.data}`, c]));
    let pontos = new Map();
    if (comPontos) {
      const { rows: pts } = await pool.query(`SELECT romaneio_id, lat::float AS lat, lon::float AS lon FROM (
          SELECT p.*, ROW_NUMBER() OVER (PARTITION BY romaneio_id ORDER BY registrado_em) AS rn, COUNT(*) OVER (PARTITION BY romaneio_id) AS n
            FROM veiculo_posicoes p WHERE romaneio_id = ANY($1::int[]) AND COALESCE(precisao::float, 0) <= 200) x
        WHERE n <= 400 OR rn % CEIL(n / 400.0)::int = 0 ORDER BY romaneio_id, rn`, [ids]);
      pontos = porRom(pts);
    }
    const cidadeF = String(q.cidade || '').trim().toUpperCase(); const ufF = /^[A-Za-z]{2}$/.test(q.uf || '') ? q.uf.toUpperCase() : '';
    const numeros = (v) => String(v || '').split(/[\s,;]+/).map((x) => x.replace(/\D/g, '').replace(/^0+(?=\d)/, '')).filter(Boolean);
    const nfF = numeros(q.nf); const cteF = numeros(q.cte); const cliF = String(q.cliente || '').trim();
    const plano = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const out = [];
    for (const r of lista) {
      const its = (itensPor.get(r.id) || []).map((c) => {
        const it = itemDoCte(c);
        const m3 = (c.dados?.carga?.quantidades || []).filter((x) => String(x.cUnid) === '00').reduce((s, x) => s + (Number(x.qCarga) || 0), 0);
        return { ...it, m3, no_prazo: it.data_entrega && it.previsao ? dia(it.data_entrega) <= dia(it.previsao) : null, problema: it.ultima?.tipo === 'problema' };
      });
      if (cidadeF && !its.some((i) => plano(i.cidade).includes(plano(cidadeF)))) continue;
      if (ufF && !its.some((i) => String(i.uf).toUpperCase() === ufF)) continue;
      if (nfF.length && !its.some((i) => (i.nfs || []).some((n) => nfF.includes(String(n))))) continue;
      if (cteF.length && !its.some((i) => cteF.includes(String(i.numero).replace(/^0+(?=\d)/, '')))) continue;
      if (cliF && !its.some((i) => plano(i.destinatario).includes(plano(cliF)) || String(i.documento || '').startsWith(cliF.replace(/\D/g, '') || '-'))) continue;
      const col = colPor.get(r.id) || { coletas: 0, coletadas: 0, peso: 0, volumes: 0, m3: 0 };
      const g = gpsPor.get(r.id);
      const rp = r.rota_planejada || {};
      // Km planejado: o traçado guardado; sem ele, base → cidades das entregas na ordem (linha reta × 1,3).
      let kmPlan = null; let fontePlan = null;
      if (Array.isArray(rp.geometria) && rp.geometria.length > 1) { kmPlan = comprimento(rp.geometria); fontePlan = 'Traçado da rota'; }
      else {
        const pts = [];
        const base = r.unidade_cidade ? municipio({ cidade: r.unidade_cidade, uf: r.unidade_uf }) : null;
        if (base) pts.push(base);
        for (const i of its) { const pt = rp.paradas?.[i.cte_id] || municipio({ cidade: i.cidade, uf: i.uf }); if (pt && !(pts.length && pts[pts.length - 1].lat === pt.lat && pts[pts.length - 1].lon === pt.lon)) pts.push(pt); }
        if (pts.length > 1) { kmPlan = comprimento(pts) * 1.3; fontePlan = base ? 'Estimado (base e cidades)' : 'Estimado (cidades)'; }
      }
      const kmReal = g && g.pontos > 1 ? g.km : null;
      const peso = its.reduce((s, i) => s + (i.peso || 0), 0) + (col.peso || 0);
      const m3 = its.reduce((s, i) => s + (i.m3 || 0), 0) + (col.m3 || 0);
      const ac = acPor.get(r.id);
      const diarias = (r.ajudante_ids || []).reduce((s, id) => s + (diaria.get(id) || 0), 0);
      const placaN = String(r.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const combustivel = combPor.get(`${placaN}|${r.data}`)?.valor || 0;
      const ckm = r.veiculo_id ? custoKm.get(r.veiculo_id) : null;
      const km = kmReal ?? kmPlan;
      const terceiro = ac ? ac.frete + ac.pedagio : 0;
      const custoEstimado = r.parceiro_id || ac ? (terceiro || null) : ckm && kmPlan ? kmPlan * ckm + diarias : null;
      const custoReal = terceiro + diarias + combustivel || null;
      const entregues = its.filter((i) => i.situacao === 'entregue').length;
      out.push({
        ...r, id: r.id, status_txt: STATUS[r.status] || r.status, itens: its, entregas: its.length, entregues, devolvidas: its.filter((i) => i.situacao === 'devolvido').length,
        com_problema: its.filter((i) => i.problema && i.situacao !== 'entregue').length, pendentes: its.filter((i) => !['entregue', 'devolvido'].includes(i.situacao)).length,
        no_prazo: its.filter((i) => i.no_prazo === true).length, com_prazo: its.filter((i) => i.no_prazo != null).length,
        coletas: col.coletas, coletadas: col.coletadas, volumes: its.reduce((s, i) => s + (i.volumes || 0), 0) + (col.volumes || 0), peso: r1(peso), m3: r2(m3),
        frete: r2(its.reduce((s, i) => s + (i.valor_frete || 0), 0)), valor_carga: r2(its.reduce((s, i) => s + (i.valor_carga || 0), 0)),
        cidades: [...new Set(its.map((i) => [i.cidade, i.uf].filter(Boolean).join('/')).filter(Boolean))],
        km_plan: r1(kmPlan), fonte_plan: fontePlan, km_real: r1(kmReal), pontos_gps: g?.pontos || 0, duracao: r1(horas(r.saiu_em, r.fechado_em)),
        custo_estimado: r2(custoEstimado), terceiro: r2(terceiro), diarias: r2(diarias), combustivel: r2(combustivel), custo_real: r2(custoReal), custo_km_veic: ckm, km,
        geometria: rp.geometria, pontos: pontos.get(r.id) || [], veiculo_nome: [r.placa, r.veiculo_desc || r.veiculo || r.veiculo_tipo].filter(Boolean).join(' · '),
        motorista: r.motorista_nome || (r.parceiro ? `Parceiro: ${r.parceiro}` : ''),
      });
    }
    return { lista: out, mais: rs.length > LIMITE };
  }

  const soma = (ls, k) => ls.reduce((t, l) => t + (Number(l[k]) || 0), 0);
  const COL = [['data', 'Data', 'data'], ['romaneio', 'Romaneio'], ['placa', 'Veículo'], ['motorista', 'Motorista']];
  const base = (v) => ({ id: v.id, data: v.data, romaneio: String(v.id), placa: v.placa || '—', motorista: v.motorista, status: v.status_txt });
  // Detalhe dos agrupados: as viagens (romaneios) do grupo; dois cliques abrem o romaneio.
  const viagensDe = (filtro) => async (req, q, de, ate, valor) => {
    const { lista, mais } = await viagens(req, q, de, ate);
    const linhas = lista.filter((v) => filtro(v, valor)).map((v) => ({ ...base(v), entregas: v.entregas, entregues: v.entregues, devolvidas: v.devolvidas, pendentes: v.pendentes,
      coletas: v.coletas, peso: v.peso, km: v.km, frete: v.frete }));
    return {
      colunas: [...COL, ['status', 'Situação'], ['entregas', 'Entregas', 'num'], ['entregues', 'Entregues', 'num'], ['devolvidas', 'Devolvidas', 'num'], ['pendentes', 'Pendentes', 'num'],
        ['coletas', 'Coletas', 'num'], ['peso', 'Peso (kg)', 'dec'], ['km', 'Km', 'dec'], ['frete', 'Frete dos CT-e', 'moeda']],
      linhas, mais, abrir: 'romaneio',
      resumo: [['Viagens', linhas.length], ['Entregas', soma(linhas, 'entregas')], ['Entregues', soma(linhas, 'entregues')], ['Km', soma(linhas, 'km'), 'dec']],
    };
  };
  // Agrupa viagens (veículo, motorista, dia).
  function agrupar(lista, chave, rotulo) {
    const m = new Map();
    for (const v of lista) {
      const k = chave(v) || '(sem informação)';
      const g = m.get(k) || { grupo: k, viagens: 0, entregas: 0, entregues: 0, devolvidas: 0, com_problema: 0, no_prazo: 0, com_prazo: 0, coletas: 0, volumes: 0, peso: 0, km: 0, frete: 0, horas: 0, com_horas: 0, placas: new Set(), motoristas: new Set() };
      g.viagens += 1; ['entregas', 'entregues', 'devolvidas', 'com_problema', 'no_prazo', 'com_prazo', 'coletas', 'volumes', 'peso', 'frete'].forEach((x) => { g[x] += Number(v[x]) || 0; });
      g.km += Number(v.km_real ?? v.km_plan) || 0;
      if (v.duracao) { g.horas += v.duracao; g.com_horas += v.entregas; }
      if (v.placa) g.placas.add(v.placa); if (v.motorista) g.motoristas.add(v.motorista);
      m.set(k, g);
    }
    return [...m.values()].map((g) => ({ ...g, placas: g.placas.size, motoristas: g.motoristas.size, peso: r1(g.peso), km: r1(g.km), frete: r2(g.frete),
      pct_sucesso: div(g.entregues, g.entregas), pct_prazo: div(g.no_prazo, g.com_prazo), por_viagem: r1(div(g.entregas, g.viagens)), min_entrega: g.com_horas ? Math.round((g.horas * 60) / g.com_horas) : null }))
      .sort((a, b) => b.entregas - a.entregas);
  }
  const G = 'Rotas';

  return {
    71: { titulo: 'Rotas planejadas', grupo: G, tela: 'operacao', desc: 'Romaneios do período: veículo, motorista, entregas e coletas programadas, cidades na ordem, peso, volumes e a distância planejada (traçado da rota ou estimativa pelas cidades).',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await viagens(req, q, de, ate);
        const linhas = lista.map((v) => ({ ...base(v), entregas: v.entregas, coletas: v.coletas, paradas: v.entregas + v.coletas, cidades: v.cidades.join(' › '), peso: v.peso, volumes: v.volumes,
          km_plan: v.km_plan, fonte_plan: v.fonte_plan || (v.unidade ? 'Sem cidade para estimar' : 'Sem a unidade de saída'), valor_carga: v.valor_carga }));
        return {
          colunas: [...COL, ['status', 'Situação'], ['entregas', 'Entregas', 'num'], ['coletas', 'Coletas', 'num'], ['cidades', 'Cidades (na ordem)'], ['peso', 'Peso (kg)', 'dec'], ['volumes', 'Volumes', 'num'],
            ['km_plan', 'Km planejado', 'dec'], ['fonte_plan', 'Como foi medido'], ['valor_carga', 'Valor da carga', 'moeda']],
          linhas, mais, abrir: 'romaneio',
          resumo: [['Rotas', linhas.length], ['Entregas programadas', soma(linhas, 'entregas')], ['Coletas', soma(linhas, 'coletas')], ['Km planejado', soma(linhas, 'km_plan'), 'dec'], ['Peso (kg)', soma(linhas, 'peso'), 'dec']],
        };
      } },
    72: { titulo: 'Rotas realizadas', grupo: G, tela: 'operacao', desc: 'Romaneios que saíram no período: saída, fechamento, duração, entregues, devolvidas, com problema e pendentes, e os km rodados pelo GPS do app do motorista.',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await viagens(req, q, de, ate);
        const linhas = lista.filter((v) => v.saiu_em).map((v) => ({ ...base(v), saida: v.saiu_em, fechamento: v.fechado_em, duracao: v.duracao, entregas: v.entregas, entregues: v.entregues,
          devolvidas: v.devolvidas, com_problema: v.com_problema, pendentes: v.pendentes, pct_sucesso: div(v.entregues, v.entregas), km_real: v.km_real, pontos_gps: v.pontos_gps }));
        return {
          colunas: [...COL, ['status', 'Situação'], ['saida', 'Saída', 'datahora'], ['fechamento', 'Fechamento', 'datahora'], ['duracao', 'Duração (h)', 'dec'], ['entregas', 'Entregas', 'num'],
            ['entregues', 'Entregues', 'num'], ['devolvidas', 'Devolvidas', 'num'], ['com_problema', 'Com problema', 'num'], ['pendentes', 'Pendentes', 'num'], ['pct_sucesso', 'Entregue', 'sla'],
            ['km_real', 'Km (GPS)', 'dec'], ['pontos_gps', 'Posições GPS', 'num']],
          linhas, mais, abrir: 'romaneio',
          resumo: [['Rotas realizadas', linhas.length], ['Entregues', soma(linhas, 'entregues')], ['Devolvidas', soma(linhas, 'devolvidas')], ['Pendentes', soma(linhas, 'pendentes')],
            ['Entregue', div(soma(linhas, 'entregues'), soma(linhas, 'entregas')), 'pct'], ['Km pelo GPS', soma(linhas, 'km_real'), 'dec'], ['Sem GPS', linhas.filter((l) => !l.km_real).length]],
        };
      } },
    73: { detalhe: viagensDe((v, x) => (v.placa || '') === x), titulo: 'Entregas por veículo', grupo: 'Veículos e motoristas', tela: 'operacao', desc: 'Por veículo (placa): viagens, entregas, entregues, % de sucesso, peso, volumes, km e frete dos CT-e no período.',
      rodar: async (req, q, de, ate) => {
        const { lista } = await viagens(req, q, de, ate);
        const tipo = new Map(lista.map((v) => [v.placa || '(sem placa)', v.veiculo_desc || v.veiculo || v.veiculo_tipo || '']));
        const linhas = agrupar(lista, (v) => v.placa || '(sem placa)').map((g) => ({ ...g, tipo: tipo.get(g.grupo) || '' }));
        return {
          colunas: [['grupo', 'Veículo'], ['tipo', 'Descrição'], ['viagens', 'Viagens', 'num'], ['entregas', 'Entregas', 'num'], ['entregues', 'Entregues', 'num'], ['pct_sucesso', 'Sucesso', 'sla'],
            ['por_viagem', 'Entregas por viagem', 'dec'], ['peso', 'Peso (kg)', 'dec'], ['volumes', 'Volumes', 'num'], ['km', 'Km', 'dec'], ['frete', 'Frete dos CT-e', 'moeda']],
          linhas, agrupado: true,
          resumo: [['Veículos', linhas.length], ['Viagens', soma(linhas, 'viagens')], ['Entregas', soma(linhas, 'entregas')], ['Entregue', div(soma(linhas, 'entregues'), soma(linhas, 'entregas')), 'pct']],
        };
      } },
    74: { titulo: 'Ocupação de veículos', grupo: 'Veículos e motoristas', tela: 'operacao', desc: 'Em cada viagem: peso e m³ carregados (CT-e e coletas) × a capacidade do veículo no cadastro (cap. kg e m³). Acima de 100% é sobrecarga; abaixo de 50%, veículo ocioso.',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await viagens(req, q, de, ate);
        const linhas = lista.map((v) => {
          const pk = div(v.peso, v.cap_kg); const pm = div(v.m3, v.cap_m3);
          const ocup = Math.max(pk ?? 0, pm ?? 0) || null;
          return { ...base(v), veiculo: v.veiculo_desc || v.veiculo || v.veiculo_tipo || '', peso: v.peso, cap_kg: v.cap_kg, pct_kg: pk, m3: v.m3 || null, cap_m3: v.cap_m3, pct_m3: pm, ocupacao: ocup,
            situacao: !v.cap_kg && !v.cap_m3 ? 'Sem capacidade no cadastro' : ocup > 1 ? 'Sobrecarga' : ocup < 0.5 ? 'Ociosa' : 'Boa ocupação' };
        });
        const com = linhas.filter((l) => l.ocupacao != null);
        return {
          colunas: [...COL, ['veiculo', 'Tipo'], ['peso', 'Peso (kg)', 'dec'], ['cap_kg', 'Capacidade (kg)', 'dec'], ['pct_kg', 'Ocupação peso', 'ocupacao'], ['m3', 'm³', 'dec'], ['cap_m3', 'Capacidade (m³)', 'dec'],
            ['pct_m3', 'Ocupação m³', 'ocupacao'], ['situacao', 'Situação', 'confere']],
          linhas, mais, abrir: 'romaneio',
          resumo: [['Viagens', linhas.length], ['Ocupação média', com.length ? com.reduce((t, l) => t + Math.min(l.ocupacao, 2), 0) / com.length : null, 'pct'], ['Sobrecarga', linhas.filter((l) => l.situacao === 'Sobrecarga').length],
            ['Ociosas (abaixo de 50%)', linhas.filter((l) => l.situacao === 'Ociosa').length], ['Sem capacidade no cadastro', linhas.filter((l) => l.situacao.startsWith('Sem')).length]],
        };
      } },
    75: { titulo: 'Quilometragem por rota', grupo: G, tela: 'operacao', desc: 'Distância planejada (traçado da rota ou estimativa pelas cidades) × realizada (GPS do app do motorista) em cada romaneio, e os km por entrega.',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await viagens(req, q, de, ate);
        const linhas = lista.map((v) => ({ ...base(v), entregas: v.entregas, km_plan: v.km_plan, fonte_plan: v.fonte_plan || (v.unidade ? 'Sem cidade para estimar' : 'Sem a unidade de saída'), km_real: v.km_real,
          dif: v.km_plan != null && v.km_real != null ? r1(v.km_real - v.km_plan) : null, pct: v.km_plan && v.km_real != null ? v.km_real / v.km_plan - 1 : null, km_entrega: r1(div(v.km, v.entregas)) }));
        return {
          colunas: [...COL, ['entregas', 'Entregas', 'num'], ['km_plan', 'Km planejado', 'dec'], ['fonte_plan', 'Planejado por'], ['km_real', 'Km realizado (GPS)', 'dec'], ['dif', 'Diferença (km)', 'dec'],
            ['pct', '%', 'varcusto'], ['km_entrega', 'Km por entrega', 'dec']],
          linhas, mais, abrir: 'romaneio',
          resumo: [['Rotas', linhas.length], ['Km planejado', soma(linhas, 'km_plan'), 'dec'], ['Km realizado', soma(linhas, 'km_real'), 'dec'],
            ['Diferença (com os dois)', soma(linhas, 'dif'), 'dec'], ['Sem GPS', linhas.filter((l) => l.km_real == null).length]],
        };
      } },
    76: { titulo: 'Custo por rota', grupo: G, tela: 'operacao', desc: 'Custo estimado (km planejado × custo por km do veículo na frota + diárias; com terceiro, o acerto) e realizado (acerto do terceiro e vale-pedágio, diárias dos ajudantes e combustível lançado para a placa no dia), com o frete dos CT-e da rota.',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await viagens(req, q, de, ate);
        const linhas = lista.map((v) => ({ ...base(v), entregas: v.entregas, km: v.km, custo_km_veic: v.custo_km_veic, custo_estimado: v.custo_estimado, terceiro: v.terceiro || null, diarias: v.diarias || null,
          combustivel: v.combustivel || null, custo_real: v.custo_real, frete: v.frete, resultado: v.frete != null && (v.custo_real ?? v.custo_estimado) != null ? r2(v.frete - (v.custo_real ?? v.custo_estimado)) : null,
          por_entrega: r2(div(v.custo_real ?? v.custo_estimado, v.entregas)), pct: div(v.custo_real ?? v.custo_estimado, v.frete) }));
        return {
          colunas: [...COL, ['entregas', 'Entregas', 'num'], ['km', 'Km', 'dec'], ['custo_km_veic', 'Custo/km do veículo', 'moeda4'], ['custo_estimado', 'Custo estimado', 'moeda'], ['terceiro', 'Terceiro + pedágio', 'moeda'],
            ['diarias', 'Diárias', 'moeda'], ['combustivel', 'Combustível do dia', 'moeda'], ['custo_real', 'Custo realizado', 'moeda'], ['frete', 'Frete dos CT-e', 'moeda'], ['resultado', 'Frete − custo', 'difcusto'],
            ['por_entrega', 'Custo por entrega', 'moeda'], ['pct', 'Custo / frete', 'pct']],
          linhas, mais, abrir: 'romaneio',
          resumo: [['Custo estimado', soma(linhas, 'custo_estimado'), 'moeda'], ['Custo realizado', soma(linhas, 'custo_real'), 'moeda'], ['Frete dos CT-e', soma(linhas, 'frete'), 'moeda'],
            ['Custo por entrega', div(linhas.reduce((t, l) => t + (Number(l.custo_real ?? l.custo_estimado) || 0), 0), soma(linhas, 'entregas')), 'moeda'], ['Sem custo', linhas.filter((l) => l.custo_real == null && l.custo_estimado == null).length]],
        };
      } },
    77: { detalhe: viagensDe((v, x) => (v.motorista || '') === x), titulo: 'Entregas por motorista', grupo: 'Veículos e motoristas', tela: 'operacao', desc: 'Por motorista: viagens, entregas, entregues, devolvidas, com problema, % de sucesso, % no prazo, minutos por entrega (duração da viagem ÷ entregas) e km.',
      rodar: async (req, q, de, ate) => {
        const { lista } = await viagens(req, q, de, ate);
        const linhas = agrupar(lista, (v) => v.motorista);
        return {
          colunas: [['grupo', 'Motorista'], ['viagens', 'Viagens', 'num'], ['placas', 'Veículos', 'num'], ['entregas', 'Entregas', 'num'], ['entregues', 'Entregues', 'num'], ['devolvidas', 'Devolvidas', 'num'],
            ['com_problema', 'Com problema', 'num'], ['pct_sucesso', 'Sucesso', 'sla'], ['pct_prazo', 'No prazo', 'sla'], ['min_entrega', 'Min. por entrega', 'num'], ['km', 'Km', 'dec'], ['volumes', 'Volumes', 'num']],
          linhas, agrupado: true,
          resumo: [['Motoristas', linhas.length], ['Entregas', soma(linhas, 'entregas')], ['Entregue', div(soma(linhas, 'entregues'), soma(linhas, 'entregas')), 'pct'],
            ['No prazo', div(soma(linhas, 'no_prazo'), soma(linhas, 'com_prazo')), 'pct']],
        };
      } },
    78: { titulo: 'Desvio de rota', grupo: G, tela: 'operacao', desc: 'Rota planejada × realizada: km a mais, quanto do trajeto (GPS) passou longe do traçado (mais que o desvio configurado no monitoramento), o maior afastamento e as entregas feitas fora da ordem do romaneio.',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await viagens(req, q, de, ate, { comPontos: true });
        const mon = require('./monitoramento');
        let limite = 3; try { limite = (await mon.config()).desvio_km || 3; } catch { /* padrão */ }
        const linhas = lista.filter((v) => v.saiu_em).map((v) => {
          const geo = Array.isArray(v.geometria) && v.geometria.length > 1 ? v.geometria : null;
          let fora = null; let maior = null;
          if (geo && v.pontos.length) {
            const d = v.pontos.map((p) => mon.distanciaAteLinha(p, geo)).filter((x) => x != null);
            fora = d.length ? d.filter((x) => x > limite).length / d.length : null; maior = d.length ? r1(Math.max(...d)) : null;
          }
          // Entregas fora da ordem: a ordem em que foram entregues × a ordem do romaneio.
          const feitas = v.itens.filter((i) => i.situacao === 'entregue' && (i.chegada_em || i.data_entrega))
            .map((i) => ({ ordem: i.ordem ?? 0, quando: new Date(i.chegada_em || i.data_entrega).getTime() })).sort((a, b) => a.quando - b.quando);
          let foraOrdem = 0; let maxOrdem = -Infinity;
          feitas.forEach((f) => { if (f.ordem < maxOrdem) foraOrdem += 1; maxOrdem = Math.max(maxOrdem, f.ordem); });
          const kmMais = v.km_plan != null && v.km_real != null ? r1(v.km_real - v.km_plan) : null;
          const sit = !v.pontos_gps ? 'Sem GPS' : !geo && v.km_plan == null ? 'Sem rota planejada'
            : (fora != null && fora > 0.2) || (kmMais != null && v.km_plan && kmMais / v.km_plan > 0.25) ? 'Desvio' : foraOrdem ? 'Fora da ordem' : 'Confere';
          return { ...base(v), km_plan: v.km_plan, km_real: v.km_real, km_mais: kmMais, pct_fora: fora, maior_km: maior, fora_ordem: foraOrdem, entregues: v.entregues, situacao: sit };
        });
        const conta = (s) => linhas.filter((l) => l.situacao === s).length;
        return {
          colunas: [...COL, ['km_plan', 'Km planejado', 'dec'], ['km_real', 'Km realizado', 'dec'], ['km_mais', 'Km a mais', 'dec'], ['pct_fora', `Trajeto a mais de ${limite} km da rota`, 'atraso'],
            ['maior_km', 'Maior afastamento (km)', 'dec'], ['entregues', 'Entregues', 'num'], ['fora_ordem', 'Entregas fora da ordem', 'num'], ['situacao', 'Situação', 'confere']],
          linhas, mais, abrir: 'romaneio',
          resumo: [['Rotas', linhas.length], ['Conferem', conta('Confere')], ['Com desvio', conta('Desvio')], ['Fora da ordem', conta('Fora da ordem')], ['Km a mais', soma(linhas.filter((l) => l.km_mais > 0), 'km_mais'), 'dec'],
            ['Sem GPS ou sem rota', conta('Sem GPS') + conta('Sem rota planejada')]],
        };
      } },
    79: { titulo: 'Entregas por viagem', grupo: 'Produtividade', tela: 'operacao', desc: 'Quantidade de entregas e coletas em cada viagem, quantas cidades, quantas deram certo e o ritmo (entregas por hora de viagem).',
      rodar: async (req, q, de, ate) => {
        const { lista, mais } = await viagens(req, q, de, ate);
        const linhas = lista.map((v) => ({ ...base(v), entregas: v.entregas, entregues: v.entregues, devolvidas: v.devolvidas, pendentes: v.pendentes, coletas: v.coletas, coletadas: v.coletadas,
          paradas: v.entregas + v.coletas, cidades: v.cidades.length, pct_sucesso: div(v.entregues, v.entregas), por_hora: r1(div(v.entregues + v.coletadas, v.duracao)), duracao: v.duracao }));
        const ent = linhas.map((l) => l.entregas);
        return {
          colunas: [...COL, ['status', 'Situação'], ['entregas', 'Entregas', 'num'], ['entregues', 'Entregues', 'num'], ['devolvidas', 'Devolvidas', 'num'], ['pendentes', 'Pendentes', 'num'], ['coletas', 'Coletas', 'num'],
            ['paradas', 'Paradas', 'num'], ['cidades', 'Cidades', 'num'], ['pct_sucesso', 'Sucesso', 'sla'], ['duracao', 'Duração (h)', 'dec'], ['por_hora', 'Paradas feitas por hora', 'dec']],
          linhas, mais, abrir: 'romaneio',
          resumo: [['Viagens', linhas.length], ['Entregas por viagem (média)', div(soma(linhas, 'entregas'), linhas.length), 'dec'], ['Maior', ent.length ? Math.max(...ent) : null], ['Menor', ent.length ? Math.min(...ent) : null],
            ['Coletas', soma(linhas, 'coletas')]],
        };
      } },
    80: { detalhe: viagensDe((v, x) => String(v.data || '').startsWith(x)), drill: 'periodo', titulo: 'Produtividade operacional', grupo: 'Produtividade', tela: 'operacao', desc: 'Dia a dia (mês a mês em períodos de mais de 62 dias): viagens, veículos e motoristas usados, entregas, coletas, volumes, peso, km e as médias por viagem e por veículo.',
      rodar: async (req, q, de, ate) => {
        const { lista } = await viagens(req, q, de, ate);
        const mes = (Date.parse(ate) - Date.parse(de)) / 86400000 > 62;
        const linhas = agrupar(lista, (v) => (mes ? v.data.slice(0, 7) : v.data)).map((g) => ({ periodo: g.grupo, ...g, por_veiculo: r1(div(g.entregas, g.placas)) }))
          .sort((a, b) => b.periodo.localeCompare(a.periodo));
        return {
          colunas: [['periodo', mes ? 'Mês' : 'Dia', mes ? 'mes' : 'data'], ['viagens', 'Viagens', 'num'], ['placas', 'Veículos', 'num'], ['motoristas', 'Motoristas', 'num'], ['entregas', 'Entregas', 'num'],
            ['entregues', 'Entregues', 'num'], ['coletas', 'Coletas', 'num'], ['volumes', 'Volumes', 'num'], ['peso', 'Peso (kg)', 'dec'], ['km', 'Km', 'dec'], ['por_viagem', 'Entregas por viagem', 'dec'],
            ['por_veiculo', 'Entregas por veículo', 'dec'], ['pct_sucesso', 'Sucesso', 'sla']],
          linhas, agrupado: true,
          resumo: [['Viagens', soma(linhas, 'viagens')], ['Entregas', soma(linhas, 'entregas')], ['Coletas', soma(linhas, 'coletas')], ['Volumes', soma(linhas, 'volumes')], ['Peso (kg)', soma(linhas, 'peso'), 'dec'],
            ['Km', soma(linhas, 'km'), 'dec']],
        };
      } },
  };
};
