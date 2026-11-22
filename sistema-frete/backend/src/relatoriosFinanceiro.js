// Relatórios financeiros dos fretes contratados (tela 329, embarcador): os números 51 a 60 da lista da empresa.
// Montado por src/relatoriosEntregas.js (mesmos filtros, totalizador, gráfico e drill-down).
//  - CT-e que conta: o mesmo critério dos Indicadores (sem cancelados, "não levou", reprovados, cancelados/não cobrados).
//    Valor a pagar do CT-e = valor do CT-e (ou o negociado, enquanto ele não chega) − glosa.
//  - Fatura: a que a transportadora mandou (faturas_frete): conferida → aprovada → liberada → paga, com vencimento,
//    glosas e o pagamento (src/faturasFrete.js; valor a pagar = o informado na fatura ou CT-e − glosas).
//  - Situação do CT-e: pago (fatura paga), faturado (na fatura, a pagar), liberado, em conferência ou retido.
//  - Frete da nota (59 e 60): o rateado do CT-e de várias notas ou o do próprio CT-e, mais os CT-e a mais (reentrega...).
// 51, 53, 55 e 56 mostram a situação de hoje (o período não vale); os demais usam o período.
const { vePotudo } = require('./permissoes');

module.exports = function criar(h) {
  const { consulta, filtros, hojeSP, listaNotas, notasDoPeriodo, EMITIDAS } = h;
  const r2 = (v) => (v == null ? null : Math.round(Number(v) * 100) / 100);
  const div = (a, b) => (b ? a / b : null);
  const soma = (ls, k) => ls.reduce((t, l) => t + (Number(l[k]) || 0), 0);
  const TRANSP = 'COALESCE(f.transportadora_cte, f.transportadora)';
  const VALOR = 'COALESCE(f.valor_total_cte, f.valor_frete_negociado, 0)';
  const CONTA = `f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE AND f.cte_nao_levou IS NOT TRUE AND COALESCE(f.status_aprovacao, '') <> 'Rejeitado'
    AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')`;
  const SITUACAO = `CASE WHEN ff.pago_em IS NOT NULL THEN 'Pago' WHEN f.fatura_id IS NOT NULL OR f.status = 'Faturado' THEN 'Faturado (a pagar)'
    WHEN f.status = 'Frete Retido' THEN 'Retido na auditoria' WHEN f.status IN ('Liberado p/ Pagamento', 'Conferido') OR f.status_aprovacao = 'Aprovado' THEN 'Liberado (sem fatura)' ELSE 'Em conferência' END`;
  const SIT_FATURA = { conferida: 'Conferida', bloqueada: 'Bloqueada', aprovada: 'Aprovada', liberada: 'Liberada p/ pagamento', paga: 'Paga' };
  const A_PAGAR = 'COALESCE(ff.valor_informado, ff.valor_ctes - COALESCE(ff.total_glosas, 0))';
  const FRETE_NOTA = `COALESCE(f.frete_rateado, CASE WHEN f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE THEN ${VALOR} END, 0)
    + COALESCE((SELECT SUM(c.valor_total_cte) FROM fretes c WHERE c.frete_principal_id = f.id AND c.chave_cte IS NOT NULL AND c.cte_cancelado IS NOT TRUE AND c.cte_nao_levou IS NOT TRUE), 0)`;
  const dias = (a, b) => (a && b ? Math.round((Date.parse(`${String(b).slice(0, 10)}T12:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T12:00:00Z`)) / 86400000) : null);

  // CT-e (fretes contratados) com a fatura de cada um. onde usa $1/$2 se precisar do período.
  async function ctes(req, q, onde, params) {
    const p = [...params]; const extra = filtros(q, p);
    const { rows } = await consulta(req, `SELECT f.id, COALESCE(f.frete_principal_id, f.id) AS nota_id, f.numero_cte, to_char(f.data_emissao_cte, 'YYYY-MM-DD') AS emissao_cte,
        COALESCE(NULLIF(f.numero_nf, ''), (SELECT p.numero_nf FROM fretes p WHERE p.id = f.frete_principal_id)) AS nf, f.cliente, ${TRANSP} AS transportadora,
        ${VALOR}::float AS valor, COALESCE(f.glosa_valor, 0)::float AS glosa, (${VALOR} - COALESCE(f.glosa_valor, 0))::float AS a_pagar, ${SITUACAO} AS situacao,
        ff.id AS fatura_id, ff.numero AS fatura, to_char(ff.data_vencimento, 'YYYY-MM-DD') AS vencimento, to_char(ff.pago_em, 'YYYY-MM-DD') AS pago_em, f.vinculo_cte
      FROM fretes f LEFT JOIN faturas_frete ff ON ff.id = f.fatura_id
      WHERE ${CONTA} AND ${onde}${extra} ORDER BY ff.data_vencimento NULLS LAST, f.data_emissao_cte, f.numero_cte LIMIT 5001`, p);
    const hoje = hojeSP();
    return { linhas: rows.slice(0, 5000).map((r) => ({ ...r, id: r.nota_id, dias_vencer: r.vencimento && !r.pago_em ? dias(hoje, r.vencimento) : null })), mais: rows.length > 5000 };
  }
  const COL_CTE = [['emissao_cte', 'Emissão CT-e', 'data'], ['numero_cte', 'CT-e'], ['nf', 'NF'], ['transportadora', 'Transportadora'], ['cliente', 'Cliente'],
    ['valor', 'Valor do CT-e', 'moeda'], ['glosa', 'Glosa', 'moeda'], ['a_pagar', 'A pagar', 'moeda'], ['situacao', 'Situação', 'financeiro'], ['fatura', 'Fatura'],
    ['vencimento', 'Vencimento', 'data'], ['dias_vencer', 'Dias p/ vencer', 'num']];
  const ctesDaFatura = async (req, q, de, ate, valor) => {
    const { linhas, mais } = await ctes(req, { ...q, status: '' }, 'f.fatura_id = $1', [Number(valor) || 0]);
    return { colunas: COL_CTE, linhas, mais, resumo: [['CT-e', linhas.length], ['Valor', soma(linhas, 'valor'), 'moeda'], ['Glosas', soma(linhas, 'glosa'), 'moeda'], ['A pagar', soma(linhas, 'a_pagar'), 'moeda']] };
  };

  // Faturas das transportadoras. Com filtro (ou usuário que só vê um cliente), só as que têm CT-e que passa no filtro.
  async function faturas(req, q, onde, params) {
    const p = [...params]; const extra = filtros(q, p);
    const restringe = extra || !vePotudo(req);
    const transp = String(q.transportadora || '').trim();
    if (transp) p.push(`%${transp}%`);
    const { rows } = await consulta(req, `SELECT ff.id, ff.numero, ff.transportadora, to_char(ff.data_emissao, 'YYYY-MM-DD') AS emissao, to_char(ff.data_vencimento, 'YYYY-MM-DD') AS vencimento,
        to_char(ff.pago_em, 'YYYY-MM-DD') AS pago_em, ff.valor_pago::float AS valor_pago, ff.valor_informado::float AS valor_informado, ff.valor_ctes::float AS valor_ctes, ff.qtd_ctes,
        COALESCE(ff.total_glosas, 0)::float AS glosas, ${A_PAGAR}::float AS a_pagar, ff.situacao, ff.bloqueio_motivo, ff.pago_por, ff.conferido_em
      FROM faturas_frete ff
      WHERE ${onde}${restringe ? ` AND EXISTS (SELECT 1 FROM fretes f WHERE f.fatura_id = ff.id${extra})` : ''}${transp ? ` AND ff.transportadora ILIKE $${p.length}` : ''}
      ORDER BY ff.data_vencimento NULLS LAST, ff.id LIMIT 5001`, p);
    const hoje = hojeSP();
    return { linhas: rows.slice(0, 5000).map((r) => ({ ...r, situacao_txt: SIT_FATURA[r.situacao] || r.situacao || '', dias_vencer: r.vencimento && !r.pago_em ? dias(hoje, r.vencimento) : null,
      atraso_pag: r.pago_em && r.vencimento ? dias(r.vencimento, r.pago_em) : null, dif_pago: r.pago_em ? r2((r.valor_pago || 0) - r.a_pagar) : null })), mais: rows.length > 5000 };
  }
  const COL_FAT = [['numero', 'Fatura'], ['transportadora', 'Transportadora'], ['emissao', 'Emissão', 'data'], ['vencimento', 'Vencimento', 'data'], ['qtd_ctes', 'CT-e', 'num'],
    ['valor_ctes', 'Valor dos CT-e', 'moeda'], ['glosas', 'Glosas', 'moeda'], ['a_pagar', 'A pagar', 'moeda']];
  const fatDrill = { drill: 'numero', drillValor: 'id' };
  const fatLista = { abrir: 'fatura' };

  return {
    51: { titulo: 'Fretes a pagar', grupo: 'Contas a pagar', tela: 'financeiro', semPeriodo: true, desc: 'Hoje: todos os CT-e ainda não pagos — em conferência, retidos na auditoria, liberados sem fatura e faturados a pagar — com o valor a pagar (CT-e − glosa), a fatura e o vencimento.',
      rodar: async (req, q) => {
        const { linhas, mais } = await ctes(req, q, 'ff.pago_em IS NULL', []);
        const por = (s) => linhas.filter((l) => l.situacao === s);
        return { colunas: COL_CTE, linhas, mais,
          resumo: [['CT-e a pagar', linhas.length], ['A pagar', soma(linhas, 'a_pagar'), 'moeda'], ['Faturado (a pagar)', soma(por('Faturado (a pagar)'), 'a_pagar'), 'moeda'],
            ['Liberado sem fatura', soma(por('Liberado (sem fatura)'), 'a_pagar'), 'moeda'], ['Em conferência', soma(por('Em conferência'), 'a_pagar'), 'moeda'], ['Retido', soma(por('Retido na auditoria'), 'a_pagar'), 'moeda']] };
      } },
    52: { titulo: 'Fretes pagos', grupo: 'Pagamentos', tela: 'financeiro', ...fatDrill, detalhe: ctesDaFatura, desc: 'Histórico de pagamentos: faturas pagas no período (data do pagamento), com o valor a pagar × o pago, quem pagou e quantos dias antes ou depois do vencimento. Clique na fatura para ver os CT-e.',
      rodar: async (req, q, de, ate) => {
        const { linhas, mais } = await faturas(req, q, 'ff.pago_em BETWEEN $1::date AND $2::date', [de, ate]);
        linhas.sort((a, b) => String(b.pago_em).localeCompare(String(a.pago_em)));
        return { colunas: [...COL_FAT, ['pago_em', 'Pago em', 'data'], ['valor_pago', 'Valor pago', 'moeda'], ['dif_pago', 'Pago − a pagar', 'difcusto'], ['atraso_pag', 'Dias após o vencimento', 'num'], ['pago_por', 'Pago por']],
          linhas, mais, agrupado: true,
          resumo: [['Faturas pagas', linhas.length], ['Valor pago', soma(linhas, 'valor_pago'), 'moeda'], ['CT-e', soma(linhas, 'qtd_ctes')], ['Pagas em atraso', linhas.filter((l) => l.atraso_pag > 0).length],
            ['Glosas abatidas', soma(linhas, 'glosas'), 'moeda']] };
      } },
    53: { titulo: 'Fretes vencidos', grupo: 'Contas a pagar', tela: 'financeiro', semPeriodo: true, ...fatDrill, detalhe: ctesDaFatura, desc: 'Hoje: faturas não pagas com o vencimento passado e CT-e que a transportadora ainda não faturou há mais de 30 dias. Clique na fatura para ver os CT-e.',
      rodar: async (req, q) => {
        const hoje = hojeSP();
        const [{ linhas: fats }, { linhas: semFat }] = await Promise.all([
          faturas(req, q, 'ff.pago_em IS NULL AND ff.data_vencimento < $1::date', [hoje]),
          ctes(req, q, "f.fatura_id IS NULL AND COALESCE(f.status, 'Pendente') <> 'Faturado' AND f.data_emissao_cte < $1::date - 30", [hoje]),
        ]);
        const linhas = [
          ...fats.map((f) => ({ ...f, tipo: 'Fatura vencida', dias_atraso: -f.dias_vencer, documento: f.numero })),
          ...semFat.map((c) => ({ id: undefined, tipo: 'CT-e sem fatura há +30 dias', numero: `CT-e ${c.numero_cte}`, transportadora: c.transportadora, emissao: c.emissao_cte, vencimento: null,
            qtd_ctes: 1, valor_ctes: c.valor, glosas: c.glosa, a_pagar: c.a_pagar, dias_atraso: dias(c.emissao_cte, hoje), situacao_txt: c.situacao })),
        ];
        return { colunas: [['tipo', 'Tipo', 'categoria'], ...COL_FAT, ['dias_atraso', 'Dias (atraso / sem fatura)', 'num'], ['situacao_txt', 'Situação']], linhas, agrupado: true,
          resumo: [['Faturas vencidas', fats.length], ['Valor vencido', soma(fats, 'a_pagar'), 'moeda'], ['CT-e sem fatura (+30 dias)', semFat.length], ['Valor sem fatura', soma(semFat, 'a_pagar'), 'moeda'],
            ['Maior atraso (dias)', fats.length ? Math.max(...fats.map((f) => -f.dias_vencer)) : null]] };
      } },
    54: { titulo: 'Faturas por transportadora', grupo: 'Faturas', tela: 'financeiro', desc: 'Faturas emitidas no período, por transportadora: quantas, CT-e, valor cobrado, glosas, a pagar, pago, em aberto e vencido. Clique na transportadora para ver as faturas.',
      detalhe: async (req, q, de, ate, valor) => {
        const { linhas, mais } = await faturas(req, q, 'ff.data_emissao BETWEEN $1::date AND $2::date AND COALESCE(ff.transportadora, \'\') = $3', [de, ate, valor]);
        return { colunas: [...COL_FAT, ['situacao_txt', 'Situação', 'financeiro'], ['pago_em', 'Pago em', 'data']], linhas, mais, ...fatLista,
          resumo: [['Faturas', linhas.length], ['A pagar', soma(linhas, 'a_pagar'), 'moeda'], ['Pago', soma(linhas, 'valor_pago'), 'moeda']] };
      },
      rodar: async (req, q, de, ate) => {
        const { linhas: fs } = await faturas(req, q, 'ff.data_emissao BETWEEN $1::date AND $2::date', [de, ate]);
        const m = new Map();
        for (const f of fs) {
          const g = m.get(f.transportadora) || { grupo: f.transportadora || '(sem transportadora)', faturas: 0, ctes: 0, cobrado: 0, glosas: 0, a_pagar: 0, pago: 0, aberto: 0, vencido: 0, bloqueadas: 0 };
          g.faturas += 1; g.ctes += f.qtd_ctes || 0; g.cobrado += f.valor_informado ?? f.valor_ctes ?? 0; g.glosas += f.glosas; g.a_pagar += f.a_pagar;
          if (f.pago_em) g.pago += f.valor_pago || 0; else { g.aberto += f.a_pagar; if (f.dias_vencer != null && f.dias_vencer < 0) g.vencido += f.a_pagar; }
          if (f.situacao === 'bloqueada') g.bloqueadas += 1;
          m.set(f.transportadora, g);
        }
        const linhas = [...m.values()].map((g) => ({ ...g, cobrado: r2(g.cobrado), glosas: r2(g.glosas), a_pagar: r2(g.a_pagar), pago: r2(g.pago), aberto: r2(g.aberto), vencido: r2(g.vencido) })).sort((a, b) => b.a_pagar - a.a_pagar);
        return { colunas: [['grupo', 'Transportadora'], ['faturas', 'Faturas', 'num'], ['ctes', 'CT-e', 'num'], ['cobrado', 'Cobrado', 'moeda'], ['glosas', 'Glosas', 'moeda'], ['a_pagar', 'A pagar', 'moeda'],
          ['pago', 'Pago', 'moeda'], ['aberto', 'Em aberto', 'moeda'], ['vencido', 'Vencido', 'moeda'], ['bloqueadas', 'Bloqueadas', 'num']], linhas, agrupado: true,
          resumo: [['Transportadoras', linhas.length], ['Faturas', soma(linhas, 'faturas')], ['A pagar', soma(linhas, 'a_pagar'), 'moeda'], ['Pago', soma(linhas, 'pago'), 'moeda'], ['Em aberto', soma(linhas, 'aberto'), 'moeda'], ['Vencido', soma(linhas, 'vencido'), 'moeda']] };
      } },
    55: { titulo: 'Faturas pendentes', grupo: 'Faturas', tela: 'financeiro', semPeriodo: true, ...fatDrill, detalhe: ctesDaFatura, desc: 'Hoje: as faturas de frete ainda não pagas (as contas a pagar do frete), com a situação (conferida, bloqueada, aprovada, liberada), o vencimento e o motivo do bloqueio. Clique na fatura para ver os CT-e.',
      rodar: async (req, q) => {
        const { linhas, mais } = await faturas(req, q, 'ff.pago_em IS NULL', []);
        const por = (s) => linhas.filter((l) => l.situacao === s);
        return { colunas: [...COL_FAT, ['situacao_txt', 'Situação', 'financeiro'], ['dias_vencer', 'Dias p/ vencer', 'num'], ['bloqueio_motivo', 'Motivo do bloqueio']], linhas, mais, agrupado: true,
          resumo: [['Faturas pendentes', linhas.length], ['A pagar', soma(linhas, 'a_pagar'), 'moeda'], ['Liberadas', soma(por('liberada'), 'a_pagar'), 'moeda'], ['Aprovadas', soma(por('aprovada'), 'a_pagar'), 'moeda'],
            ['Conferidas', soma(por('conferida'), 'a_pagar'), 'moeda'], ['Bloqueadas', por('bloqueada').length]] };
      } },
    56: { titulo: 'Previsão de pagamento', grupo: 'Contas a pagar', tela: 'financeiro', semPeriodo: true, drill: 'data', desc: 'Hoje: o que vence em cada dia (faturas não pagas), das vencidas aos próximos 60 dias, com o acumulado; mais os CT-e liberados ainda sem fatura (a faturar). Clique no dia para ver as faturas.',
      detalhe: async (req, q, de, ate, valor) => {
        const hoje = hojeSP();
        const onde = valor === 'vencidas' ? ['ff.pago_em IS NULL AND ff.data_vencimento < $1::date', [hoje]] : valor === 'sem' ? ['ff.pago_em IS NULL AND ff.data_vencimento IS NULL', []]
          : ['ff.pago_em IS NULL AND ff.data_vencimento = $1::date', [valor]];
        const { linhas, mais } = await faturas(req, q, onde[0], onde[1]);
        return { colunas: [...COL_FAT, ['situacao_txt', 'Situação', 'financeiro']], linhas, mais, ...fatLista, resumo: [['Faturas', linhas.length], ['A pagar', soma(linhas, 'a_pagar'), 'moeda']] };
      },
      rodar: async (req, q) => {
        const hoje = hojeSP();
        const [{ linhas: fs }, { linhas: semFat }] = await Promise.all([faturas(req, q, 'ff.pago_em IS NULL', []),
          ctes(req, q, "f.fatura_id IS NULL AND COALESCE(f.status, 'Pendente') <> 'Faturado' AND (f.status IN ('Liberado p/ Pagamento', 'Conferido') OR f.status_aprovacao = 'Aprovado')", [])]);
        const m = new Map();
        const add = (k, rot, f) => { const g = m.get(k) || { data: k, rotulo: rot, faturas: 0, valor: 0, transps: new Set() }; g.faturas += 1; g.valor += f.a_pagar; g.transps.add(f.transportadora); m.set(k, g); };
        for (const f of fs) {
          if (!f.vencimento) add('sem', 'Sem vencimento', f);
          else if (f.vencimento < hoje) add('vencidas', 'Vencidas', f);
          else if (dias(hoje, f.vencimento) <= 60) add(f.vencimento, null, f);
          else add('depois', 'Depois de 60 dias', f);
        }
        const ordemK = (k) => (k === 'vencidas' ? '0' : k === 'sem' ? '9' : k === 'depois' ? '8' : `1${k}`);
        let acum = 0;
        const linhas = [...m.values()].sort((a, b) => ordemK(a.data).localeCompare(ordemK(b.data))).map((g) => {
          acum += g.valor;
          const d = /^\d{4}/.test(g.data) ? g.data : null;
          return { data: g.data, quando: g.rotulo || `${d.split('-').reverse().join('/')} · ${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(`${d}T12:00:00Z`).getUTCDay()]}`,
            dias: d ? dias(hoje, d) : null, faturas: g.faturas, transportadoras: g.transps.size, valor: r2(g.valor), acumulado: r2(acum) };
        });
        return { colunas: [['quando', 'Vencimento'], ['dias', 'Dias', 'num'], ['faturas', 'Faturas', 'num'], ['transportadoras', 'Transportadoras', 'num'], ['valor', 'A pagar', 'moeda'], ['acumulado', 'Acumulado', 'moeda']],
          linhas, agrupado: true, drillRotulo: 'quando',
          resumo: [['Vencidas', soma(linhas.filter((l) => l.data === 'vencidas'), 'valor'), 'moeda'], ['Próximos 7 dias', soma(linhas.filter((l) => l.dias != null && l.dias <= 7), 'valor'), 'moeda'],
            ['Próximos 30 dias', soma(linhas.filter((l) => l.dias != null && l.dias <= 30), 'valor'), 'moeda'], ['Total a pagar', soma(linhas, 'valor'), 'moeda'],
            ['A faturar (CT-e liberados sem fatura)', soma(semFat, 'a_pagar'), 'moeda']] };
      } },
    57: { titulo: 'Pagamentos por período', grupo: 'Pagamentos', tela: 'financeiro', drill: 'periodo', desc: 'Pagamentos realizados dia a dia (mês a mês em períodos de mais de 62 dias): faturas pagas, CT-e, valor pago e transportadoras. Clique no dia ou mês para ver as faturas.',
      detalhe: async (req, q, de, ate, valor) => {
        const { linhas, mais } = await faturas(req, q, `to_char(ff.pago_em, '${valor.length > 7 ? 'YYYY-MM-DD' : 'YYYY-MM'}') = $1`, [valor]);
        return { colunas: [...COL_FAT, ['pago_em', 'Pago em', 'data'], ['valor_pago', 'Valor pago', 'moeda']], linhas, mais, ...fatLista, resumo: [['Faturas', linhas.length], ['Valor pago', soma(linhas, 'valor_pago'), 'moeda']] };
      },
      rodar: async (req, q, de, ate) => {
        const mes = (Date.parse(ate) - Date.parse(de)) / 86400000 > 62;
        const { linhas: fs } = await faturas(req, q, 'ff.pago_em BETWEEN $1::date AND $2::date', [de, ate]);
        const m = new Map();
        for (const f of fs) {
          const k = mes ? f.pago_em.slice(0, 7) : f.pago_em;
          const g = m.get(k) || { periodo: k, faturas: 0, ctes: 0, pago: 0, glosas: 0, transps: new Set() };
          g.faturas += 1; g.ctes += f.qtd_ctes || 0; g.pago += f.valor_pago || 0; g.glosas += f.glosas; g.transps.add(f.transportadora); m.set(k, g);
        }
        const linhas = [...m.values()].map((g) => ({ ...g, transportadoras: g.transps.size, pago: r2(g.pago), glosas: r2(g.glosas), transps: undefined })).sort((a, b) => b.periodo.localeCompare(a.periodo));
        return { colunas: [['periodo', mes ? 'Mês' : 'Dia', mes ? 'mes' : 'data'], ['faturas', 'Faturas pagas', 'num'], ['ctes', 'CT-e', 'num'], ['transportadoras', 'Transportadoras', 'num'], ['pago', 'Valor pago', 'moeda'], ['glosas', 'Glosas abatidas', 'moeda']],
          linhas, agrupado: true, resumo: [['Faturas pagas', soma(linhas, 'faturas')], ['Valor pago', soma(linhas, 'pago'), 'moeda'], ['Glosas abatidas', soma(linhas, 'glosas'), 'moeda'], ['Média por dia com pagamento', div(soma(linhas, 'pago'), linhas.length), 'moeda']] };
      } },
    58: { titulo: 'Despesas de transporte', grupo: 'Custos', tela: 'financeiro', desc: 'Total gasto com transporte no período (CT-e pela data de emissão), por tipo: frete de entrega, reentrega, devolução, redespacho, complementar e outros, com as glosas e a participação de cada um. Clique no tipo para ver os CT-e.',
      detalhe: async (req, q, de, ate, valor) => {
        const { linhas, mais } = await ctes(req, q, `f.data_emissao_cte BETWEEN $1::date AND $2::date AND (${TIPO_DESPESA}) = $3`, [de, ate, valor]);
        return { colunas: COL_CTE, linhas, mais, resumo: [['CT-e', linhas.length], ['Valor', soma(linhas, 'valor'), 'moeda'], ['Glosas', soma(linhas, 'glosa'), 'moeda'], ['Líquido', soma(linhas, 'a_pagar'), 'moeda']] };
      },
      rodar: async (req, q, de, ate) => {
        const p = [de, ate]; const extra = filtros(q, p);
        const { rows } = await consulta(req, `SELECT ${TIPO_DESPESA} AS grupo, COUNT(*)::int AS ctes, COALESCE(SUM(${VALOR}), 0)::float AS valor, COALESCE(SUM(f.glosa_valor), 0)::float AS glosas,
            COUNT(DISTINCT ${TRANSP})::int AS transportadoras
          FROM fretes f WHERE ${CONTA} AND f.data_emissao_cte BETWEEN $1::date AND $2::date${extra} GROUP BY 1 ORDER BY 3 DESC`, p);
        const total = rows.reduce((t, r) => t + r.valor - r.glosas, 0);
        const linhas = rows.map((r) => ({ ...r, liquido: r2(r.valor - r.glosas), pct: div(r.valor - r.glosas, total), medio: r2(div(r.valor, r.ctes)) }));
        return { colunas: [['grupo', 'Tipo de despesa'], ['ctes', 'CT-e', 'num'], ['transportadoras', 'Transportadoras', 'num'], ['valor', 'Valor dos CT-e', 'moeda'], ['glosas', 'Glosas', 'moeda'],
          ['liquido', 'Despesa líquida', 'moeda'], ['pct', 'Participação', 'pct'], ['medio', 'Valor médio por CT-e', 'moeda']], linhas, agrupado: true,
          resumo: [['Despesa de transporte', total, 'moeda'], ['CT-e', soma(linhas, 'ctes')], ['Glosas', soma(linhas, 'glosas'), 'moeda'],
            ['Reentregas e devoluções', soma(linhas.filter((l) => /Reentrega|Devolução/.test(l.grupo)), 'liquido'), 'moeda']] };
      } },
    59: { titulo: 'Custo de frete por faturamento', grupo: 'Custos', tela: 'financeiro', drill: 'periodo', desc: 'Mês a mês (dia a dia em períodos de até 62 dias): o faturamento das notas de venda (o mesmo do Faturamento do dia) e o frete dessas notas (com reentregas), e o percentual de frete sobre as vendas. Clique no mês ou dia para ver as notas.',
      detalhe: (req, q, de, ate, valor) => notasDoPeriodo('f.data_emissao_nf')(req, { ...q }, de, ate, valor),
      rodar: async (req, q, de, ate) => {
        const mes = (Date.parse(ate) - Date.parse(de)) / 86400000 > 62;
        const p = [de, ate]; const extra = filtros(q, p);
        const { rows } = await consulta(req, `SELECT to_char(f.data_emissao_nf, '${mes ? 'YYYY-MM' : 'YYYY-MM-DD'}') AS periodo, COUNT(*)::int AS notas, COALESCE(SUM(f.valor_faturado), 0)::float AS vendas,
            COALESCE(SUM(${FRETE_NOTA}), 0)::float AS frete, COUNT(*) FILTER (WHERE f.chave_cte IS NULL AND f.cte_coberto_por IS NULL)::int AS sem_cte
          FROM fretes f WHERE f.frete_principal_id IS NULL AND COALESCE(f.numero_nf, '') <> '' AND f.nf_cancelada IS NOT TRUE AND f.nf_denegada IS NOT TRUE AND f.nf_operacao = 'venda'
            AND ${EMITIDAS}${extra} GROUP BY 1 ORDER BY 1 DESC`, p);
        const linhas = rows.map((r) => ({ ...r, frete: r2(r.frete), pct: div(r.frete, r.vendas), por_nota: r2(div(r.frete, r.notas)) }));
        return { colunas: [['periodo', mes ? 'Mês' : 'Dia', mes ? 'mes' : 'data'], ['notas', 'Notas de venda', 'num'], ['vendas', 'Faturamento (vendas)', 'moeda'], ['frete', 'Frete', 'moeda'],
          ['pct', 'Frete / vendas', 'atraso'], ['por_nota', 'Frete médio por nota', 'moeda'], ['sem_cte', 'Notas ainda sem CT-e', 'num']], linhas, agrupado: true,
          resumo: [['Faturamento (vendas)', soma(linhas, 'vendas'), 'moeda'], ['Frete', soma(linhas, 'frete'), 'moeda'], ['Frete / vendas', div(soma(linhas, 'frete'), soma(linhas, 'vendas')), 'pct'],
            ['Notas sem CT-e (frete ainda não conta)', soma(linhas, 'sem_cte')]] };
      } },
    60: { titulo: 'Custo de frete por pedido', grupo: 'Custos', tela: 'financeiro', desc: 'Cada pedido com notas emitidas no período: as notas, o valor, o frete (com o rateio do CT-e de várias notas e as reentregas), o % do frete e as transportadoras. Clique no pedido para ver as notas.',
      detalhe: (req, q, de, ate, valor) => listaNotas(req, q, `${EMITIDAS} AND COALESCE(NULLIF(TRIM(f.numero_pedido), ''), '') = $3`, [de, ate, valor]),
      rodar: async (req, q, de, ate) => {
        const p = [de, ate]; const extra = filtros(q, p);
        const { rows } = await consulta(req, `SELECT COALESCE(NULLIF(TRIM(f.numero_pedido), ''), '(sem pedido)') AS grupo, MIN(f.cliente) AS cliente, COUNT(*)::int AS notas,
            STRING_AGG(f.numero_nf, ', ' ORDER BY f.numero_nf) AS nfs, COALESCE(SUM(f.valor_faturado), 0)::float AS valor, COALESCE(SUM(${FRETE_NOTA}), 0)::float AS frete,
            STRING_AGG(DISTINCT ${TRANSP}, ', ') AS transportadoras, COUNT(*) FILTER (WHERE f.chave_cte IS NULL AND f.cte_coberto_por IS NULL)::int AS sem_cte
          FROM fretes f WHERE f.frete_principal_id IS NULL AND COALESCE(f.numero_nf, '') <> '' AND f.nf_cancelada IS NOT TRUE AND ${EMITIDAS}${extra}
          GROUP BY 1 ORDER BY 6 DESC LIMIT 5000`, p);
        const linhas = rows.map((r) => ({ ...r, frete: r2(r.frete), pct: div(r.frete, r.valor) }));
        return { colunas: [['grupo', 'Pedido'], ['cliente', 'Cliente'], ['notas', 'Notas', 'num'], ['nfs', 'NF-e'], ['valor', 'Valor do pedido', 'moeda'], ['frete', 'Frete', 'moeda'], ['pct', 'Frete / valor', 'atraso'],
          ['transportadoras', 'Transportadoras'], ['sem_cte', 'Notas sem CT-e', 'num']], linhas, agrupado: true,
          resumo: [['Pedidos', linhas.filter((l) => l.grupo !== '(sem pedido)').length], ['Valor', soma(linhas, 'valor'), 'moeda'], ['Frete', soma(linhas, 'frete'), 'moeda'],
            ['Frete médio por pedido', div(soma(linhas, 'frete'), linhas.length), 'moeda'], ['Frete / valor', div(soma(linhas, 'frete'), soma(linhas, 'valor')), 'pct']] };
      } },
  };
};
// Tipo da despesa de cada CT-e (relatório 58).
const TIPO_DESPESA = `CASE WHEN f.vinculo_cte = 'reentrega' THEN 'Reentrega' WHEN f.vinculo_cte = 'devolucao' THEN 'Devolução' WHEN f.vinculo_cte IN ('redespacho', 'redespacho_nota') THEN 'Redespacho'
  WHEN f.vinculo_cte = 'complementar' OR f.tipo_cte = '1' THEN 'Complementar' WHEN f.vinculo_cte = 'retorno' THEN 'Retorno'
  WHEN f.frete_principal_id IS NOT NULL THEN 'Outros CT-e da nota' ELSE 'Frete de entrega' END`;
