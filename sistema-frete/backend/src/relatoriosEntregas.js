// Relatórios de entregas e rastreamento (tela 324, Gestão e relatórios). Os números seguem a lista de relatórios
// da empresa (35 a 50; os 61 a 70, de desempenho das transportadoras, ficam em src/relatoriosDesempenho.js). Base: as notas (registros principais, sem as canceladas). "Em aberto" = sem data de
// entrega, não devolvida e não cancelada/arquivada. Previsão = data_entrega_prevista; no prazo = entregue até a previsão.
// Filtros: de/ate (o período vale para a data de cada relatório: previsão, entrega, emissão ou ocorrência),
// transportadora, cliente, cidade e uf. Cada relatório devolve { titulo, descricao, colunas, linhas, resumo }.
const { consultaCliente: consultaComEscopo } = require('./permissoes');

const consulta = (req, sql, params) => consultaComEscopo(req, sql, params, { comCteCancelado: true });
const hojeSP = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dataOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && Number(String(v).slice(0, 4)) >= 1990;

const TRANSP = 'COALESCE(f.transportadora_cte, f.transportadora)';
const ABERTA = "f.data_entrega IS NULL AND f.nf_devolvida IS NOT TRUE AND COALESCE(f.status, '') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')";
const BASE = "f.frete_principal_id IS NULL AND f.numero_nf IS NOT NULL AND f.numero_nf <> '' AND f.nf_cancelada IS NOT TRUE";
// Ocorrência que é problema (recusa, avaria, ausente, endereço, devolução, extravio, retenção...).
const CAT_OCORRENCIA = `CASE
    WHEN o.ocorrencia ~* 'RECUS' OR o.descricao ~* 'RECUS' THEN 'Recusa'
    WHEN o.ocorrencia ~* 'AVARI|DANIFIC|QUEBRAD' OR o.descricao ~* 'AVARI|DANIFIC' THEN 'Avaria'
    WHEN o.ocorrencia ~* 'EXTRAVI|ROUB|FURT|SINISTR' THEN 'Extravio / sinistro'
    WHEN o.ocorrencia ~* 'AUSENTE|FECHAD|NINGU[EÉ]M|SEM RESPONS' THEN 'Destinatário ausente / fechado'
    WHEN o.ocorrencia ~* 'ENDERE[CÇ]O|N[AÃ]O LOCALIZ|N[AÃ]O ENCONTR|MUDOU' THEN 'Endereço'
    WHEN o.ocorrencia ~* 'DEVOLU|RETORN' THEN 'Devolução'
    WHEN o.ocorrencia ~* 'REENTREG|NOVA TENTATIVA|REAGEND' THEN 'Reentrega / reagendamento'
    WHEN o.ocorrencia ~* 'RETID|FISCAL|BLOQUE|AGUARDANDO DOC|PENDENCIA' THEN 'Retenção / pendência'
    WHEN o.ocorrencia ~* 'ATRAS|IMPEDIMENTO|GREVE|CHUVA|ACIDENTE' THEN 'Atraso / impedimento'
    WHEN COALESCE(o.tipo, '') ~* '^ENTREGA$' OR o.ocorrencia ~* 'ENTREGUE|ENTREGA REALIZADA' THEN 'Entrega'
    ELSE 'Informativo' END`;

// Colunas de uma nota (relatórios em lista).
const COLS_NOTA = `f.id, f.numero_nf, f.nf_serie, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS emissao, f.cliente, f.cidade, f.uf, ${TRANSP} AS transportadora,
  f.numero_cte, to_char(f.data_entrega_prevista, 'YYYY-MM-DD') AS previsao, to_char(f.data_entrega, 'YYYY-MM-DD') AS entrega,
  f.data_entrega_origem AS origem_entrega, f.canhoto_recebido_por AS recebedor, f.valor_faturado::float AS valor, COALESCE(f.peso_bruto, f.peso_kg)::float AS peso,
  f.qtd_volumes AS volumes, f.rastreio_ultima_ocorrencia AS ultima_ocorrencia, to_char(f.rastreio_ultima_em, 'YYYY-MM-DD"T"HH24:MI') AS ultima_em, f.rastreio_problema AS problema`;
const NOTA = [
  ['numero_nf', 'NF'], ['emissao', 'Emissão', 'data'], ['cliente', 'Cliente'], ['destino', 'Cidade/UF'], ['transportadora', 'Transportadora'],
  ['numero_cte', 'CT-e'], ['previsao', 'Previsão', 'data'], ['entrega', 'Entrega', 'data'], ['situacao', 'Situação', 'situacao'],
  ['dias', 'Dias', 'num'], ['ultima_ocorrencia', 'Última ocorrência'], ['valor', 'Valor da nota', 'moeda'],
];
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
function situacaoNota(n, hoje) {
  if (n.entrega) return n.previsao && n.entrega > n.previsao ? { s: 'Entregue com atraso', dias: diasEntre(n.previsao, n.entrega) } : { s: n.previsao ? 'Entregue no prazo' : 'Entregue', dias: n.previsao ? diasEntre(n.previsao, n.entrega) : null };
  if (n.previsao && n.previsao < hoje) return { s: 'Atrasada', dias: diasEntre(n.previsao, hoje) };
  if (!n.numero_cte) return { s: 'Aguardando CT-e', dias: null };
  return { s: 'Em trânsito', dias: n.previsao ? diasEntre(hoje, n.previsao) : null };
}

// Filtros comuns (transportadora, cliente, cidade, UF) → SQL e parâmetros.
function filtros(q, params) {
  const cond = [];
  const add = (sql, v) => { params.push(v); cond.push(sql.replace(/\?/g, `$${params.length}`)); };
  if (String(q.transportadora || '').trim()) add(`${TRANSP} ILIKE '%' || ? || '%'`, String(q.transportadora).trim());
  if (String(q.cliente || '').trim()) {
    const c = String(q.cliente).trim(); const d = c.replace(/\D/g, '');
    if (d.length >= 8) add("regexp_replace(COALESCE(f.cliente_documento, ''), '\\D', '', 'g') LIKE ? || '%'", d); else add("f.cliente ILIKE '%' || ? || '%'", c);
  }
  if (String(q.cidade || '').trim()) add("f.cidade ILIKE '%' || ? || '%'", String(q.cidade).trim());
  if (/^[A-Za-z]{2}$/.test(q.uf || '')) add('UPPER(f.uf) = ?', String(q.uf).toUpperCase());
  // Filial = a empresa que emitiu a nota (CNPJ do emitente; a raiz de 8 dígitos pega todas as filiais).
  const filial = String(q.filial || '').replace(/\D/g, '');
  if (filial.length >= 8) add("regexp_replace(COALESCE(NULLIF(f.emitente_cnpj, ''), SUBSTRING(f.chave_nfe FROM 7 FOR 14), ''), '\\D', '', 'g') LIKE ? || '%'", filial);
  // Nº da NF-e e do CT-e: um ou vários, separados por vírgula ou espaço (sem os zeros à esquerda).
  const numeros = (v) => String(v || '').split(/[\s,;]+/).map((x) => x.replace(/\D/g, '').replace(/^0+(?=\d)/, '')).filter(Boolean).slice(0, 500);
  if (numeros(q.nf).length) add("LTRIM(f.numero_nf, '0') = ANY(?::text[])", numeros(q.nf));
  if (numeros(q.cte).length) add("LTRIM(f.numero_cte, '0') = ANY(?::text[])", numeros(q.cte));
  if (String(q.status || '').trim()) add("COALESCE(f.status, 'Pendente') = ?", String(q.status).trim());
  return cond.length ? ` AND ${cond.join(' AND ')}` : '';
}

// Lista de notas com a situação calculada.
async function listaNotas(req, q, onde, params, { ordem = 'f.data_entrega_prevista NULLS LAST, f.numero_nf', limite = 5000 } = {}) {
  const extra = filtros(q, params);
  const { rows } = await consulta(req, `SELECT ${COLS_NOTA} FROM fretes f WHERE ${BASE} AND ${onde}${extra} ORDER BY ${ordem} LIMIT ${limite + 1}`, params);
  const hoje = hojeSP();
  const linhas = rows.slice(0, limite).map((n) => { const st = situacaoNota(n, hoje); return { ...n, destino: [n.cidade, n.uf].filter(Boolean).join('/'), situacao: st.s, dias: st.dias }; });
  const conta = (s) => linhas.filter((l) => l.situacao === s).length;
  const resumo = [
    ['Notas', linhas.length], ['Valor das notas', linhas.reduce((t, l) => t + (l.valor || 0), 0), 'moeda'],
    ['Entregues', conta('Entregue no prazo') + conta('Entregue com atraso') + conta('Entregue')], ['Atrasadas', conta('Atrasada')],
    ['Em trânsito', conta('Em trânsito')], ['Aguardando CT-e', conta('Aguardando CT-e')],
  ].filter(([, v], i) => i < 2 || v);
  return { colunas: NOTA, linhas, resumo, mais: rows.length > limite };
}

// Drill-down: as notas de um grupo (transportadora, cliente, cidade, UF, mês...). onde usa $1/$2 (de, ate); o valor vai
// em $3 e é comparado com a chave do grupo como texto ('' = "(sem informação)").
const EMITIDAS = 'f.data_emissao_nf BETWEEN $1::date AND $2::date';
const notasDoGrupo = (onde, chave) => (req, q, de, ate, valor) => listaNotas(req, q, `${onde} AND COALESCE((${chave})::text, '') = $3`, [de, ate, valor]);
// Notas de um dia (AAAA-MM-DD) ou de um mês (AAAA-MM), pela data dada.
const notasDoPeriodo = (data) => (req, q, de, ate, valor) => listaNotas(req, q, `to_char(${data}, '${String(valor).length > 7 ? 'YYYY-MM-DD' : 'YYYY-MM'}') = $1`, [valor]);

// Desempenho agrupado (transportadora, cliente, cidade, UF): notas emitidas no período.
async function agrupado(req, q, chave, rotulo, de, ate) {
  const params = [de, ate];
  const extra = filtros(q, params);
  const hoje = hojeSP(); params.push(hoje); const pHoje = `$${params.length}::date`;
  const { rows } = await consulta(req, `SELECT ${chave} AS grupo, COUNT(*)::int AS notas, COALESCE(SUM(f.valor_faturado), 0)::float AS valor,
      COUNT(*) FILTER (WHERE f.data_entrega IS NOT NULL)::int AS entregues,
      COUNT(*) FILTER (WHERE f.data_entrega IS NOT NULL AND f.data_entrega_prevista IS NOT NULL AND f.data_entrega <= f.data_entrega_prevista)::int AS no_prazo,
      COUNT(*) FILTER (WHERE f.data_entrega IS NOT NULL AND f.data_entrega_prevista IS NOT NULL)::int AS com_previsao,
      COUNT(*) FILTER (WHERE ${ABERTA})::int AS pendentes,
      COUNT(*) FILTER (WHERE ${ABERTA} AND f.data_entrega_prevista < ${pHoje})::int AS atrasadas,
      ROUND(AVG(f.data_entrega - f.data_emissao_nf) FILTER (WHERE f.data_entrega IS NOT NULL AND f.data_emissao_nf IS NOT NULL), 1)::float AS prazo_medio,
      to_char(MAX(f.data_entrega), 'YYYY-MM-DD') AS ultima_entrega
    FROM fretes f WHERE ${BASE} AND f.data_emissao_nf BETWEEN $1::date AND $2::date${extra}
    GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT 1000`, params);
  const linhas = rows.map((r) => ({ ...r, grupo: r.grupo || '(sem informação)', pct_prazo: r.com_previsao ? r.no_prazo / r.com_previsao : null }));
  const tot = (k) => linhas.reduce((t, l) => t + (l[k] || 0), 0);
  return {
    colunas: [['grupo', rotulo], ['notas', 'Notas', 'num'], ['valor', 'Valor das notas', 'moeda'], ['entregues', 'Entregues', 'num'], ['pendentes', 'Pendentes', 'num'],
      ['atrasadas', 'Atrasadas', 'num'], ['pct_prazo', 'No prazo', 'pct'], ['prazo_medio', 'Prazo médio (dias)', 'dec'], ['ultima_entrega', 'Última entrega', 'data']],
    linhas,
    resumo: [[`${rotulo}s`.replace('ãos', 'ões').replace('UFs', 'Estados'), linhas.length], ['Notas', tot('notas')], ['Entregues', tot('entregues')], ['Pendentes', tot('pendentes')],
      ['Atrasadas', tot('atrasadas')], ['No prazo', tot('com_previsao') ? tot('no_prazo') / tot('com_previsao') : null, 'pct']],
    agrupado: true,
  };
}

const RELATORIOS = {
  35: { titulo: 'Entregas previstas', grupo: 'Listas', desc: 'Notas com a previsão de entrega no período.',
    rodar: (req, q, de, ate) => listaNotas(req, q, 'f.data_entrega_prevista BETWEEN $1::date AND $2::date', [de, ate]) },
  36: { titulo: 'Entregas realizadas', grupo: 'Listas', desc: 'Notas entregues no período (data da entrega).',
    rodar: (req, q, de, ate) => listaNotas(req, q, 'f.data_entrega BETWEEN $1::date AND $2::date', [de, ate], { ordem: 'f.data_entrega, f.numero_nf' }) },
  37: { titulo: 'Entregas atrasadas', grupo: 'Listas', desc: 'Notas emitidas no período, ainda sem entrega, com a previsão já vencida.',
    rodar: (req, q, de, ate) => listaNotas(req, q, `f.data_emissao_nf BETWEEN $1::date AND $2::date AND ${ABERTA} AND f.data_entrega_prevista < $3::date`, [de, ate, hojeSP()], { ordem: 'f.data_entrega_prevista, f.numero_nf' }) },
  38: { titulo: 'Entregas de hoje', grupo: 'Listas', desc: 'Notas com a previsão de entrega para hoje (o período não vale).', semPeriodo: true,
    rodar: (req, q) => listaNotas(req, q, 'f.data_entrega_prevista = $1::date', [hojeSP()]) },
  39: { titulo: 'Próximos 7 dias', grupo: 'Listas', desc: 'Notas em aberto com a previsão de amanhã até daqui a 7 dias (o período não vale).', semPeriodo: true,
    rodar: (req, q) => listaNotas(req, q, `${ABERTA} AND f.data_entrega_prevista BETWEEN $1::date AND $2::date`, [somarDias(hojeSP(), 1), somarDias(hojeSP(), 7)]) },
  40: { titulo: 'Entregas pendentes', grupo: 'Listas', desc: 'Notas emitidas no período que ainda não foram entregues.',
    rodar: (req, q, de, ate) => listaNotas(req, q, `f.data_emissao_nf BETWEEN $1::date AND $2::date AND ${ABERTA}`, [de, ate]) },
  41: { titulo: 'Entregas em trânsito', grupo: 'Listas', desc: 'Notas emitidas no período, com CT-e, em transporte (sem entrega e dentro da previsão).',
    rodar: (req, q, de, ate) => listaNotas(req, q, `f.data_emissao_nf BETWEEN $1::date AND $2::date AND ${ABERTA} AND (f.numero_cte IS NOT NULL OR f.chave_cte IS NOT NULL)
      AND (f.data_entrega_prevista IS NULL OR f.data_entrega_prevista >= $3::date)`, [de, ate, hojeSP()]) },
  42: { titulo: 'Entregas por transportadora', grupo: 'Por grupo', desc: 'Desempenho de entrega de cada transportadora (notas emitidas no período).',
    rodar: (req, q, de, ate) => agrupado(req, q, TRANSP, 'Transportadora', de, ate) },
  43: { titulo: 'Entregas por cliente', grupo: 'Por grupo', desc: 'Entregas por destinatário (notas emitidas no período).',
    rodar: (req, q, de, ate) => agrupado(req, q, 'f.cliente', 'Cliente', de, ate) },
  44: { titulo: 'Entregas por cidade', grupo: 'Por grupo', desc: 'Volume de entregas por município (notas emitidas no período).',
    rodar: (req, q, de, ate) => agrupado(req, q, "COALESCE(f.cidade, '') || CASE WHEN f.uf IS NOT NULL THEN '/' || UPPER(f.uf) ELSE '' END", 'Cidade', de, ate) },
  45: { titulo: 'Entregas por estado', grupo: 'Por grupo', desc: 'Distribuição das entregas por UF (notas emitidas no período).',
    rodar: (req, q, de, ate) => agrupado(req, q, 'UPPER(f.uf)', 'UF', de, ate) },
  46: { titulo: 'Ocorrências de entrega', grupo: 'Eventos e qualidade', desc: 'Problemas, recusas, avarias e outros eventos do rastreamento no período (marque "Só problemas" para tirar entregas e informativos).',
    rodar: async (req, q, de, ate) => {
      const params = [de, ate];
      const extra = filtros(q, params);
      const { rows } = await consulta(req, `SELECT f.id, f.numero_nf, f.cliente, f.cidade, f.uf, ${TRANSP} AS transportadora, f.numero_cte,
          to_char(o.data_hora, 'YYYY-MM-DD"T"HH24:MI') AS data_hora, o.ocorrencia, o.descricao, o.cidade AS local, o.recebedor, o.fonte, ${CAT_OCORRENCIA} AS categoria
        FROM ocorrencias_rastreio o JOIN fretes f ON f.id = o.frete_id
        WHERE ${BASE} AND o.data_hora::date BETWEEN $1::date AND $2::date${extra} ORDER BY o.data_hora DESC LIMIT 5001`, params);
      const soProblema = q.so_problemas === '1' || q.so_problemas === true;
      const linhas = rows.slice(0, 5000).map((r) => ({ ...r, destino: [r.cidade, r.uf].filter(Boolean).join('/') }))
        .filter((r) => !soProblema || !['Entrega', 'Informativo'].includes(r.categoria));
      const porCat = {};
      linhas.forEach((l) => { porCat[l.categoria] = (porCat[l.categoria] || 0) + 1; });
      return {
        colunas: [['data_hora', 'Data/hora', 'datahora'], ['numero_nf', 'NF'], ['cliente', 'Cliente'], ['destino', 'Cidade/UF'], ['transportadora', 'Transportadora'],
          ['categoria', 'Tipo', 'categoria'], ['ocorrencia', 'Ocorrência'], ['local', 'Local'], ['recebedor', 'Recebedor'], ['fonte', 'Fonte']],
        linhas, mais: rows.length > 5000, filtroProblemas: true,
        resumo: [['Ocorrências', linhas.length], ['Notas', new Set(linhas.map((l) => l.id)).size],
          ...Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, v])],
      };
    } },
  47: { titulo: 'Reentregas', grupo: 'Eventos e qualidade', desc: 'Entregas que precisaram de nova tentativa: CT-e de reentrega emitido no período ou ocorrência de reentrega/reagendamento no período.',
    rodar: async (req, q, de, ate) => {
      const params = [de, ate];
      const extra = filtros(q, params);
      const { rows } = await consulta(req, `
        SELECT f.id, f.numero_nf, f.cliente, f.cidade, f.uf, ${TRANSP} AS transportadora, f.numero_cte AS cte_original,
               c.numero_cte AS cte_reentrega, to_char(c.data_emissao_cte, 'YYYY-MM-DD') AS data, c.valor_total_cte::float AS valor_reentrega,
               'CT-e de reentrega' AS origem, to_char(f.data_entrega, 'YYYY-MM-DD') AS entrega
          FROM fretes c JOIN fretes f ON f.id = c.frete_principal_id
         WHERE c.vinculo_cte = 'reentrega' AND c.cte_cancelado IS NOT TRUE AND ${BASE} AND c.data_emissao_cte BETWEEN $1::date AND $2::date${extra}
        UNION ALL
        SELECT DISTINCT ON (f.id) f.id, f.numero_nf, f.cliente, f.cidade, f.uf, ${TRANSP}, f.numero_cte, NULL, to_char(o.data_hora, 'YYYY-MM-DD'), NULL,
               'Ocorrência: ' || o.ocorrencia, to_char(f.data_entrega, 'YYYY-MM-DD')
          FROM ocorrencias_rastreio o JOIN fretes f ON f.id = o.frete_id
         WHERE ${BASE} AND o.data_hora::date BETWEEN $1::date AND $2::date AND o.ocorrencia ~* 'REENTREG|NOVA TENTATIVA|REAGEND'${extra}
           AND NOT EXISTS (SELECT 1 FROM fretes c2 WHERE c2.frete_principal_id = f.id AND c2.vinculo_cte = 'reentrega')
        ORDER BY 9 DESC NULLS LAST LIMIT 5000`, params);
      const linhas = rows.map((r) => ({ ...r, destino: [r.cidade, r.uf].filter(Boolean).join('/') }));
      return {
        colunas: [['data', 'Data', 'data'], ['numero_nf', 'NF'], ['cliente', 'Cliente'], ['destino', 'Cidade/UF'], ['transportadora', 'Transportadora'],
          ['cte_original', 'CT-e original'], ['cte_reentrega', 'CT-e reentrega'], ['valor_reentrega', 'Valor da reentrega', 'moeda'], ['origem', 'Como foi achada'], ['entrega', 'Entregue em', 'data']],
        linhas,
        resumo: [['Reentregas', linhas.length], ['Com CT-e de reentrega', linhas.filter((l) => l.cte_reentrega).length],
          ['Custo das reentregas', linhas.reduce((t, l) => t + (l.valor_reentrega || 0), 0), 'moeda'], ['Já entregues', linhas.filter((l) => l.entrega).length]],
      };
    } },
  48: { titulo: 'Comprovantes de entrega', grupo: 'Eventos e qualidade', desc: 'Notas entregues no período e o comprovante de cada uma: foto do canhoto, assinatura, recebedor e de onde veio a baixa.',
    rodar: async (req, q, de, ate) => {
      const params = [de, ate];
      const extra = filtros(q, params);
      const { rows } = await consulta(req, `SELECT f.id, f.numero_nf, f.cliente, f.cidade, f.uf, ${TRANSP} AS transportadora, f.numero_cte,
          to_char(f.data_entrega, 'YYYY-MM-DD') AS entrega, f.data_entrega_origem AS origem_entrega, f.canhoto_recebido_por AS recebedor,
          (f.canhoto_foto_arquivo IS NOT NULL) AS tem_foto, (f.canhoto_assinatura IS NOT NULL) AS tem_assinatura,
          to_char(f.canhoto_registrado_em, 'YYYY-MM-DD"T"HH24:MI') AS registrado_em
        FROM fretes f WHERE ${BASE} AND f.data_entrega BETWEEN $1::date AND $2::date${extra} ORDER BY f.data_entrega DESC, f.numero_nf LIMIT 5001`, params);
      const ORIGEM = { ssw: 'SSW', portal: 'Portal da transportadora', manual: 'Lançada à mão', sefaz: 'Comprovante na SEFAZ', comprovante: 'Comprovante', edi: 'EDI', motorista: 'App do motorista' };
      const linhas = rows.slice(0, 5000).map((r) => ({ ...r, destino: [r.cidade, r.uf].filter(Boolean).join('/'), origem: ORIGEM[r.origem_entrega] || r.origem_entrega || '',
        comprovante: [r.tem_foto ? 'Foto' : '', r.tem_assinatura ? 'Assinatura' : '', r.recebedor ? 'Recebedor' : ''].filter(Boolean).join(' + ') || 'Sem comprovante' }));
      return {
        colunas: [['entrega', 'Entrega', 'data'], ['numero_nf', 'NF'], ['cliente', 'Cliente'], ['destino', 'Cidade/UF'], ['transportadora', 'Transportadora'],
          ['comprovante', 'Comprovante', 'comprovante'], ['recebedor', 'Recebido por'], ['origem', 'Baixa por'], ['registrado_em', 'Registrado em', 'datahora']],
        linhas, mais: rows.length > 5000,
        resumo: [['Entregues', linhas.length], ['Com foto do canhoto', linhas.filter((l) => l.tem_foto).length], ['Com assinatura', linhas.filter((l) => l.tem_assinatura).length],
          ['Com recebedor', linhas.filter((l) => l.recebedor).length], ['Sem comprovante', linhas.filter((l) => l.comprovante === 'Sem comprovante').length]],
      };
    } },
  49: { titulo: 'Rastreamento por transportadora', grupo: 'Eventos e qualidade', desc: 'Notas em aberto (emitidas no período) por transportadora: quantas têm rastreamento, quantas estão paradas e quantas têm problema.',
    rodar: async (req, q, de, ate) => {
      const params = [de, ate];
      const extra = filtros(q, params);
      const { rows } = await consulta(req, `SELECT ${TRANSP} AS grupo, COUNT(*)::int AS abertas,
          COUNT(*) FILTER (WHERE f.rastreio_ultima_em IS NOT NULL)::int AS com_rastreio,
          COUNT(*) FILTER (WHERE f.rastreio_ultima_em >= NOW() - INTERVAL '48 hours')::int AS atualizadas_48h,
          COUNT(*) FILTER (WHERE f.rastreio_ultima_em < NOW() - INTERVAL '3 days')::int AS paradas,
          COUNT(*) FILTER (WHERE f.rastreio_ultima_em IS NULL AND (f.numero_cte IS NOT NULL OR f.chave_cte IS NOT NULL))::int AS sem_rastreio,
          COUNT(*) FILTER (WHERE f.rastreio_problema)::int AS com_problema,
          COUNT(*) FILTER (WHERE f.data_entrega_prevista < (NOW() - INTERVAL '3 hours')::date)::int AS atrasadas,
          to_char(MAX(f.rastreio_ultima_em), 'YYYY-MM-DD"T"HH24:MI') AS ultima_atualizacao
        FROM fretes f WHERE ${BASE} AND ${ABERTA} AND f.data_emissao_nf BETWEEN $1::date AND $2::date${extra}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 500`, params);
      const linhas = rows.map((r) => ({ ...r, grupo: r.grupo || '(sem transportadora)', pct_rastreio: r.abertas ? r.com_rastreio / r.abertas : null }));
      const tot = (k) => linhas.reduce((t, l) => t + (l[k] || 0), 0);
      return {
        colunas: [['grupo', 'Transportadora'], ['abertas', 'Em aberto', 'num'], ['com_rastreio', 'Com rastreamento', 'num'], ['pct_rastreio', '% rastreadas', 'pct'],
          ['atualizadas_48h', 'Atualizadas em 48 h', 'num'], ['paradas', 'Sem novidade há +3 dias', 'num'], ['sem_rastreio', 'Com CT-e e sem rastreio', 'num'],
          ['com_problema', 'Com problema', 'num'], ['atrasadas', 'Atrasadas', 'num'], ['ultima_atualizacao', 'Última atualização', 'datahora']],
        linhas, agrupado: true, grupoChave: 'transportadora',
        resumo: [['Transportadoras', linhas.length], ['Notas em aberto', tot('abertas')], ['Com rastreamento', tot('com_rastreio')], ['Paradas há +3 dias', tot('paradas')], ['Com problema', tot('com_problema')]],
      };
    } },
  50: { titulo: 'SLA de entrega', grupo: 'Eventos e qualidade', desc: 'Cumprimento dos prazos: notas entregues no período com previsão, no prazo e fora do prazo, por transportadora.',
    rodar: async (req, q, de, ate) => {
      const params = [de, ate];
      const extra = filtros(q, params);
      const { rows } = await consulta(req, `SELECT ${TRANSP} AS grupo, COUNT(*)::int AS entregues,
          COUNT(*) FILTER (WHERE f.data_entrega_prevista IS NOT NULL)::int AS com_previsao,
          COUNT(*) FILTER (WHERE f.data_entrega <= f.data_entrega_prevista)::int AS no_prazo,
          COUNT(*) FILTER (WHERE f.data_entrega > f.data_entrega_prevista)::int AS fora_prazo,
          ROUND(AVG(f.data_entrega - f.data_entrega_prevista) FILTER (WHERE f.data_entrega > f.data_entrega_prevista), 1)::float AS atraso_medio,
          ROUND(AVG(f.data_entrega - f.data_emissao_nf) FILTER (WHERE f.data_emissao_nf IS NOT NULL), 1)::float AS prazo_medio
        FROM fretes f WHERE ${BASE} AND f.data_entrega BETWEEN $1::date AND $2::date${extra}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 500`, params);
      const linhas = rows.map((r) => ({ ...r, grupo: r.grupo || '(sem transportadora)', sla: r.com_previsao ? r.no_prazo / r.com_previsao : null }));
      const tot = (k) => linhas.reduce((t, l) => t + (l[k] || 0), 0);
      return {
        colunas: [['grupo', 'Transportadora'], ['entregues', 'Entregues', 'num'], ['com_previsao', 'Com previsão', 'num'], ['no_prazo', 'No prazo', 'num'],
          ['fora_prazo', 'Fora do prazo', 'num'], ['sla', 'SLA (no prazo)', 'sla'], ['atraso_medio', 'Atraso médio (dias)', 'dec'], ['prazo_medio', 'Prazo médio (dias)', 'dec']],
        linhas, agrupado: true, grupoChave: 'transportadora',
        resumo: [['Entregues', tot('entregues')], ['No prazo', tot('no_prazo')], ['Fora do prazo', tot('fora_prazo')],
          ['SLA geral', tot('com_previsao') ? tot('no_prazo') / tot('com_previsao') : null, 'pct'], ['Sem previsão', tot('entregues') - tot('com_previsao')]],
      };
    } },
};

// 61 a 70: desempenho das transportadoras (tela 325), com as mesmas bases e filtros.
// Detalhe (drill-down) dos agrupados desta tela.
RELATORIOS[42].detalhe = notasDoGrupo(EMITIDAS, TRANSP);
RELATORIOS[43].detalhe = notasDoGrupo(EMITIDAS, 'f.cliente');
RELATORIOS[44].detalhe = notasDoGrupo(EMITIDAS, "COALESCE(f.cidade, '') || CASE WHEN f.uf IS NOT NULL THEN '/' || UPPER(f.uf) ELSE '' END");
RELATORIOS[45].detalhe = notasDoGrupo(EMITIDAS, 'UPPER(f.uf)');
RELATORIOS[49].detalhe = notasDoGrupo(`${EMITIDAS} AND ${ABERTA}`, TRANSP);
RELATORIOS[50].detalhe = notasDoGrupo('f.data_entrega BETWEEN $1::date AND $2::date', TRANSP);
const ajudas = { consulta, filtros, TRANSP, BASE, ABERTA, CAT_OCORRENCIA, hojeSP, listaNotas, notasDoGrupo, notasDoPeriodo, EMITIDAS };
Object.assign(RELATORIOS, require('./relatoriosDesempenho')(ajudas));
// 25 a 34: NF-e × CT-e (tela 326).
Object.assign(RELATORIOS, require('./relatoriosNfeCte')(ajudas));
// 11 a 24: auditoria de frete (tela 327).
Object.assign(RELATORIOS, require('./relatoriosAuditoria')(ajudas));
// 71 a 80: roteirização e operação da transportadora (tela 328, pelos romaneios; rota /api/relatorios-operacao).
Object.assign(RELATORIOS, require('./relatoriosOperacao')());

// tela: 'entregas' (324, relatórios 35 a 50), 'desempenho' (325, relatórios 61 a 70) 'nfecte' (326, relatórios 25 a 34) ou 'auditoria' (327, relatórios 11 a 24) ou 'operacao' (328, relatórios 71 a 80).
function catalogo(tela = 'entregas') {
  return Object.entries(RELATORIOS).filter(([, r]) => (r.tela || 'entregas') === tela)
    .map(([n, r]) => ({ numero: Number(n), titulo: r.titulo, grupo: r.grupo, desc: r.desc, semPeriodo: !!r.semPeriodo }));
}

async function rodar(req, numero, q = {}) {
  const r = RELATORIOS[numero];
  if (!r) throw Object.assign(new Error('Relatório não encontrado.'), { status: 404 });
  const hoje = hojeSP();
  const de = dataOk(q.de) ? q.de : somarDias(hoje, -30);
  const ate = dataOk(q.ate) ? q.ate : hoje;
  if (de > ate) throw Object.assign(new Error('A data inicial é depois da final.'), { status: 400 });
  // Drill-down: com ?detalhe=<valor do grupo>, o relatório devolve os documentos daquele grupo.
  if (q.detalhe !== undefined && r.detalhe) {
    const res = await r.detalhe(req, q, de, ate, String(q.detalhe));
    return { numero: Number(numero), titulo: r.titulo, descricao: r.desc, de, ate, hoje, abrir: 'nota', ...res, detalhe: String(q.detalhe) };
  }
  const res = await r.rodar(req, q, de, ate);
  return { numero: Number(numero), titulo: r.titulo, descricao: r.desc, de: r.semPeriodo ? null : de, ate: r.semPeriodo ? null : ate, hoje, abrir: 'nota',
    ...res, drill: r.detalhe ? (r.drill || 'grupo') : null };
}

// Opções dos filtros de lista: as filiais (emitentes das notas) e os status dos fretes; na tela de operação, as
// unidades e as situações do romaneio.
async function opcoesFiltro(req, tela) {
  if (tela === 'operacao') {
    const params = [];
    const { rows } = await require('./db').query(`SELECT u.id, COALESCE(NULLIF(u.sigla, ''), u.nome) AS sigla, u.nome FROM unidades u
      WHERE u.ativa IS NOT FALSE AND ${require('./permissoes').condicaoUnidades(req, ['u.id'], params)} ORDER BY u.matriz DESC NULLS LAST, u.nome`, params).catch(() => ({ rows: [] }));
    return { filiais: rows.map((u) => ({ valor: String(u.id), nome: u.sigla === u.nome ? u.nome : `${u.sigla} · ${u.nome}` })),
      status: [['aberto', 'Montando'], ['em_rota', 'Em rota'], ['fechado', 'Fechado']].map(([valor, nome]) => ({ valor, nome })) };
  }
  const [{ rows: fil }, { rows: st }] = await Promise.all([
    consulta(req, `SELECT regexp_replace(COALESCE(NULLIF(f.emitente_cnpj, ''), SUBSTRING(f.chave_nfe FROM 7 FOR 14)), '\\D', '', 'g') AS cnpj, MAX(f.emitente_nome) AS nome, COUNT(*)::int AS n
      FROM fretes f WHERE f.frete_principal_id IS NULL AND COALESCE(f.emitente_cnpj, f.chave_nfe) IS NOT NULL AND f.data_emissao_nf >= CURRENT_DATE - 400 GROUP BY 1 ORDER BY 3 DESC LIMIT 60`, []),
    consulta(req, "SELECT COALESCE(f.status, 'Pendente') AS status, COUNT(*)::int AS n FROM fretes f WHERE f.data_emissao_nf >= CURRENT_DATE - 400 GROUP BY 1 ORDER BY 2 DESC LIMIT 30", []),
  ]);
  const cnpj = (c) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return { filiais: fil.filter((f) => /^\d{14}$/.test(f.cnpj || '')).map((f) => ({ valor: f.cnpj, nome: `${f.nome ? `${f.nome} · ` : ''}${cnpj(f.cnpj)}` })),
    status: st.map((s) => ({ valor: s.status, nome: s.status })) };
}

module.exports = { catalogo, rodar, opcoesFiltro, situacaoNota, RELATORIOS };
