// Relatórios de NF-e × CT-e (tela 326, Gestão e relatórios): os números 25 a 34 da lista da empresa. Montado por
// src/relatoriosEntregas.js, com as mesmas bases e filtros. Usa as regras que já existem:
//  - CT-e de várias notas: as notas cobertas apontam para o CT-e em cte_coberto_por (src/nfeCte.js) e o frete de
//    cada nota é o frete_rateado; CT-e a mais da nota (reentrega, devolução...) fica num registro filho (frete_principal_id).
//  - Conferência campo a campo do CT-e com as notas: conferir() de src/nfeCte.js (mesmas tolerâncias).
//  - Duplicidade: a regra única de src/duplicidade.js (a mesma da auditoria e de "Anomalias e duplicidades").
const { conferir, lerCte, numerosDasChaves } = require('./nfeCte');
const dup = require('./duplicidade');

module.exports = function criar(h) {
  const { consulta, filtros, BASE } = h;
  const TRANSP_NF = 'COALESCE(f.transportadora_cte, f.transportadora, f.transportadora_nfe)';
  const CTE_OK = 'f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE';
  const FRETE_NOTA = `COALESCE(f.frete_rateado, CASE WHEN ${CTE_OK} THEN COALESCE(f.valor_total_cte, f.valor_frete_negociado) END, 0)`;
  const FRETE_EXTRA = `COALESCE((SELECT SUM(c.valor_total_cte) FROM fretes c WHERE c.frete_principal_id = f.id AND c.chave_cte IS NOT NULL AND c.cte_cancelado IS NOT TRUE AND c.cte_nao_levou IS NOT TRUE), 0)`;
  const TEM_CTE = '(f.chave_cte IS NOT NULL OR f.cte_coberto_por IS NOT NULL)';
  // Nota que precisa de CT-e (a mesma regra de "Nota sem CT-e" do NF-e × CT-e).
  const PRECISA_CTE = `f.nf_devolvida IS NOT TRUE AND f.nf_retornou IS NOT TRUE AND f.nf_entrada IS NOT TRUE AND f.nf_sem_circulacao IS NOT TRUE
    AND f.frete_por_conta_cliente IS NOT TRUE AND f.carga_direta IS NOT TRUE AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')`;
  const VINCULO = { reentrega: 'Reentrega', devolucao: 'Devolução', redespacho: 'Redespacho', redespacho_nota: 'Redespacho', complementar: 'Complementar', retorno: 'Retorno' };
  const REGIOES = { Norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'], Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'], 'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
    Sudeste: ['ES', 'MG', 'RJ', 'SP'], Sul: ['PR', 'RS', 'SC'] };
  const REGIAO_SQL = `CASE ${Object.entries(REGIOES).map(([r, ufs]) => `WHEN UPPER(f.uf) IN (${ufs.map((u) => `'${u}'`).join(', ')}) THEN '${r}'`).join(' ')} ELSE 'Sem UF' END`;
  const div = (a, b) => (b ? a / b : null);
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  const destino = (r) => [r.cidade, r.uf].filter(Boolean).join('/');
  const rodarSql = async (req, q, de, ate, sql, extraParams = []) => {
    const params = [de, ate, ...extraParams]; const extra = filtros(q, params);
    return (await consulta(req, sql.replace(/\{F\}/g, extra), params)).rows;
  };
  // Chave de acesso de 44 dígitos com o dígito verificador certo (módulo 11).
  const chaveValida = (c) => {
    const d = String(c || '').replace(/\D/g, '');
    if (d.length !== 44) return false;
    let soma = 0; let peso = 2;
    for (let i = 42; i >= 0; i--) { soma += Number(d[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
    const dv = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    return dv === Number(d[43]);
  };

  // CT-e do período com as notas de cada um (25, 27 e 28).
  async function ctesComNotas(req, q, de, ate, { comXml = false, semComplementar = false } = {}) {
    return rodarSql(req, q, de, ate, `SELECT f.id, f.numero_cte, f.cte_serie, to_char(f.data_emissao_cte, 'YYYY-MM-DD') AS data_cte, f.chave_cte, f.vinculo_cte, f.tipo_cte,
        f.frete_principal_id, COALESCE(f.transportadora_cte, f.transportadora) AS transportadora, f.valor_total_cte::float AS frete, f.cliente, f.cidade, f.uf, f.redespacho,
        f.cidade_redespacho, f.cte_nao_levou, COALESCE(f.valor_total_frete, f.valor_total_calculado)::float AS devido${comXml ? ', f.xml_cte_original' : ''},
        n.notas, n.qtd_notas, n.valor_notas, n.peso_notas, n.nota_id, n.docs, n.cidade_nota, n.uf_nota, n.cidade_red
      FROM fretes f
      LEFT JOIN LATERAL (SELECT STRING_AGG(x.numero_nf, ', ' ORDER BY x.numero_nf) AS notas, COUNT(*)::int AS qtd_notas, SUM(x.valor_faturado)::float AS valor_notas,
            SUM(x.peso_kg)::float AS peso_notas, MIN(x.id) AS nota_id, STRING_AGG(DISTINCT x.cliente_documento, ',') AS docs, MIN(x.cidade) AS cidade_nota, MIN(x.uf) AS uf_nota,
            MIN(x.cidade_redespacho) AS cidade_red
          FROM fretes x WHERE COALESCE(x.numero_nf, '') <> '' AND (x.id = COALESCE(f.frete_principal_id, f.id) OR (f.frete_principal_id IS NULL AND x.cte_coberto_por = f.id))) n ON TRUE
      WHERE ${CTE_OK} AND f.data_emissao_cte BETWEEN $1::date AND $2::date${semComplementar ? " AND COALESCE(f.vinculo_cte, '') <> 'complementar' AND COALESCE(f.tipo_cte, '0') <> '1'" : ''}{F}
      ORDER BY f.data_emissao_cte DESC, f.numero_cte DESC LIMIT 5001`);
  }

  // Notas agrupadas (29, 30 e 31): notas emitidas no período.
  async function notasAgrupadas(req, q, de, ate, chave, rotulo, extraCol = null) {
    const rows = await rodarSql(req, q, de, ate, `SELECT ${chave} AS grupo${extraCol ? `, ${extraCol.sql} AS extra` : ''}, COUNT(*)::int AS notas, COALESCE(SUM(f.valor_faturado), 0)::float AS valor,
        COALESCE(SUM(COALESCE(f.peso_bruto, f.peso_kg)), 0)::float AS peso, COALESCE(SUM(f.qtd_volumes), 0)::int AS volumes,
        COUNT(*) FILTER (WHERE ${TEM_CTE})::int AS com_cte, COUNT(*) FILTER (WHERE NOT ${TEM_CTE} AND ${PRECISA_CTE})::int AS sem_cte,
        COUNT(*) FILTER (WHERE f.data_entrega IS NOT NULL)::int AS entregues, COUNT(DISTINCT f.cidade)::int AS cidades,
        COALESCE(SUM(${FRETE_NOTA}), 0)::float AS frete, COALESCE(SUM(${FRETE_EXTRA}), 0)::float AS frete_extra
      FROM fretes f WHERE ${BASE} AND f.data_emissao_nf BETWEEN $1::date AND $2::date{F} GROUP BY 1 ORDER BY ${extraCol ? 4 : 3} DESC LIMIT 2000`);
    const linhas = rows.map((r) => ({ ...r, grupo: r.grupo || '(sem informação)', frete_total: r2(r.frete + r.frete_extra), pct_frete: div(r.frete + r.frete_extra, r.valor), ticket: r2(div(r.valor, r.notas)) }));
    const tot = (k) => linhas.reduce((t, l) => t + (l[k] || 0), 0);
    return {
      colunas: [['grupo', rotulo], ...(extraCol ? [['extra', extraCol.rotulo]] : []), ['notas', 'Notas', 'num'], ['valor', 'Valor das notas', 'moeda'], ['ticket', 'Valor médio', 'moeda'],
        ['peso', 'Peso (kg)', 'dec'], ['volumes', 'Volumes', 'num'], ['com_cte', 'Com CT-e', 'num'], ['sem_cte', 'Sem CT-e', 'num'], ['entregues', 'Entregues', 'num'],
        ['frete_total', 'Frete', 'moeda'], ['pct_frete', 'Frete / valor', 'pct'], ...(chave.includes('uf') ? [['cidades', 'Cidades', 'num']] : [])],
      linhas, agrupado: true,
      resumo: [[`${rotulo.split(' ')[0]}s`.replace('ãos', 'ões').replace('Regiãos', 'Regiões'), linhas.length], ['Notas', tot('notas')], ['Valor das notas', tot('valor'), 'moeda'],
        ['Sem CT-e', tot('sem_cte')], ['Frete', tot('frete_total'), 'moeda'], ['Frete / valor', div(tot('frete_total'), tot('valor')), 'pct']],
    };
  }

  return {
    25: { titulo: 'NF-e vinculadas ao CT-e', grupo: 'Vínculos', tela: 'nfecte', desc: 'Cada CT-e emitido no período e as notas que ele leva (CT-e de várias notas mostra todas; CT-e de reentrega, devolução etc. mostra a nota de origem).',
      rodar: async (req, q, de, ate) => {
        const rows = await ctesComNotas(req, q, de, ate);
        const linhas = rows.slice(0, 5000).map((r) => ({ ...r, id: r.nota_id || undefined, destino: destino(r), tipo: r.frete_principal_id ? (VINCULO[r.vinculo_cte] || 'CT-e a mais') : (VINCULO[r.vinculo_cte] || 'Normal'),
          notas: r.notas || 'Sem nota no sistema', qtd_notas: r.qtd_notas || 0, pct_frete: div(r.frete, r.valor_notas) }));
        return {
          colunas: [['data_cte', 'Emissão CT-e', 'data'], ['numero_cte', 'CT-e'], ['transportadora', 'Transportadora'], ['tipo', 'Tipo'], ['notas', 'NF-e vinculadas'], ['qtd_notas', 'Qtde. NF-e', 'num'],
            ['cliente', 'Destinatário'], ['destino', 'Cidade/UF'], ['valor_notas', 'Valor das notas', 'moeda'], ['frete', 'Frete', 'moeda'], ['pct_frete', 'Frete / valor', 'pct']],
          linhas, mais: rows.length > 5000,
          resumo: [['CT-e', linhas.length], ['NF-e vinculadas', linhas.reduce((t, l) => t + l.qtd_notas, 0)], ['CT-e com várias notas', linhas.filter((l) => l.qtd_notas > 1).length],
            ['CT-e sem nota', linhas.filter((l) => !l.qtd_notas).length], ['Frete', linhas.reduce((t, l) => t + (l.frete || 0), 0), 'moeda']],
        };
      } },
    26: { titulo: 'NF-e sem CT-e', grupo: 'Vínculos', tela: 'nfecte', desc: 'Notas emitidas no período que precisam de CT-e e ainda não têm (nem estão num CT-e de outra nota). Ficam fora: devolução, entrada, sem circulação, frete por conta do cliente (FOB) e carga direta.',
      rodar: async (req, q, de, ate) => {
        const hoje = h.hojeSP();
        const [rows, [fora]] = await Promise.all([
          rodarSql(req, q, de, ate, `SELECT f.id, f.numero_nf, f.nf_serie, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS emissao, ($3::date - f.data_emissao_nf)::int AS dias, f.cliente, f.cidade, f.uf,
              COALESCE(f.transportadora, f.transportadora_nfe) AS transportadora, f.valor_faturado::float AS valor, COALESCE(f.peso_bruto, f.peso_kg)::float AS peso, f.qtd_volumes AS volumes,
              f.numero_pedido, to_char(f.data_entrega, 'YYYY-MM-DD') AS entrega, f.numero_mapa
            FROM fretes f WHERE ${BASE} AND f.data_emissao_nf BETWEEN $1::date AND $2::date AND NOT ${TEM_CTE} AND ${PRECISA_CTE}{F}
            ORDER BY f.data_emissao_nf, f.numero_nf LIMIT 5001`, [hoje]),
          rodarSql(req, q, de, ate, `SELECT COUNT(*) FILTER (WHERE f.frete_por_conta_cliente)::int AS fob, COUNT(*) FILTER (WHERE f.carga_direta)::int AS direta
            FROM fretes f WHERE ${BASE} AND f.data_emissao_nf BETWEEN $1::date AND $2::date AND NOT ${TEM_CTE}{F}`),
        ]);
        const linhas = rows.slice(0, 5000).map((r) => ({ ...r, destino: destino(r), situacao: r.entrega ? 'Entregue sem CT-e' : r.dias > 3 ? 'Sem CT-e há mais de 3 dias' : 'Aguardando CT-e' }));
        return {
          colunas: [['numero_nf', 'NF'], ['emissao', 'Emissão', 'data'], ['dias', 'Dias', 'num'], ['cliente', 'Cliente'], ['destino', 'Cidade/UF'], ['transportadora', 'Transportadora (da NF-e)'],
            ['situacao', 'Situação', 'categoria'], ['numero_pedido', 'Pedido'], ['numero_mapa', 'Mapa'], ['volumes', 'Volumes', 'num'], ['peso', 'Peso (kg)', 'dec'], ['valor', 'Valor da nota', 'moeda']],
          linhas, mais: rows.length > 5000,
          resumo: [['Notas sem CT-e', linhas.length], ['Valor', linhas.reduce((t, l) => t + (l.valor || 0), 0), 'moeda'], ['Há mais de 3 dias', linhas.filter((l) => l.dias > 3).length],
            ['Entregues sem CT-e', linhas.filter((l) => l.entrega).length], ['Fora da conta: FOB', fora?.fob || 0], ['Fora da conta: carga direta', fora?.direta || 0]],
        };
      } },
    27: { titulo: 'CT-e sem NF-e identificada', grupo: 'Vínculos', tela: 'nfecte', desc: 'CT-e emitidos no período sem a nota no sistema, que citam nota que não foi achada, que não citam chave de NF-e ou cujo destinatário/cidade não bate com a nota ligada (vínculo suspeito).',
      rodar: async (req, q, de, ate) => {
        const rows = await ctesComNotas(req, q, de, ate, { comXml: true });
        const cit = new Map();
        rows.forEach((r) => { const d = lerCte(r); r.d = d; r.chaves = (d?.chaves_nfe_referenciadas || []).map((c) => String(c).replace(/\D/g, '')).filter((c) => c.length === 44); r.chaves.forEach((c) => cit.set(c, false)); });
        if (cit.size) {
          const { rows: achadas } = await consulta(req, 'SELECT chave_nfe FROM fretes WHERE chave_nfe = ANY($1::text[])', [[...cit.keys()]]);
          achadas.forEach((a) => cit.set(a.chave_nfe, true));
        }
        const linhas = [];
        for (const r of rows) {
          if (r.frete_principal_id) continue;
          const citadas = numerosDasChaves(r.chaves);
          const faltam = numerosDasChaves(r.chaves.filter((c) => !cit.get(c)));
          const base = { id: r.nota_id || undefined, data_cte: r.data_cte, numero_cte: r.numero_cte, transportadora: r.transportadora, frete: r.frete, citadas: citadas.join(', '), ligadas: r.notas || '', cliente: r.cliente || r.d?.destinatario_nome || '', chave_cte: r.chave_cte };
          if (!r.notas) linhas.push({ ...base, situacao: citadas.length ? 'Nota não está no sistema' : 'Sem nota e sem chave citada', detalhe: citadas.length ? `Cita a NF ${citadas.join(', ')}; envie o XML da nota` : 'O CT-e não cita a chave de nenhuma NF-e' });
          else if (faltam.length) linhas.push({ ...base, situacao: 'Nota citada não encontrada', detalhe: `Cita também a NF ${faltam.join(', ')}, que não está no sistema` });
          else if (r.d && !r.chaves.length) linhas.push({ ...base, situacao: 'CT-e não cita chave de NF-e', detalhe: 'Ligado pela NF ou pelo pedido; confira se é a nota certa' });
          else if (r.d) {
            const notas = [{ cliente_documento: (r.docs || '').split(',')[0], cidade: r.cidade_nota, uf: r.uf_nota, cidade_redespacho: r.cidade_red, valor_faturado: 0, peso_kg: 0 }];
            const susp = conferir(r.d, notas, { vinculo: r.vinculo_cte }).filter((p) => p.suspeito);
            if (susp.length) linhas.push({ ...base, situacao: 'Vínculo suspeito', detalhe: susp.map((p) => p.texto).join(' · ') });
          }
          if (linhas.length >= 5000) break;
        }
        const conta = (s) => linhas.filter((l) => l.situacao === s).length;
        return {
          colunas: [['data_cte', 'Emissão CT-e', 'data'], ['numero_cte', 'CT-e'], ['transportadora', 'Transportadora'], ['situacao', 'Situação', 'categoria'], ['citadas', 'NF citadas no CT-e'],
            ['ligadas', 'NF ligadas no sistema'], ['cliente', 'Destinatário'], ['detalhe', 'Detalhe'], ['frete', 'Frete', 'moeda'], ['chave_cte', 'Chave do CT-e', 'chave']],
          linhas, mais: rows.length > 5000,
          resumo: [['CT-e com problema', linhas.length], ['Nota não está no sistema', conta('Nota não está no sistema') + conta('Sem nota e sem chave citada')],
            ['Nota citada não encontrada', conta('Nota citada não encontrada')], ['Não cita chave', conta('CT-e não cita chave de NF-e')], ['Vínculo suspeito', conta('Vínculo suspeito')]],
        };
      } },
    28: { titulo: 'Conferência de valores NF-e', grupo: 'Conferência', tela: 'nfecte', desc: 'CT-e emitidos no período com nota: valor da mercadoria e peso do CT-e × soma das notas, e frete cobrado × frete pela tabela (mesmas tolerâncias da conferência NF-e × CT-e).',
      rodar: async (req, q, de, ate) => {
        const rows = await ctesComNotas(req, q, de, ate, { comXml: true, semComplementar: true });
        const linhas = rows.filter((r) => r.notas && !r.frete_principal_id).slice(0, 5000).map((r) => {
          const d = lerCte(r);
          const probs = [];
          const fora = (a, b, abs, pct) => a != null && b != null && b > 0 && a > 0 && Math.abs(a - b) > Math.max(abs, (Math.abs(b) * pct) / 100);
          if (fora(d?.valor_carga, r.valor_notas, 1, 0.5)) probs.push('Valor diferente');
          if (fora(d?.peso_kg, r.peso_notas, 1, 5)) probs.push('Peso diferente');
          if (r.devido != null && r.frete != null && r.frete - r.devido > Math.max(1, r.devido * 0.005)) probs.push('Frete acima da tabela');
          return { id: r.nota_id, data_cte: r.data_cte, numero_cte: r.numero_cte, notas: r.notas, transportadora: r.transportadora, valor_notas: r.valor_notas, valor_cte: d?.valor_carga ?? null,
            dif_valor: d?.valor_carga != null && r.valor_notas != null ? r2(d.valor_carga - r.valor_notas) : null, peso_notas: r.peso_notas, peso_cte: d?.peso_kg ?? null,
            frete: r.frete, devido: r.devido, dif_frete: r.devido != null && r.frete != null ? r2(r.frete - r.devido) : null, pct_frete: div(r.frete, r.valor_notas),
            conferencia: probs.length ? probs.join(' · ') : d ? 'Confere' : 'Sem XML do CT-e' };
        });
        const conta = (s) => linhas.filter((l) => l.conferencia.includes(s)).length;
        return {
          colunas: [['data_cte', 'Emissão CT-e', 'data'], ['numero_cte', 'CT-e'], ['notas', 'NF-e'], ['transportadora', 'Transportadora'], ['conferencia', 'Conferência', 'confere'],
            ['valor_notas', 'Valor das notas', 'moeda'], ['valor_cte', 'Valor no CT-e', 'moeda'], ['dif_valor', 'Diferença', 'moeda'], ['peso_notas', 'Peso das notas', 'dec'], ['peso_cte', 'Peso no CT-e', 'dec'],
            ['frete', 'Frete cobrado', 'moeda'], ['devido', 'Frete pela tabela', 'moeda'], ['dif_frete', 'Diferença do frete', 'moeda'], ['pct_frete', 'Frete / valor', 'pct']],
          linhas, mais: rows.length > 5000,
          resumo: [['CT-e conferidos', linhas.length], ['Conferem', conta('Confere')], ['Valor diferente', conta('Valor diferente')], ['Peso diferente', conta('Peso diferente')],
            ['Frete acima da tabela', conta('Frete acima da tabela')], ['Cobrado a mais', linhas.reduce((t, l) => t + Math.max(0, l.dif_frete || 0), 0), 'moeda']],
        };
      } },
    29: { titulo: 'NF-e por transportadora', grupo: 'Por grupo', tela: 'nfecte', desc: 'Notas emitidas no período por transportadora (a do CT-e; sem CT-e, a da nota): quantidade, valor, peso, volumes, com e sem CT-e e o frete.',
      rodar: (req, q, de, ate) => notasAgrupadas(req, q, de, ate, TRANSP_NF, 'Transportadora') },
    30: { titulo: 'NF-e por destinatário', grupo: 'Por grupo', tela: 'nfecte', desc: 'Notas emitidas no período por cliente (destinatário), com o CNPJ, entregues, com e sem CT-e e o frete.',
      rodar: (req, q, de, ate) => notasAgrupadas(req, q, de, ate, 'f.cliente', 'Destinatário', { sql: 'MIN(f.cliente_documento)', rotulo: 'CNPJ/CPF' }) },
    31: { titulo: 'NF-e por rota', grupo: 'Por grupo', tela: 'nfecte', desc: 'Notas emitidas no período por região e estado de destino (a rota da entrega), com as cidades atendidas e o frete.',
      rodar: (req, q, de, ate) => notasAgrupadas(req, q, de, ate, `${REGIAO_SQL} || ' › ' || COALESCE(UPPER(f.uf), '—')`, 'Região › UF') },
    32: { titulo: 'NF-e por período', grupo: 'Por grupo', tela: 'nfecte', desc: 'Dia a dia (ou mês a mês, em períodos de mais de 62 dias): notas emitidas, expedidas (saída/coleta), com CT-e emitido e entregues.',
      rodar: async (req, q, de, ate) => {
        const mes = (Date.parse(ate) - Date.parse(de)) / 86400000 > 62;
        const fmt = mes ? 'YYYY-MM' : 'YYYY-MM-DD';
        const partes = await Promise.all([
          ['emitidas', 'f.data_emissao_nf', 'COALESCE(SUM(f.valor_faturado), 0)::float'],
          ['expedidas', 'COALESCE(f.data_saida, f.data_coleta)', 'COALESCE(SUM(f.valor_faturado), 0)::float'],
          ['transportadas', 'COALESCE(f.data_emissao_cte, (SELECT c.data_emissao_cte FROM fretes c WHERE c.id = f.cte_coberto_por))', `COALESCE(SUM(${FRETE_NOTA}), 0)::float`],
          ['entregues', 'f.data_entrega', 'COALESCE(SUM(f.valor_faturado), 0)::float'],
        ].map(async ([k, data, soma]) => [k, await rodarSql(req, q, de, ate, `SELECT to_char(${data}, '${fmt}') AS p, COUNT(*)::int AS n, ${soma} AS v
            FROM fretes f WHERE ${BASE} AND ${data} BETWEEN $1::date AND $2::date{F} GROUP BY 1`)]));
        const mapa = new Map();
        for (const [k, rows] of partes) for (const r of rows) { const l = mapa.get(r.p) || { periodo: r.p }; l[k] = r.n; l[`${k}_valor`] = r.v; mapa.set(r.p, l); }
        const linhas = [...mapa.values()].sort((a, b) => b.periodo.localeCompare(a.periodo));
        const tot = (k) => linhas.reduce((t, l) => t + (l[k] || 0), 0);
        return {
          colunas: [['periodo', mes ? 'Mês' : 'Dia', mes ? 'mes' : 'data'], ['emitidas', 'Emitidas', 'num'], ['emitidas_valor', 'Valor emitido', 'moeda'], ['expedidas', 'Expedidas', 'num'],
            ['expedidas_valor', 'Valor expedido', 'moeda'], ['transportadas', 'Com CT-e emitido', 'num'], ['transportadas_valor', 'Frete', 'moeda'], ['entregues', 'Entregues', 'num'], ['entregues_valor', 'Valor entregue', 'moeda']],
          linhas, agrupado: true,
          resumo: [['Emitidas', tot('emitidas')], ['Valor emitido', tot('emitidas_valor'), 'moeda'], ['Expedidas', tot('expedidas')], ['Com CT-e emitido', tot('transportadas')], ['Entregues', tot('entregues')]],
        };
      } },
    33: { titulo: 'Chaves de acesso', grupo: 'Documentos', tela: 'nfecte', desc: 'Chave de acesso de cada nota emitida no período e a do CT-e que a leva, com a conferência do dígito verificador. Exporte em Excel ou copie as chaves.',
      rodar: async (req, q, de, ate) => {
        const rows = await rodarSql(req, q, de, ate, `SELECT f.id, f.numero_nf, f.nf_serie, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS emissao, COALESCE(f.emitente_nome, f.emitente_cnpj) AS emitente,
            f.cliente, f.cliente_documento, f.valor_faturado::float AS valor, f.chave_nfe, COALESCE(f.numero_cte, c.numero_cte) AS numero_cte, COALESCE(f.chave_cte, c.chave_cte) AS chave_cte
          FROM fretes f LEFT JOIN fretes c ON c.id = f.cte_coberto_por
          WHERE ${BASE} AND f.data_emissao_nf BETWEEN $1::date AND $2::date{F} ORDER BY f.data_emissao_nf, f.numero_nf LIMIT 10001`);
        const linhas = rows.slice(0, 10000).map((r) => ({ ...r, chave_nfe: r.chave_nfe || '', valida: !r.chave_nfe ? 'Sem chave' : chaveValida(r.chave_nfe) ? 'Válida' : 'Chave inválida' }));
        return {
          colunas: [['numero_nf', 'NF'], ['nf_serie', 'Série'], ['emissao', 'Emissão', 'data'], ['valida', 'Conferência', 'confere'], ['chave_nfe', 'Chave da NF-e', 'chave'],
            ['numero_cte', 'CT-e'], ['chave_cte', 'Chave do CT-e', 'chave'], ['cliente', 'Destinatário'], ['cliente_documento', 'CNPJ/CPF'], ['valor', 'Valor', 'moeda'], ['emitente', 'Emitente']],
          linhas, mais: rows.length > 10000, copiar: { coluna: 'chave_nfe', rotulo: 'Copiar chaves' },
          resumo: [['Notas', linhas.length], ['Com chave válida', linhas.filter((l) => l.valida === 'Válida').length], ['Sem chave', linhas.filter((l) => l.valida === 'Sem chave').length],
            ['Chave inválida', linhas.filter((l) => l.valida === 'Chave inválida').length], ['Com chave do CT-e', linhas.filter((l) => l.chave_cte).length]],
        };
      } },
    34: { titulo: 'Documentos duplicados', grupo: 'Documentos', tela: 'nfecte', desc: 'NF-e repetida (mesmo número e emitente), CT-e repetido (mesmo número e transportadora), nota com mais de um CT-e sem vínculo explicado e nota devolvida e refaturada com CT-e nas duas. Mostra os grupos com algum documento do período.',
      rodar: async (req, q, de, ate) => {
        const [nfs, ctes, doisCte, dupla] = await Promise.all([
          rodarSql(req, q, de, ate, `SELECT 'NF-e repetida' AS tipo, MIN(f.numero_nf) AS numero, MIN(COALESCE(f.emitente_nome, f.emitente_cnpj)) AS emissor, COUNT(*)::int AS qtd,
              STRING_AGG(COALESCE(f.numero_cte, '—'), ', ' ORDER BY f.id) AS ctes, STRING_AGG(COALESCE(f.numero_pedido, '—'), ', ' ORDER BY f.id) AS pedidos, MIN(f.id) AS id,
              MIN(f.cliente) AS cliente, STRING_AGG(to_char(f.data_emissao_nf, 'DD/MM/YYYY'), ', ' ORDER BY f.id) AS datas
            FROM fretes f WHERE ${dup.contaNf('f')} GROUP BY ${dup.chaveNf('f')}
            HAVING COUNT(*) > 1 AND bool_or(f.data_emissao_nf BETWEEN $1::date AND $2::date{F}) LIMIT 2000`),
          rodarSql(req, q, de, ate, `SELECT 'CT-e repetido' AS tipo, MIN(f.numero_cte) AS numero, MIN(f.transportadora_cte) AS emissor, COUNT(*)::int AS qtd,
              STRING_AGG(COALESCE(NULLIF(f.numero_nf, ''), '—'), ', ' ORDER BY f.id) AS nfs, STRING_AGG(COALESCE(f.numero_pedido, '—'), ', ' ORDER BY f.id) AS pedidos, MIN(COALESCE(f.frete_principal_id, f.id)) AS id,
              MIN(f.cliente) AS cliente, STRING_AGG(to_char(f.data_emissao_cte, 'DD/MM/YYYY'), ', ' ORDER BY f.id) AS datas, SUM(f.valor_total_cte)::float AS valor
            FROM fretes f WHERE ${dup.contaCte('f')} GROUP BY ${dup.chaveCte('f')}
            HAVING COUNT(*) > 1 AND bool_or(f.data_emissao_cte BETWEEN $1::date AND $2::date{F}) LIMIT 2000`),
          rodarSql(req, q, de, ate, `SELECT 'Nota com mais de um CT-e' AS tipo, f.numero_nf AS numero, COALESCE(f.transportadora_cte, f.transportadora) AS emissor, 1 + COUNT(c.id)::int AS qtd,
              f.numero_cte || ', ' || STRING_AGG(c.numero_cte, ', ' ORDER BY c.id) AS ctes, f.numero_pedido AS pedidos, f.id, f.cliente,
              to_char(f.data_emissao_nf, 'DD/MM/YYYY') AS datas, (COALESCE(f.valor_total_cte, 0) + SUM(COALESCE(c.valor_total_cte, 0)))::float AS valor
            FROM fretes f JOIN fretes c ON c.frete_principal_id = f.id AND c.vinculo_cte IS NULL AND c.chave_cte IS NOT NULL AND c.cte_cancelado IS NOT TRUE AND c.cte_nao_levou IS NOT TRUE
            WHERE ${BASE} AND f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE AND f.cte_nao_levou IS NOT TRUE AND f.data_emissao_nf BETWEEN $1::date AND $2::date{F}
            GROUP BY f.id, f.numero_nf, f.transportadora_cte, f.transportadora, f.numero_cte, f.numero_pedido, f.cliente, f.data_emissao_nf, f.valor_total_cte LIMIT 2000`),
          rodarSql(req, q, de, ate, `SELECT 'Devolução refaturada com CT-e nas duas' AS tipo, f.numero_nf AS numero, COALESCE(f.transportadora_cte, f.transportadora) AS emissor, 2 AS qtd,
              f.numero_cte AS ctes, f.numero_pedido AS pedidos, f.id, f.cliente, to_char(f.data_emissao_nf, 'DD/MM/YYYY') AS datas, f.valor_total_cte::float AS valor
            FROM fretes f WHERE f.alerta_cobranca_dupla AND COALESCE(f.status, '') <> 'Cancelado' AND f.data_emissao_nf BETWEEN $1::date AND $2::date{F} LIMIT 2000`),
        ]);
        const linhas = [...nfs, ...ctes, ...doisCte, ...dupla];
        const conta = (t) => linhas.filter((l) => l.tipo === t).length;
        return {
          colunas: [['tipo', 'Tipo', 'categoria'], ['numero', 'Número'], ['emissor', 'Emitente / transportadora'], ['qtd', 'Registros', 'num'], ['cliente', 'Destinatário'],
            ['nfs', 'NF-e'], ['ctes', 'CT-e'], ['pedidos', 'Pedidos'], ['datas', 'Datas'], ['valor', 'Frete', 'moeda']],
          linhas,
          resumo: [['Grupos', linhas.length], ['NF-e repetida', conta('NF-e repetida')], ['CT-e repetido', conta('CT-e repetido')], ['Nota com mais de um CT-e', conta('Nota com mais de um CT-e')],
            ['Devolução refaturada', conta('Devolução refaturada com CT-e nas duas')]],
        };
      } },
  };
};
