// Relatórios de planejamento dos fretes contratados (tela 331, embarcador): os números 81 a 86. Montado por
// src/relatoriosEntregas.js (mesmos filtros, totalizador, gráfico e drill-down).
//  81 Analítico de transportadora: cada CT-e do período (data do CT-e), por transportadora, com a nota, o destino, peso,
//     frete, frete/kg, frete sobre o valor da nota e o prazo. É o detalhe do "Comparativo de transportadoras" (68).
//  82 Curva ABC de clientes e fornecedores: frete das notas emitidas no período por cliente (notas de saída) e por
//     fornecedor (notas de entrada, frete de compra); A = até 80% do frete, B = até 95%, C = o resto (cada lado à parte).
//  83 Rotas por transportadora: UF de origem (da chave da NF-e) até a cidade/UF de destino, por transportadora.
//  84 Volumetria: notas, volumes, peso, m³, valor e frete por dia (período até 62 dias) ou por mês.
//  85 Simulação de histórico: as notas já embarcadas, recalculadas pela tabela de cada transportadora (a mesma conta do
//     "Melhor transportadora por destino"), com o frete real, o da melhor tabela e a economia que teria havido.
//  86 Curva ABC de fretes extras e complementares: CT-e a mais (reentrega, devolução, complementar, redespacho...) por
//     cliente, com a classe ABC pelo valor.
const div = (a, b) => (b ? a / b : null);
const soma = (ls, k) => ls.reduce((t, l) => t + (Number(l[k]) || 0), 0);

// Classe ABC pela coluna k (do maior para o menor): A até 80% acumulado (a linha que cruza os 80% ainda é A), B até 95%.
function curvaAbc(linhas, k) {
  const total = soma(linhas, k); let acum = 0;
  return [...linhas].sort((a, b) => (Number(b[k]) || 0) - (Number(a[k]) || 0)).map((l, i) => {
    const antes = div(acum, total) || 0; acum += Number(l[k]) || 0;
    return { ...l, posicao: i + 1, part: div(Number(l[k]) || 0, total), acum: div(acum, total), classe: antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C' };
  });
}

module.exports = function criar(h) {
  const { consulta, filtros, TRANSP, BASE, listaNotas, notasDoGrupo, notasDoPeriodo, EMITIDAS } = h;
  const r2 = (v) => (v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
  const VALOR = 'COALESCE(f.valor_total_cte, f.valor_frete_negociado, 0)';
  const DATA = 'COALESCE(f.data_emissao_cte, f.data_emissao_nf)';
  const CONTA = `f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE AND f.cte_nao_levou IS NOT TRUE AND COALESCE(f.status_aprovacao, '') <> 'Rejeitado'
    AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')`;
  // Frete da nota: o rateado do CT-e de várias notas ou o do próprio CT-e, mais os CT-e a mais (reentrega...).
  const FRETE_NOTA = `COALESCE(f.frete_rateado, CASE WHEN f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE THEN ${VALOR} END, 0)
    + COALESCE((SELECT SUM(c.valor_total_cte) FROM fretes c WHERE c.frete_principal_id = f.id AND c.chave_cte IS NOT NULL AND c.cte_cancelado IS NOT TRUE AND c.cte_nao_levou IS NOT TRUE), 0)`;
  const TIPO = `CASE WHEN f.vinculo_cte = 'reentrega' THEN 'Reentrega' WHEN f.vinculo_cte = 'devolucao' THEN 'Devolução' WHEN f.vinculo_cte IN ('redespacho', 'redespacho_nota') THEN 'Redespacho'
    WHEN f.vinculo_cte = 'complementar' OR f.tipo_cte = '1' THEN 'Complementar' WHEN f.vinculo_cte = 'retorno' THEN 'Retorno'
    WHEN f.frete_principal_id IS NOT NULL THEN 'Outros CT-e da nota' ELSE 'Frete de entrega' END`;
  const NF = "COALESCE(NULLIF(f.numero_nf, ''), (SELECT p.numero_nf FROM fretes p WHERE p.id = f.frete_principal_id))";
  const CLIENTE = "COALESCE(NULLIF(f.cliente, ''), (SELECT p.cliente FROM fretes p WHERE p.id = f.frete_principal_id))";
  // UF de origem: os 2 primeiros dígitos da chave da NF-e (código IBGE da UF do emitente).
  const UFS = { 11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
    31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF' };
  const UF_ORIGEM = `(CASE SUBSTRING(f.chave_nfe FROM 1 FOR 2) ${Object.entries(UFS).map(([c, u]) => `WHEN '${c}' THEN '${u}'`).join(' ')} ELSE '?' END)`;
  const DESTINO = "COALESCE(NULLIF(f.cidade, ''), '?') || '/' || COALESCE(UPPER(NULLIF(f.uf, '')), '?')";
  // CT-e a mais (reentrega...) sem cidade: a da nota.
  const DESTINO_CTE = `CASE WHEN NULLIF(f.cidade, '') IS NULL AND f.frete_principal_id IS NOT NULL
    THEN (SELECT COALESCE(NULLIF(p.cidade, ''), '?') || '/' || COALESCE(UPPER(NULLIF(p.uf, '')), '?') FROM fretes p WHERE p.id = f.frete_principal_id) ELSE ${DESTINO} END`;

  const resumoAbc = (ls, k, nome) => {
    const cl = (c) => ls.filter((l) => l.classe === c);
    return [[`${nome} A`, cl('A').length], [`${nome} B`, cl('B').length], [`${nome} C`, cl('C').length],
      ['Frete na classe A', div(soma(cl('A'), k), soma(ls, k)), 'pct']];
  };

  // 81: CT-e do período com a nota de cada um.
  async function analitico(req, q, de, ate) {
    const p = [de, ate]; const extra = filtros(q, p);
    const { rows } = await consulta(req, `SELECT COALESCE(f.frete_principal_id, f.id) AS id, COALESCE(${TRANSP}, '(sem transportadora)') AS transportadora, f.numero_cte,
        to_char(${DATA}, 'YYYY-MM-DD') AS emissao_cte, ${NF} AS nf, ${CLIENTE} AS cliente, ${DESTINO_CTE} AS destino, ${TIPO} AS tipo,
        COALESCE(f.peso_kg, f.peso_bruto)::float AS peso, f.qtd_volumes AS volumes, f.valor_faturado::float AS valor_nf, ${VALOR}::float AS frete,
        to_char(f.data_entrega_prevista, 'YYYY-MM-DD') AS previsao, to_char(f.data_entrega, 'YYYY-MM-DD') AS entrega,
        CASE WHEN f.data_entrega IS NULL THEN CASE WHEN f.frete_principal_id IS NULL THEN 'Em aberto' END
          WHEN f.data_entrega_prevista IS NULL THEN 'Entregue' WHEN f.data_entrega <= f.data_entrega_prevista THEN 'No prazo' ELSE 'Com atraso' END AS prazo
      FROM fretes f WHERE ${CONTA} AND ${DATA} BETWEEN $1::date AND $2::date${extra}
      ORDER BY 2, ${DATA}, f.numero_cte LIMIT 5001`, p);
    const linhas = rows.slice(0, 5000).map((r) => ({ ...r, frete: r2(r.frete), frete_kg: r.peso ? div(r.frete, r.peso) : null, pct: r.valor_nf ? div(r.frete, r.valor_nf) : null }));
    const entregues = linhas.filter((l) => ['No prazo', 'Com atraso'].includes(l.prazo));
    const principais = linhas.filter((l) => l.tipo === 'Frete de entrega');
    return {
      colunas: [['transportadora', 'Transportadora'], ['numero_cte', 'CT-e'], ['emissao_cte', 'Emissão do CT-e', 'data'], ['nf', 'NF-e'], ['cliente', 'Cliente'], ['destino', 'Destino'],
        ['tipo', 'Tipo'], ['peso', 'Peso (kg)', 'dec'], ['volumes', 'Volumes', 'num'], ['valor_nf', 'Valor da NF-e', 'moeda'], ['frete', 'Frete', 'moeda'], ['frete_kg', 'Frete / kg', 'moeda4'],
        ['pct', 'Frete / NF-e', 'atraso'], ['previsao', 'Previsão', 'data'], ['entrega', 'Entrega', 'data'], ['prazo', 'Prazo']],
      linhas, mais: rows.length > 5000,
      resumo: [['Transportadoras', new Set(linhas.map((l) => l.transportadora)).size], ['CT-e', linhas.length], ['Frete', soma(linhas, 'frete'), 'moeda'],
        ['Frete / kg', div(soma(principais, 'frete'), soma(principais, 'peso')), 'moeda4'], ['Frete / NF-e', div(soma(principais, 'frete'), soma(principais, 'valor_nf')), 'pct'],
        ['No prazo', div(entregues.filter((l) => l.prazo === 'No prazo').length, entregues.length), 'pct']],
    };
  }

  // 82: chave do grupo (a mesma no relatório e no drill-down).
  const LADO = `CASE WHEN f.nf_entrada IS TRUE THEN 'Fornecedor: ' || COALESCE(NULLIF(f.emitente_nome, ''), '?') ELSE 'Cliente: ' || COALESCE(NULLIF(f.cliente, ''), '?') END`;
  async function abcClientes(req, q, de, ate) {
    const p = [de, ate]; const extra = filtros(q, p);
    const { rows } = await consulta(req, `SELECT ${LADO} AS grupo, (f.nf_entrada IS TRUE) AS entrada, COUNT(*)::int AS notas, COALESCE(SUM(f.valor_faturado), 0)::float AS valor,
        COALESCE(SUM(COALESCE(f.peso_bruto, f.peso_kg)), 0)::float AS peso, COALESCE(SUM(${FRETE_NOTA}), 0)::float AS frete
      FROM fretes f WHERE ${BASE} AND ${EMITIDAS}${extra} GROUP BY 1, 2 LIMIT 20000`, p);
    const lado = (ent) => curvaAbc(rows.filter((r) => !!r.entrada === ent).map((r) => ({ ...r, frete: r2(r.frete), pct_frete: div(r.frete, r.valor) })), 'frete');
    const clientes = lado(false); const fornec = lado(true);
    const linhas = [...clientes, ...fornec].map(({ entrada, ...l }) => ({ ...l, tipo: entrada ? 'Fornecedor' : 'Cliente' }));
    return {
      colunas: [['classe', 'Classe', 'conceito'], ['posicao', 'Posição', 'num'], ['grupo', 'Cliente / fornecedor'], ['frete', 'Frete', 'moeda'], ['notas', 'Notas', 'num'],
        ['valor', 'Valor das notas', 'moeda'], ['peso', 'Peso (kg)', 'dec'], ['pct_frete', 'Frete / valor', 'atraso'], ['part', 'Participação', 'pct'], ['acum', '% acumulado', 'pct']],
      linhas, agrupado: true,
      resumo: [...resumoAbc(clientes, 'frete', 'Clientes'), ...(fornec.length ? [['Fornecedores', fornec.length], ['Frete de compra (fornecedores)', soma(fornec, 'frete'), 'moeda']] : []),
        ['Frete total', soma(linhas, 'frete'), 'moeda']],
    };
  }

  // 83: rota = UF de origem → cidade/UF de destino.
  const ROTA = `${UF_ORIGEM} || ' → ' || ${DESTINO}`;
  const CHAVE_ROTA = `COALESCE(${TRANSP}, '?') || ' | ' || ${ROTA}`;
  async function rotas(req, q, de, ate) {
    const p = [de, ate]; const extra = filtros(q, p);
    const { rows } = await consulta(req, `SELECT ${CHAVE_ROTA} AS grupo, COALESCE(${TRANSP}, '(sem transportadora)') AS transportadora, ${ROTA} AS rota,
        COUNT(*)::int AS notas, COALESCE(SUM(f.valor_faturado), 0)::float AS valor, COALESCE(SUM(COALESCE(f.peso_bruto, f.peso_kg)), 0)::float AS peso,
        COALESCE(SUM(${FRETE_NOTA}), 0)::float AS frete,
        ROUND(AVG(f.data_entrega - f.data_emissao_nf) FILTER (WHERE f.data_entrega >= f.data_emissao_nf), 1)::float AS prazo_medio,
        COUNT(*) FILTER (WHERE f.data_entrega IS NOT NULL AND f.data_entrega_prevista IS NOT NULL)::int AS com_previsao,
        COUNT(*) FILTER (WHERE f.data_entrega <= f.data_entrega_prevista)::int AS no_prazo
      FROM fretes f WHERE ${BASE} AND ${EMITIDAS}${extra} GROUP BY 1, 2, 3 ORDER BY 7 DESC LIMIT 3000`, p);
    const linhas = rows.map((r) => ({ ...r, frete: r2(r.frete), frete_kg: div(r.frete, r.peso), pct_frete: div(r.frete, r.valor), pct_prazo: div(r.no_prazo, r.com_previsao) }));
    return {
      colunas: [['transportadora', 'Transportadora'], ['rota', 'Rota (origem → destino)'], ['notas', 'Notas', 'num'], ['peso', 'Peso (kg)', 'dec'], ['valor', 'Valor das notas', 'moeda'],
        ['frete', 'Frete', 'moeda'], ['frete_kg', 'Frete / kg', 'moeda4'], ['pct_frete', 'Frete / valor', 'atraso'], ['prazo_medio', 'Prazo médio (dias)', 'dec'], ['pct_prazo', 'No prazo', 'sla']],
      linhas, agrupado: true, drillValor: 'grupo', drillRotulo: 'rota',
      resumo: [['Rotas', new Set(linhas.map((l) => l.rota)).size], ['Transportadoras', new Set(linhas.map((l) => l.transportadora)).size], ['Notas', soma(linhas, 'notas')],
        ['Frete', soma(linhas, 'frete'), 'moeda'], ['Frete / kg', div(soma(linhas, 'frete'), soma(linhas, 'peso')), 'moeda4']],
    };
  }

  // 84: por dia (até 62 dias) ou por mês.
  async function volumetria(req, q, de, ate) {
    const porDia = (Date.parse(ate) - Date.parse(de)) / 86400000 <= 62;
    const p = [de, ate]; const extra = filtros(q, p);
    const { rows } = await consulta(req, `SELECT to_char(f.data_emissao_nf, '${porDia ? 'YYYY-MM-DD' : 'YYYY-MM'}') AS periodo, COUNT(*)::int AS notas,
        COALESCE(SUM(f.qtd_volumes), 0)::int AS volumes, COALESCE(SUM(COALESCE(f.peso_bruto, f.peso_kg)), 0)::float AS peso,
        COALESCE(SUM(f.cubagem_m3), 0)::float AS m3, COALESCE(SUM(f.valor_faturado), 0)::float AS valor, COALESCE(SUM(${FRETE_NOTA}), 0)::float AS frete
      FROM fretes f WHERE ${BASE} AND ${EMITIDAS}${extra} GROUP BY 1 ORDER BY 1 DESC`, p);
    const linhas = rows.map((r) => ({ ...r, frete: r2(r.frete), m3: r2(r.m3), peso_nota: div(r.peso, r.notas), vol_nota: div(r.volumes, r.notas), kg_vol: div(r.peso, r.volumes),
      densidade: r.m3 ? r.peso / r.m3 : null, frete_kg: div(r.frete, r.peso) }));
    const t = (k) => soma(linhas, k);
    return {
      colunas: [['periodo', porDia ? 'Dia' : 'Mês', porDia ? 'data' : 'mes'], ['notas', 'Notas', 'num'], ['volumes', 'Volumes', 'num'], ['peso', 'Peso (kg)', 'dec'], ['m3', 'Cubagem (m³)', 'dec'],
        ['valor', 'Valor das notas', 'moeda'], ['frete', 'Frete', 'moeda'], ['peso_nota', 'Peso por nota', 'dec'], ['vol_nota', 'Volumes por nota', 'dec'], ['kg_vol', 'kg por volume', 'dec'],
        ['densidade', 'Densidade (kg/m³)', 'dec'], ['frete_kg', 'Frete / kg', 'moeda4']],
      linhas, agrupado: true,
      resumo: [['Notas', t('notas')], ['Volumes', t('volumes')], ['Peso (kg)', t('peso'), 'dec'], ['Cubagem (m³)', t('m3'), 'dec'],
        [porDia ? 'Média de notas por dia' : 'Média de notas por mês', div(t('notas'), linhas.length), 'dec'], ['Frete / kg', div(t('frete'), t('peso')), 'moeda4']],
    };
  }

  // 85: simulação das notas já embarcadas em todas as tabelas.
  const LIMITE_SIM = 2000;
  async function simulacao(req, q, de, ate) {
    const p = [de, ate]; const extra = filtros(q, p);
    const { rows: notas } = await consulta(req, `SELECT f.id, f.numero_nf, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS emissao, f.cliente, f.cliente_documento, f.cidade, f.bairro, f.uf,
        f.qtd_volumes, f.peso_kg, f.cubagem_m3, f.valor_faturado, ${TRANSP} AS transportadora, f.redespacho, f.cidade_redespacho, f.redespacho_cnpj, f.observacoes,
        COALESCE(f.frete_rateado, CASE WHEN f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE THEN ${VALOR} END)::float AS frete_real
      FROM fretes f WHERE ${BASE} AND ${EMITIDAS} AND f.nf_entrada IS NOT TRUE AND NULLIF(TRIM(COALESCE(f.cidade, '')), '') IS NOT NULL
        AND ((f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE) OR f.cte_coberto_por IS NOT NULL)
        AND COALESCE(f.frete_cif_fob, '') NOT IN ('FOB', 'Destinatário', 'Destinatario', 'Sem frete', 'Próprio destinatário')${extra}
      ORDER BY f.data_emissao_nf DESC, f.numero_nf DESC LIMIT ${LIMITE_SIM + 1}`, p);
    const lista = notas.slice(0, LIMITE_SIM);
    const { calc, porTransportadora, destinoDa, ufOrigem } = await require('./routes/records').contextoDestinos();
    const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cobertura = new Map();
    const linhas = lista.map((n) => {
      const destino = destinoDa(n);
      const alvo = destino.tipo === 'cliente' ? { cidade: n.cidade, bairro: n.bairro, uf: n.uf } : { cidade: destino.cidade, bairro: null, uf: destino.uf };
      const valores = {};
      for (const [nome, trechos] of Object.entries(porTransportadora)) {
        const trecho = alvo.cidade ? calc.escolherTrechoDoDestino(trechos, alvo) : null;
        if (!trecho) continue;
        const { freteBase } = calc.calcularFreteBase(trecho, { qtdVolumes: n.qtd_volumes, pesoKg: n.peso_kg, cubagemM3: n.cubagem_m3 });
        const comp = calc.calcularComponentesEValorTotal(trecho, freteBase, { valorFaturado: n.valor_faturado, pesoKg: n.peso_kg, qtdVolumes: n.qtd_volumes,
          cliente: n.cliente, clienteCnpj: n.cliente_documento, ufIni: ufOrigem, ufFim: alvo.uf || n.uf });
        if (!Number.isFinite(comp.total) || comp.total <= 0) continue;
        valores[nome] = r2(comp.total);
        cobertura.set(nome, (cobertura.get(nome) || 0) + 1);
      }
      const ord = Object.entries(valores).sort((a, b) => a[1] - b[1]);
      const melhor = ord[0] || null;
      const propria = Object.entries(valores).find(([nome]) => norm(nome) === norm(n.transportadora));
      const real = n.frete_real ? r2(n.frete_real) : null;
      const economia = melhor && real != null && norm(melhor[0]) !== norm(n.transportadora) ? Math.max(0, r2(real - melhor[1])) : 0;
      return { id: n.id, numero_nf: n.numero_nf, emissao: n.emissao, cliente: n.cliente, destino: `${destino.cidade || n.cidade || '?'}/${alvo.uf || n.uf || '?'}`,
        transportadora: n.transportadora, frete_real: real, tabela_propria: propria ? propria[1] : null, dif_tabela: propria && real != null ? r2(real - propria[1]) : null,
        melhor: melhor ? melhor[0] : 'Sem tabela para o destino', melhor_valor: melhor ? melhor[1] : null, economia, pct_economia: real ? div(economia, real) : null, opcoes: ord.length, valores };
    });
    // Uma coluna por transportadora com tabela (as 8 que atendem mais notas): quanto cada nota teria custado com ela.
    const top = [...cobertura.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([nome]) => nome);
    linhas.forEach((l) => { top.forEach((nome, i) => { l[`t${i}`] = l.valores[nome] ?? null; }); delete l.valores; });
    const comTabela = linhas.filter((l) => l.melhor_valor != null && l.frete_real != null);
    return {
      colunas: [['numero_nf', 'NF-e'], ['emissao', 'Emissão', 'data'], ['cliente', 'Cliente'], ['destino', 'Destino'], ['transportadora', 'Transportadora usada'],
        ['frete_real', 'Frete real', 'moeda'], ['tabela_propria', 'Pela tabela dela', 'moeda'], ['dif_tabela', 'Real − tabela', 'difcusto'],
        ['melhor', 'Melhor tabela'], ['melhor_valor', 'Valor da melhor', 'moeda'], ['economia', 'Economia possível', 'moeda'], ['pct_economia', 'Economia (%)', 'pct'], ['opcoes', 'Tabelas que atendem', 'num'],
        ...top.map((nome, i) => [`t${i}`, nome, 'moeda'])],
      linhas, mais: notas.length > LIMITE_SIM,
      resumo: [['Notas simuladas', linhas.length], ['Frete real (notas com tabela)', soma(comTabela, 'frete_real'), 'moeda'], ['Frete pela melhor tabela', soma(comTabela, 'melhor_valor'), 'moeda'],
        ['Economia possível', soma(linhas, 'economia'), 'moeda'], ['Notas com economia', linhas.filter((l) => l.economia > 0).length],
        ['Notas sem tabela', linhas.filter((l) => l.melhor_valor == null).length]],
    };
  }

  // 86: CT-e a mais por cliente.
  const EXTRA = `${CONTA} AND (f.frete_principal_id IS NOT NULL OR f.vinculo_cte = 'complementar' OR f.tipo_cte = '1')`;
  async function ctesExtras(req, q, de, ate, cliente) {
    const p = [de, ate]; const extra = filtros(q, p);
    p.push(cliente);
    const { rows } = await consulta(req, `SELECT COALESCE(f.frete_principal_id, f.id) AS id, f.numero_cte, to_char(${DATA}, 'YYYY-MM-DD') AS emissao_cte, ${NF} AS nf, ${TRANSP} AS transportadora,
        ${TIPO} AS tipo, ${VALOR}::float AS valor FROM fretes f
      WHERE ${EXTRA} AND ${DATA} BETWEEN $1::date AND $2::date AND COALESCE(${CLIENTE}, '') = $${p.length}${extra} ORDER BY ${DATA} DESC LIMIT 5000`, p);
    return { colunas: [['numero_cte', 'CT-e'], ['emissao_cte', 'Emissão', 'data'], ['nf', 'NF-e'], ['transportadora', 'Transportadora'], ['tipo', 'Tipo'], ['valor', 'Valor', 'moeda']],
      linhas: rows, resumo: [['CT-e', rows.length], ['Valor', soma(rows, 'valor'), 'moeda']] };
  }
  async function abcExtras(req, q, de, ate) {
    const p = [de, ate]; const extra = filtros(q, p);
    const { rows } = await consulta(req, `SELECT COALESCE(${CLIENTE}, '') AS grupo, ${TIPO} AS tipo, COUNT(*)::int AS ctes, COALESCE(SUM(${VALOR}), 0)::float AS valor,
        string_agg(DISTINCT ${TRANSP}, ', ') AS transportadoras
      FROM fretes f WHERE ${EXTRA} AND ${DATA} BETWEEN $1::date AND $2::date${extra} GROUP BY 1, 2 LIMIT 20000`, p);
    const TIPOS = { Reentrega: 'reentrega', Devolução: 'devolucao', Complementar: 'complementar', Redespacho: 'redespacho' };
    const porCliente = new Map();
    for (const r of rows) {
      const l = porCliente.get(r.grupo) || { grupo: r.grupo || '(sem cliente)', ctes: 0, valor: 0, reentrega: 0, devolucao: 0, complementar: 0, redespacho: 0, outros: 0, transp: new Set() };
      l.ctes += r.ctes; l.valor += r.valor; l[TIPOS[r.tipo] || 'outros'] += r.valor;
      String(r.transportadoras || '').split(', ').filter(Boolean).forEach((t) => l.transp.add(t));
      porCliente.set(r.grupo, l);
    }
    const linhas = curvaAbc([...porCliente.values()].map(({ transp, ...l }) => ({ ...l, valor: r2(l.valor), transportadoras: [...transp].join(', ') })), 'valor');
    return {
      colunas: [['classe', 'Classe', 'conceito'], ['posicao', 'Posição', 'num'], ['grupo', 'Cliente'], ['ctes', 'CT-e a mais', 'num'], ['valor', 'Valor', 'moeda'],
        ['reentrega', 'Reentrega', 'moeda'], ['devolucao', 'Devolução', 'moeda'], ['complementar', 'Complementar', 'moeda'], ['redespacho', 'Redespacho', 'moeda'], ['outros', 'Outros', 'moeda'],
        ['part', 'Participação', 'pct'], ['acum', '% acumulado', 'pct'], ['transportadoras', 'Transportadoras']],
      linhas, agrupado: true,
      resumo: [['CT-e a mais', soma(linhas, 'ctes')], ['Valor', soma(linhas, 'valor'), 'moeda'], ...resumoAbc(linhas, 'valor', 'Clientes').map((x) => (x[0] === 'Frete na classe A' ? ['Valor na classe A', x[1], x[2]] : x))],
    };
  }

  const T = 'planejamento';
  return {
    81: { titulo: 'Relatório analítico de transportadora', grupo: 'Transportadoras', tela: T,
      desc: 'Cada CT-e do período (data do CT-e), por transportadora: nota, cliente, destino, peso, frete, frete por kg, frete sobre a nota e o prazo. O resumo por transportadora fica no 68 · Comparativo.',
      rodar: analitico },
    82: { titulo: 'Curva ABC de clientes e fornecedores', grupo: 'Curvas ABC', tela: T, detalhe: notasDoGrupo(EMITIDAS, LADO),
      desc: 'Frete das notas emitidas no período por cliente (notas de saída) e por fornecedor (notas de entrada). A = até 80% do frete, B = até 95%, C = o resto; clientes e fornecedores têm cada um a sua curva.',
      rodar: abcClientes },
    83: { titulo: 'Rotas por transportadora', grupo: 'Transportadoras', tela: T, detalhe: notasDoGrupo(EMITIDAS, CHAVE_ROTA),
      desc: 'Notas emitidas no período por transportadora e rota (UF de origem, pela chave da NF-e, até a cidade/UF de destino), com o frete, o frete por kg, o prazo médio e o % no prazo.',
      rodar: rotas },
    84: { titulo: 'Volumetria', grupo: 'Volumes', tela: T, drill: 'periodo', detalhe: notasDoPeriodo('f.data_emissao_nf'),
      desc: 'Notas, volumes, peso, cubagem, valor e frete por dia (período de até 62 dias) ou por mês, com o peso e os volumes por nota, o kg por volume e a densidade.',
      rodar: volumetria },
    85: { titulo: 'Resultado analítico da simulação de histórico', grupo: 'Simulação', tela: T,
      desc: `As notas já embarcadas no período (até ${LIMITE_SIM}), recalculadas pela tabela de cada transportadora (a conta do "Melhor transportadora por destino"): o frete real, o da tabela da própria transportadora, a melhor tabela e a economia que teria havido. Uma coluna por transportadora com tabela.`,
      rodar: simulacao },
    86: { titulo: 'Curva ABC de fretes extras e complementares', grupo: 'Curvas ABC', tela: T, detalhe: (req, q, de, ate, v) => ctesExtras(req, q, de, ate, v),
      desc: 'CT-e a mais do período (reentrega, devolução, complementar, redespacho, retorno) por cliente, com a classe ABC pelo valor e a divisão por tipo. Dois cliques num cliente mostram os CT-e.',
      rodar: abcExtras },
  };
};
module.exports.curvaAbc = curvaAbc;
