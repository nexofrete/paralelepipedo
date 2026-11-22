// Relatórios de desempenho das transportadoras (tela 325, Gestão e relatórios): os números 61 a 70 da lista da
// empresa. Usa as mesmas bases dos relatórios de entregas (src/relatoriosEntregas.js, que monta este módulo).
//  - Custo: os CT-e do período (data do CT-e; sem cancelados, "não levou" e rejeitados), cada CT-e uma vez
//    (as notas cobertas por um CT-e de várias notas apontam para ele em cte_coberto_por). Entregas = CT-e
//    principais; o frete inclui os CT-e filhos (reentrega, complementar...). Peso: o do CT-e, como nos Indicadores.
//  - Prazo: notas entregues no período (no prazo = entregue até a previsão).
//  - Ocorrências, rastreamento e atrasos em aberto: notas emitidas no período.
//  - Nota geral (0 a 10): prazo 35%, custo 30% (frete sobre o valor das notas, comparado entre as transportadoras),
//    ocorrências 15%, comprovante de entrega 10% e rastreamento 10%; critério sem dado sai da conta.
module.exports = function criar(h) {
  const { consulta, filtros, TRANSP, BASE, ABERTA, CAT_OCORRENCIA, hojeSP } = h;
  const VALOR = 'COALESCE(f.valor_total_cte, f.valor_frete_negociado, 0)';
  const DATA = 'COALESCE(f.data_emissao_cte, f.data_emissao_nf)';
  const CONTA = `f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE AND f.cte_nao_levou IS NOT TRUE AND COALESCE(f.status_aprovacao, '') <> 'Rejeitado'
    AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')`;
  const COMPROVANTE = `(f.canhoto_foto_arquivo IS NOT NULL OR f.canhoto_assinatura IS NOT NULL OR COALESCE(f.canhoto_recebido_por, '') <> ''
    OR f.data_entrega_origem IN ('ssw', 'sefaz', 'portal', 'edi', 'comprovante', 'motorista'))`;
  const PROBLEMA = `${CAT_OCORRENCIA} NOT IN ('Entrega', 'Informativo')`;
  const div = (a, b) => (b ? a / b : null);
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  const r4 = (v) => (v == null ? null : Math.round(v * 10000) / 10000);

  // Todos os números por transportadora no período.
  async function porTransportadora(req, q, de, ate) {
    const hoje = hojeSP();
    const rodarSql = async (sql) => { const params = [de, ate]; const extra = filtros(q, params); return (await consulta(req, sql.replace('{F}', extra), params)).rows; };
    const [custos, notas, entregas, emitidas] = await Promise.all([
      rodarSql(`SELECT ${TRANSP} AS t, COUNT(*)::int AS ctes, COALESCE(SUM(${VALOR}), 0)::float AS frete,
          COUNT(*) FILTER (WHERE f.frete_principal_id IS NULL)::int AS entregas_cte,
          COALESCE(SUM(${VALOR}) FILTER (WHERE f.frete_principal_id IS NOT NULL), 0)::float AS frete_extra,
          COUNT(*) FILTER (WHERE f.vinculo_cte = 'reentrega')::int AS reentregas,
          COALESCE(SUM(COALESCE(f.peso_kg, 0)) FILTER (WHERE f.frete_principal_id IS NULL), 0)::float AS peso
        FROM fretes f WHERE ${CONTA} AND ${DATA} BETWEEN $1::date AND $2::date{F} GROUP BY 1`),
      rodarSql(`WITH c AS (SELECT f.id, ${TRANSP} AS t FROM fretes f WHERE ${CONTA} AND f.frete_principal_id IS NULL AND ${DATA} BETWEEN $1::date AND $2::date{F})
        SELECT c.t, COUNT(n.id)::int AS notas, COALESCE(SUM(n.valor_faturado), 0)::float AS valor_nf
          FROM c JOIN fretes n ON (n.id = c.id OR n.cte_coberto_por = c.id) AND n.frete_principal_id IS NULL AND COALESCE(n.numero_nf, '') <> '' GROUP BY 1`),
      rodarSql(`SELECT ${TRANSP} AS t, COUNT(*)::int AS entregues,
          COUNT(*) FILTER (WHERE f.data_entrega_prevista IS NOT NULL)::int AS com_previsao,
          COUNT(*) FILTER (WHERE f.data_entrega <= f.data_entrega_prevista)::int AS no_prazo,
          COUNT(*) FILTER (WHERE f.data_entrega > f.data_entrega_prevista)::int AS fora_prazo,
          ROUND(AVG(f.data_entrega - f.data_entrega_prevista) FILTER (WHERE f.data_entrega > f.data_entrega_prevista), 1)::float AS atraso_medio,
          MAX(f.data_entrega - f.data_entrega_prevista) FILTER (WHERE f.data_entrega > f.data_entrega_prevista)::int AS maior_atraso,
          ROUND(AVG(f.data_entrega - f.data_emissao_nf) FILTER (WHERE f.data_emissao_nf IS NOT NULL AND f.data_entrega >= f.data_emissao_nf), 1)::float AS prazo_medio,
          COUNT(*) FILTER (WHERE ${COMPROVANTE})::int AS com_comprovante
        FROM fretes f WHERE ${BASE} AND f.data_entrega BETWEEN $1::date AND $2::date{F} GROUP BY 1`),
      rodarSql(`SELECT ${TRANSP} AS t, COUNT(*)::int AS emitidas,
          COUNT(*) FILTER (WHERE f.numero_cte IS NOT NULL OR f.chave_cte IS NOT NULL)::int AS com_cte,
          COUNT(*) FILTER (WHERE (f.numero_cte IS NOT NULL OR f.chave_cte IS NOT NULL) AND f.rastreio_ultima_em IS NOT NULL)::int AS com_rastreio,
          COUNT(*) FILTER (WHERE ${ABERTA} AND f.data_entrega_prevista < '${hoje}'::date)::int AS atrasadas_abertas,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM ocorrencias_rastreio o WHERE o.frete_id = f.id AND ${PROBLEMA}))::int AS com_problema,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM ocorrencias_rastreio o WHERE o.frete_id = f.id AND ${CAT_OCORRENCIA} = 'Avaria'))::int AS avarias,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM ocorrencias_rastreio o WHERE o.frete_id = f.id AND ${CAT_OCORRENCIA} = 'Recusa'))::int AS recusas,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM ocorrencias_rastreio o WHERE o.frete_id = f.id AND ${CAT_OCORRENCIA} = 'Extravio / sinistro'))::int AS extravios,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM ocorrencias_rastreio o WHERE o.frete_id = f.id AND ${CAT_OCORRENCIA} = 'Devolução'))::int AS devolucoes,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM ocorrencias_rastreio o WHERE o.frete_id = f.id AND ${CAT_OCORRENCIA} IN ('Destinatário ausente / fechado', 'Endereço', 'Reentrega / reagendamento')))::int AS tentativas,
          COALESCE(SUM((SELECT COUNT(*) FROM ocorrencias_rastreio o WHERE o.frete_id = f.id AND ${PROBLEMA})), 0)::int AS ocorrencias
        FROM fretes f WHERE ${BASE} AND f.data_emissao_nf BETWEEN $1::date AND $2::date{F} GROUP BY 1`),
    ]);
    const mapa = new Map();
    const pega = (t) => { if (!mapa.has(t)) mapa.set(t, { transportadora: t }); return mapa.get(t); };
    [custos, notas, entregas, emitidas].forEach((lista) => lista.forEach((r) => { if (!r.t) return; Object.assign(pega(r.t), r); }));
    const linhas = [...mapa.values()].map((l) => {
      const n = (k) => l[k] || 0;
      return {
        ...l, ctes: n('ctes'), frete: r2(n('frete')), notas: n('notas'), entregues: n('entregues'), emitidas: n('emitidas'),
        custo_entrega: r2(div(n('frete'), n('entregas_cte'))), custo_kg: r4(div(n('frete'), n('peso'))), custo_nf: r2(div(n('frete'), n('notas'))),
        pct_frete: div(n('frete'), n('valor_nf')), pct_prazo: div(n('no_prazo'), n('com_previsao')), pct_atraso: div(n('fora_prazo'), n('com_previsao')),
        pct_ocorrencia: div(n('com_problema'), n('emitidas')), pct_comprovante: div(n('com_comprovante'), n('entregues')), pct_rastreio: div(n('com_rastreio'), n('com_cte')),
        pct_reentrega: div(n('reentregas'), n('entregas_cte')),
      };
    }).filter((l) => l.ctes || l.entregues || l.emitidas);
    // Notas (0 a 10) e nota geral.
    const pcts = linhas.map((l) => l.pct_frete).filter((v) => v != null);
    const min = Math.min(...pcts); const max = Math.max(...pcts);
    for (const l of linhas) {
      l.n_prazo = l.pct_prazo == null ? null : r2(l.pct_prazo * 10);
      l.n_custo = l.pct_frete == null ? null : r2(max > min ? 10 * (max - l.pct_frete) / (max - min) : 10);
      l.n_ocorrencia = l.pct_ocorrencia == null ? null : r2(10 * Math.max(0, 1 - l.pct_ocorrencia * 5));
      l.n_comprovante = l.pct_comprovante == null ? null : r2(l.pct_comprovante * 10);
      l.n_rastreio = l.pct_rastreio == null ? null : r2(l.pct_rastreio * 10);
      const pesos = [[l.n_prazo, 35], [l.n_custo, 30], [l.n_ocorrencia, 15], [l.n_comprovante, 10], [l.n_rastreio, 10]].filter(([v]) => v != null);
      const soma = pesos.reduce((t, [, p]) => t + p, 0);
      l.nota = soma ? r2(pesos.reduce((t, [v, p]) => t + v * p, 0) / soma) : null;
      l.conceito = l.nota == null ? '' : l.nota >= 8.5 ? 'A · Excelente' : l.nota >= 7 ? 'B · Bom' : l.nota >= 5 ? 'C · Regular' : 'D · Ruim';
    }
    linhas.sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || b.frete - a.frete);
    linhas.forEach((l, i) => { l.posicao = l.nota == null ? null : i + 1; });
    const tot = (k) => linhas.reduce((t, l) => t + (l[k] || 0), 0);
    const geral = {
      frete: tot('frete'), notas: tot('notas'), entregas_cte: tot('entregas_cte'), peso: tot('peso'), valor_nf: tot('valor_nf'), entregues: tot('entregues'),
      com_previsao: tot('com_previsao'), no_prazo: tot('no_prazo'), fora_prazo: tot('fora_prazo'), emitidas: tot('emitidas'), com_problema: tot('com_problema'),
      ocorrencias: tot('ocorrencias'), atrasadas_abertas: tot('atrasadas_abertas'), reentregas: tot('reentregas'),
    };
    geral.custo_entrega = div(geral.frete, geral.entregas_cte); geral.custo_kg = div(geral.frete, geral.peso); geral.custo_nf = div(geral.frete, geral.notas);
    geral.pct_prazo = div(geral.no_prazo, geral.com_previsao); geral.pct_atraso = div(geral.fora_prazo, geral.com_previsao);
    geral.pct_ocorrencia = div(geral.com_problema, geral.emitidas); geral.pct_frete = div(geral.frete, geral.valor_nf);
    return { linhas, geral };
  }

  const T = ['transportadora', 'Transportadora'];
  const grupo = (linhas) => ({ linhas, agrupado: true, grupoChave: 'transportadora' });
  const ordenar = (linhas, k, asc = false) => [...linhas].sort((a, b) => { const x = a[k]; const y = b[k]; if (x == null) return 1; if (y == null) return -1; return asc ? x - y : y - x; });

  // 70: evolução mês a mês (12 meses até a data final).
  async function historico(req, q, ate) {
    const de = `${String(Number(ate.slice(0, 4)) - (Number(ate.slice(5, 7)) === 12 ? 0 : 1))}-${String((Number(ate.slice(5, 7)) % 12) + 1).padStart(2, '0')}-01`;
    const rodarSql = async (sql) => { const params = [de, ate]; const extra = filtros(q, params); return (await consulta(req, sql.replace('{F}', extra), params)).rows; };
    const [custos, entregas, emitidas] = await Promise.all([
      rodarSql(`SELECT to_char(${DATA}, 'YYYY-MM') AS mes, COALESCE(SUM(${VALOR}), 0)::float AS frete, COUNT(*) FILTER (WHERE f.frete_principal_id IS NULL)::int AS entregas_cte,
          COALESCE(SUM(COALESCE(f.peso_kg, 0)) FILTER (WHERE f.frete_principal_id IS NULL), 0)::float AS peso, COUNT(*) FILTER (WHERE f.vinculo_cte = 'reentrega')::int AS reentregas
        FROM fretes f WHERE ${CONTA} AND ${DATA} BETWEEN $1::date AND $2::date{F} GROUP BY 1`),
      rodarSql(`SELECT to_char(f.data_entrega, 'YYYY-MM') AS mes, COUNT(*)::int AS entregues, COUNT(*) FILTER (WHERE f.data_entrega_prevista IS NOT NULL)::int AS com_previsao,
          COUNT(*) FILTER (WHERE f.data_entrega <= f.data_entrega_prevista)::int AS no_prazo,
          ROUND(AVG(f.data_entrega - f.data_entrega_prevista) FILTER (WHERE f.data_entrega > f.data_entrega_prevista), 1)::float AS atraso_medio,
          ROUND(AVG(f.data_entrega - f.data_emissao_nf) FILTER (WHERE f.data_emissao_nf IS NOT NULL AND f.data_entrega >= f.data_emissao_nf), 1)::float AS prazo_medio
        FROM fretes f WHERE ${BASE} AND f.data_entrega BETWEEN $1::date AND $2::date{F} GROUP BY 1`),
      rodarSql(`SELECT to_char(f.data_emissao_nf, 'YYYY-MM') AS mes, COUNT(*)::int AS emitidas, COALESCE(SUM(f.valor_faturado), 0)::float AS valor_nf,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM ocorrencias_rastreio o WHERE o.frete_id = f.id AND ${PROBLEMA}))::int AS com_problema
        FROM fretes f WHERE ${BASE} AND f.data_emissao_nf BETWEEN $1::date AND $2::date{F} GROUP BY 1`),
    ]);
    const meses = []; for (let d = new Date(`${de}T12:00:00Z`); d.toISOString().slice(0, 7) <= ate.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) meses.push(d.toISOString().slice(0, 7));
    const ach = (lista, m) => lista.find((r) => r.mes === m) || {};
    const linhas = meses.map((m) => {
      const l = { mes: m, ...ach(custos, m), ...ach(entregas, m), ...ach(emitidas, m) };
      const n = (k) => l[k] || 0;
      return { ...l, mes: m, frete: r2(n('frete')), entregues: n('entregues'), pct_prazo: div(n('no_prazo'), n('com_previsao')), custo_entrega: r2(div(n('frete'), n('entregas_cte'))),
        custo_kg: r4(div(n('frete'), n('peso'))), pct_frete: div(n('frete'), n('valor_nf')), pct_ocorrencia: div(n('com_problema'), n('emitidas')), reentregas: n('reentregas') };
    }).reverse();
    const comPrazo = linhas.filter((l) => l.pct_prazo != null);
    const tendencia = comPrazo.length >= 2 ? comPrazo[0].pct_prazo - comPrazo[Math.min(comPrazo.length - 1, 3)].pct_prazo : null;
    return {
      de, colunas: [['mes', 'Mês', 'mes'], ['entregues', 'Entregues', 'num'], ['pct_prazo', 'No prazo', 'sla'], ['atraso_medio', 'Atraso médio (dias)', 'dec'],
        ['prazo_medio', 'Prazo médio (dias)', 'dec'], ['frete', 'Frete', 'moeda'], ['custo_entrega', 'Custo por entrega', 'moeda'], ['custo_kg', 'Custo por kg', 'moeda4'],
        ['pct_frete', 'Frete / valor das notas', 'pct'], ['pct_ocorrencia', 'Notas com problema', 'pct'], ['reentregas', 'Reentregas', 'num']],
      linhas, agrupado: true,
      resumo: [['Meses', linhas.length], ['Entregues', linhas.reduce((t, l) => t + l.entregues, 0)], ['Frete', linhas.reduce((t, l) => t + l.frete, 0), 'moeda'],
        ['No prazo (último mês com entrega)', comPrazo[0]?.pct_prazo ?? null, 'pct'], ['Variação do no prazo (3 meses)', tendencia, 'pp']],
    };
  }

  return {
    61: { titulo: 'Ranking de transportadoras', grupo: 'Classificação', tela: 'desempenho', desc: 'Classificação pela nota geral (0 a 10): prazo 35%, custo 30% (frete sobre o valor das notas, comparado entre elas), ocorrências 15%, comprovante 10% e rastreamento 10%.',
      rodar: async (req, q, de, ate) => {
        const { linhas, geral } = await porTransportadora(req, q, de, ate);
        return { colunas: [['posicao', 'Posição', 'posicao'], T, ['nota', 'Nota geral', 'nota'], ['conceito', 'Conceito', 'conceito'], ['pct_prazo', 'No prazo', 'sla'], ['pct_frete', 'Frete / valor das notas', 'pct'],
          ['pct_ocorrencia', 'Notas com problema', 'pct'], ['custo_entrega', 'Custo por entrega', 'moeda'], ['frete', 'Frete', 'moeda'], ['entregues', 'Entregues', 'num']],
        ...grupo(linhas), resumo: [['Transportadoras', linhas.length], ['1º lugar', linhas[0]?.nota != null ? linhas[0].transportadora : '—', 'texto'], ['Nota do 1º', linhas[0]?.nota ?? null, 'dec'],
          ['No prazo (geral)', geral.pct_prazo, 'pct'], ['Frete / valor das notas', geral.pct_frete, 'pct']] };
      } },
    62: { titulo: 'Índice de entregas no prazo', grupo: 'Índices', tela: 'desempenho', desc: 'Notas entregues no período: quantas chegaram até a previsão, por transportadora.',
      rodar: async (req, q, de, ate) => {
        const { linhas, geral } = await porTransportadora(req, q, de, ate);
        return { colunas: [T, ['entregues', 'Entregues', 'num'], ['com_previsao', 'Com previsão', 'num'], ['no_prazo', 'No prazo', 'num'], ['pct_prazo', 'Índice no prazo', 'sla'], ['prazo_medio', 'Prazo médio (dias)', 'dec']],
          ...grupo(ordenar(linhas.filter((l) => l.entregues), 'pct_prazo')), resumo: [['Entregues', geral.entregues], ['Com previsão', geral.com_previsao], ['No prazo', geral.no_prazo], ['Índice no prazo', geral.pct_prazo, 'pct']] };
      } },
    63: { titulo: 'Índice de atrasos', grupo: 'Índices', tela: 'desempenho', desc: 'Entregas feitas depois da previsão (notas entregues no período) e notas ainda em aberto já atrasadas (emitidas no período).',
      rodar: async (req, q, de, ate) => {
        const { linhas, geral } = await porTransportadora(req, q, de, ate);
        return { colunas: [T, ['entregues', 'Entregues', 'num'], ['fora_prazo', 'Entregues com atraso', 'num'], ['pct_atraso', 'Índice de atraso', 'atraso'], ['atraso_medio', 'Atraso médio (dias)', 'dec'],
          ['maior_atraso', 'Maior atraso (dias)', 'num'], ['atrasadas_abertas', 'Em aberto atrasadas', 'num']],
          ...grupo(ordenar(linhas.filter((l) => l.entregues || l.atrasadas_abertas), 'pct_atraso')),
          resumo: [['Entregues com atraso', geral.fora_prazo], ['Índice de atraso', geral.pct_atraso, 'pct'], ['Em aberto atrasadas', geral.atrasadas_abertas]] };
      } },
    64: { titulo: 'Índice de ocorrências', grupo: 'Índices', tela: 'desempenho', desc: 'Notas emitidas no período que tiveram problema no transporte (recusa, avaria, extravio, devolução, ausente/endereço/reentrega, retenção, atraso), pelo rastreamento.',
      rodar: async (req, q, de, ate) => {
        const { linhas, geral } = await porTransportadora(req, q, de, ate);
        return { colunas: [T, ['emitidas', 'Notas', 'num'], ['com_problema', 'Notas com problema', 'num'], ['pct_ocorrencia', 'Índice de ocorrências', 'atraso'], ['ocorrencias', 'Ocorrências', 'num'],
          ['avarias', 'Avaria', 'num'], ['recusas', 'Recusa', 'num'], ['extravios', 'Extravio / sinistro', 'num'], ['devolucoes', 'Devolução', 'num'], ['tentativas', 'Ausente / endereço / reentrega', 'num'], ['reentregas', 'CT-e de reentrega', 'num']],
          ...grupo(ordenar(linhas.filter((l) => l.emitidas), 'pct_ocorrencia')),
          resumo: [['Notas', geral.emitidas], ['Notas com problema', geral.com_problema], ['Índice de ocorrências', geral.pct_ocorrencia, 'pct'], ['Ocorrências', geral.ocorrencias], ['CT-e de reentrega', geral.reentregas]] };
      } },
    65: { titulo: 'Custo médio por entrega', grupo: 'Custos', tela: 'desempenho', desc: 'Frete dos CT-e do período dividido pelas entregas (CT-e principais). O frete inclui reentregas e complementares.',
      rodar: async (req, q, de, ate) => {
        const { linhas, geral } = await porTransportadora(req, q, de, ate);
        return { colunas: [T, ['entregas_cte', 'Entregas (CT-e)', 'num'], ['frete', 'Frete', 'moeda'], ['frete_extra', 'Reentrega / complementar', 'moeda'], ['custo_entrega', 'Custo médio por entrega', 'moeda'], ['pct_frete', 'Frete / valor das notas', 'pct']],
          ...grupo(ordenar(linhas.filter((l) => l.ctes), 'custo_entrega', true)), resumo: [['Entregas (CT-e)', geral.entregas_cte], ['Frete', geral.frete, 'moeda'], ['Custo médio por entrega', geral.custo_entrega, 'moeda']] };
      } },
    66: { titulo: 'Custo médio por kg', grupo: 'Custos', tela: 'desempenho', desc: 'Frete dos CT-e do período dividido pelo peso transportado (peso dos CT-e).',
      rodar: async (req, q, de, ate) => {
        const { linhas, geral } = await porTransportadora(req, q, de, ate);
        return { colunas: [T, ['entregas_cte', 'Entregas (CT-e)', 'num'], ['peso', 'Peso (kg)', 'dec'], ['frete', 'Frete', 'moeda'], ['custo_kg', 'Custo por kg', 'moeda4'], ['custo_entrega', 'Custo por entrega', 'moeda']],
          ...grupo(ordenar(linhas.filter((l) => l.ctes), 'custo_kg', true)), resumo: [['Peso (kg)', geral.peso, 'dec'], ['Frete', geral.frete, 'moeda'], ['Custo médio por kg', geral.custo_kg, 'moeda4']] };
      } },
    67: { titulo: 'Custo médio por NF-e', grupo: 'Custos', tela: 'desempenho', desc: 'Frete dos CT-e do período dividido pelas notas transportadas (CT-e de várias notas conta cada nota).',
      rodar: async (req, q, de, ate) => {
        const { linhas, geral } = await porTransportadora(req, q, de, ate);
        return { colunas: [T, ['notas', 'Notas', 'num'], ['valor_nf', 'Valor das notas', 'moeda'], ['frete', 'Frete', 'moeda'], ['custo_nf', 'Custo médio por NF-e', 'moeda'], ['pct_frete', 'Frete / valor das notas', 'pct']],
          ...grupo(ordenar(linhas.filter((l) => l.ctes), 'custo_nf', true)), resumo: [['Notas', geral.notas], ['Frete', geral.frete, 'moeda'], ['Custo médio por NF-e', geral.custo_nf, 'moeda'], ['Frete / valor das notas', geral.pct_frete, 'pct']] };
      } },
    68: { titulo: 'Comparativo de transportadoras', grupo: 'Análises', tela: 'desempenho', desc: 'Custos e desempenho lado a lado; as colunas "vs média" mostram quanto cada uma fica acima ou abaixo da média geral.',
      rodar: async (req, q, de, ate) => {
        const { linhas, geral } = await porTransportadora(req, q, de, ate);
        const vs = (v, m) => (v == null || !m ? null : v / m - 1);
        const ls = linhas.map((l) => ({ ...l, vs_kg: vs(l.custo_kg, geral.custo_kg), vs_entrega: vs(l.custo_entrega, geral.custo_entrega), vs_prazo: l.pct_prazo == null || geral.pct_prazo == null ? null : l.pct_prazo - geral.pct_prazo }));
        return { colunas: [T, ['notas', 'Notas', 'num'], ['frete', 'Frete', 'moeda'], ['pct_frete', 'Frete / notas', 'pct'], ['custo_entrega', 'Por entrega', 'moeda'], ['vs_entrega', 'vs média', 'varcusto'],
          ['custo_kg', 'Por kg', 'moeda4'], ['vs_kg', 'vs média', 'varcusto'], ['custo_nf', 'Por NF-e', 'moeda'], ['pct_prazo', 'No prazo', 'sla'], ['vs_prazo', 'vs média', 'varpp'],
          ['pct_ocorrencia', 'Com problema', 'pct'], ['prazo_medio', 'Prazo médio (dias)', 'dec'], ['nota', 'Nota', 'nota']],
          ...grupo(ordenar(ls, 'frete')), resumo: [['Transportadoras', ls.length], ['Frete', geral.frete, 'moeda'], ['Média por entrega', geral.custo_entrega, 'moeda'], ['Média por kg', geral.custo_kg, 'moeda4'], ['No prazo (média)', geral.pct_prazo, 'pct']] };
      } },
    69: { titulo: 'Avaliação das transportadoras', grupo: 'Análises', tela: 'desempenho', desc: 'Nota de 0 a 10 em cada critério de qualidade e eficiência, a nota geral e o conceito (A 8,5+, B 7+, C 5+, D abaixo de 5).',
      rodar: async (req, q, de, ate) => {
        const { linhas } = await porTransportadora(req, q, de, ate);
        const conta = (c) => linhas.filter((l) => l.conceito.startsWith(c)).length;
        return { colunas: [T, ['n_prazo', 'Prazo (35%)', 'nota'], ['n_custo', 'Custo (30%)', 'nota'], ['n_ocorrencia', 'Ocorrências (15%)', 'nota'], ['n_comprovante', 'Comprovante (10%)', 'nota'],
          ['n_rastreio', 'Rastreamento (10%)', 'nota'], ['nota', 'Nota geral', 'nota'], ['conceito', 'Conceito', 'conceito'], ['pct_comprovante', 'Entregas com comprovante', 'pct'], ['pct_rastreio', 'Notas com rastreio', 'pct']],
          ...grupo(linhas), resumo: [['Transportadoras', linhas.length], ['A · Excelente', conta('A')], ['B · Bom', conta('B')], ['C · Regular', conta('C')], ['D · Ruim', conta('D')]] };
      } },
    70: { titulo: 'Histórico de desempenho', grupo: 'Análises', tela: 'desempenho', desc: 'Evolução mês a mês nos 12 meses até a data final do período (escolha uma transportadora no filtro para ver só ela).',
      rodar: (req, q, de, ate) => historico(req, q, ate) },
  };
};
