// Relatórios de controle operacional dos fretes contratados (tela 332, embarcador): os números 87 a 99. Montado por
// src/relatoriosEntregas.js (mesmos filtros, totalizador, gráfico e drill-down).
//  87 NF-e × pré-nota: a nota fiscal comparada com o pedido que o ERP mandou antes dela (fretes.pre_nota, a linha da
//     planilha do ERP guardada quando a nota chega; src/importacaoErp.js).
//  88 Comparativo de fretes e 94 Possibilidade de agrupamento de CT-e: atalhos (13 · Contratado × cobrado e a tela 314).
//  89 Transportadoras com arquivos pendentes: notas sem CT-e há mais de 3 dias, CT-e sem nota e arquivos EDI parados.
//  90 Relação de conhecimentos: cada CT-e com a situação (auditoria, fatura, pagamento).
//  91 Integração de CT-e: quando e por onde cada CT-e entrou (registro "importar_cte" da auditoria).
//  92 Produtividade de resolução de pendências: o que cada usuário decidiu no período.
//  93 Vigência das tabelas de frete e 95 Restrição de pessoa nas tabelas.
//  96 Operação de doca (Pátio e portaria), 97 Justificativas das ações, 98 Operação por documentos, 99 Pendências.
//  106 Transportadora do mapa × NF-e × CT-e: quem de fato coletou (TRANSPORTADORA_MAPA da Timeline de pedidos).
// Os que usam dados de fora das notas (tabelas, pátio, EDI, faturas, ações dos usuários) são só de quem vê todos os fretes.
const pool = require('./db');
const { vePotudo } = require('./permissoes');

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Mesma transportadora/cidade escrita de jeitos diferentes ("TRANSP. XYZ LTDA" × "TRANSP XYZ"): uma contém a outra.
const mesmoNome = (a, b) => { const x = norm(a); const y = norm(b); return !x || !y || x === y || x.includes(y) || y.includes(x); };
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Diferenças entre a NF-e e a pré-nota (pedido do ERP). p = pre_nota; n = a nota.
function divergencias(n, p) {
  const d = [];
  const vp = num(p.valor_faturado); const vn = num(n.valor);
  if (vp != null && vn != null && Math.abs(vp - vn) > 0.01) d.push('valor');
  const qp = num(p.qtd_volumes); const qn = num(n.volumes);
  if (qp != null && qn != null && Math.round(qp) !== Math.round(qn)) d.push('volumes');
  const pp = num(p.peso_kg); const pn = num(n.peso);
  if (pp != null && pn != null && Math.abs(pp - pn) > Math.max(0.5, pp * 0.02)) d.push('peso');
  if (p.transportadora && n.transportadora && !mesmoNome(p.transportadora, n.transportadora)) d.push('transportadora');
  if ((p.cidade && n.cidade && norm(p.cidade) !== norm(n.cidade)) || (p.uf && n.uf && norm(p.uf) !== norm(n.uf))) d.push('destino');
  const dp = String(p.cliente_documento || '').replace(/\D/g, ''); const dn = String(n.cliente_documento || '').replace(/\D/g, '');
  if (dp && dn && dp !== dn) d.push('cliente');
  return d;
}

// Origem do CT-e pelo usuário que o importou (os automáticos têm nome fixo).
function origemCte(usuarioId, nome) {
  if (usuarioId) return 'Envio manual';
  const n = String(nome || '');
  if (/e-mail/i.test(n)) return 'E-mail';
  if (/SEFAZ/i.test(n)) return 'SEFAZ (DF-e)';
  if (/pasta/i.test(n)) return 'Pasta de XML';
  if (/NF-Stock/i.test(n)) return 'NF-Stock';
  if (/EDI/i.test(n)) return 'EDI';
  if (/API/i.test(n)) return 'API';
  return n || 'Automático';
}

module.exports = function criar(h) {
  const { consulta, filtros, TRANSP, BASE, ABERTA, hojeSP, listaNotas, EMITIDAS } = h;
  const r2 = (v) => (v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
  const div = (a, b) => (b ? a / b : null);
  const soma = (ls, k) => ls.reduce((t, l) => t + (Number(l[k]) || 0), 0);
  const conta = (ls, f) => ls.filter(f).length;
  const VALOR = 'COALESCE(f.valor_total_cte, f.valor_frete_negociado, 0)';
  const DATA = 'COALESCE(f.data_emissao_cte, f.data_emissao_nf)';
  const NF = "COALESCE(NULLIF(f.numero_nf, ''), (SELECT p.numero_nf FROM fretes p WHERE p.id = f.frete_principal_id))";
  const TIPO = `CASE WHEN f.vinculo_cte = 'reentrega' THEN 'Reentrega' WHEN f.vinculo_cte = 'devolucao' THEN 'Devolução' WHEN f.vinculo_cte IN ('redespacho', 'redespacho_nota') THEN 'Redespacho'
    WHEN f.vinculo_cte = 'complementar' OR f.tipo_cte = '1' THEN 'Complementar' WHEN f.vinculo_cte = 'retorno' THEN 'Retorno'
    WHEN f.frete_principal_id IS NOT NULL THEN 'Outros CT-e da nota' ELSE 'Frete de entrega' END`;
  const FOB = "COALESCE(f.frete_cif_fob, '') NOT IN ('FOB', 'Destinatário', 'Destinatario', 'Sem frete', 'Próprio destinatário')";
  // Nota que já devia ter CT-e: CIF, emitida há mais de 3 dias (e menos de 120), sem CT-e nem CT-e de várias notas.
  const SEM_CTE = `${BASE} AND f.chave_cte IS NULL AND f.cte_coberto_por IS NULL AND f.nf_entrada IS NOT TRUE AND f.carga_direta IS NOT TRUE AND ${FOB}
    AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado') AND f.nf_devolvida IS NOT TRUE
    AND f.data_emissao_nf BETWEEN CURRENT_DATE - 120 AND CURRENT_DATE - 3`;
  const CTE_SEM_NOTA = "f.frete_principal_id IS NULL AND f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE AND COALESCE(f.numero_nf, '') = '' AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Arquivado')";
  const SITUACAO_CTE = `CASE WHEN f.cte_cancelado THEN 'Cancelado' WHEN f.status_aprovacao = 'Rejeitado' THEN 'Reprovado'
    WHEN ff.pago_em IS NOT NULL THEN 'Pago' WHEN f.fatura_id IS NOT NULL OR f.status = 'Faturado' THEN 'Faturado (a pagar)'
    WHEN f.status = 'Frete Retido' THEN 'Retido na auditoria' WHEN f.status IN ('Liberado p/ Pagamento', 'Conferido') OR f.status_aprovacao = 'Aprovado' THEN 'Liberado (sem fatura)' ELSE 'Em conferência' END`;
  const soTodos = (req) => { if (!vePotudo(req)) throw Object.assign(new Error('Este relatório é só para quem vê todos os fretes (ele usa tabelas, pátio, EDI ou ações dos usuários).'), { status: 403 }); };
  const ddmm = (iso) => (iso ? String(iso).slice(0, 10) : null);
  const dias = (de, ate = hojeSP()) => (de ? Math.round((Date.parse(`${String(ate).slice(0, 10)}T12:00:00Z`) - Date.parse(`${String(de).slice(0, 10)}T12:00:00Z`)) / 86400000) : null);

  // 87 ---------------------------------------------------------------------------------------------------------------
  async function preNota(req, q, de, ate) {
    const p = [de, ate]; const extra = filtros(q, p);
    const { rows } = await consulta(req, `SELECT f.id, f.numero_nf, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS emissao, f.numero_pedido, f.cliente, f.cliente_documento, f.pre_nota,
        f.valor_faturado::float AS valor, f.qtd_volumes AS volumes, COALESCE(f.peso_bruto, f.peso_kg)::float AS peso, ${TRANSP} AS transportadora, f.cidade, f.uf
      FROM fretes f WHERE ${BASE} AND ${EMITIDAS} AND f.pre_nota IS NOT NULL${extra} ORDER BY f.data_emissao_nf DESC, f.numero_nf DESC LIMIT 5001`, p);
    const p2 = [de, ate]; const extra2 = filtros(q, p2);
    const { rows: [sem] } = await consulta(req, `SELECT COUNT(*)::int AS n FROM fretes f WHERE ${BASE} AND ${EMITIDAS} AND f.pre_nota IS NULL AND f.nf_entrada IS NOT TRUE${extra2}`, p2);
    const linhas = rows.slice(0, 5000).map((n) => {
      const pr = n.pre_nota || {}; const d = divergencias(n, pr);
      const { pre_nota: _x, cliente_documento: _y, ...resto } = n;
      return { ...resto, pre_valor: num(pr.valor_faturado), dif_valor: num(pr.valor_faturado) != null && n.valor != null ? r2(n.valor - num(pr.valor_faturado)) : null,
        pre_volumes: num(pr.qtd_volumes), pre_peso: num(pr.peso_kg), pre_transportadora: pr.transportadora || null,
        pre_destino: [pr.cidade, pr.uf].filter(Boolean).join('/') || null, destino: [n.cidade, n.uf].filter(Boolean).join('/'),
        divergencias: d.join(', ') || null, situacao: d.length ? 'Diverge' : 'Confere' };
    });
    return {
      colunas: [['numero_nf', 'NF-e'], ['emissao', 'Emissão', 'data'], ['numero_pedido', 'Pedido'], ['cliente', 'Cliente'], ['situacao', 'Situação', 'confere'], ['divergencias', 'O que mudou'],
        ['pre_valor', 'Valor (pré-nota)', 'moeda'], ['valor', 'Valor (NF-e)', 'moeda'], ['dif_valor', 'Diferença', 'difcusto'], ['pre_volumes', 'Volumes (pré)', 'num'], ['volumes', 'Volumes (NF-e)', 'num'],
        ['pre_peso', 'Peso (pré)', 'dec'], ['peso', 'Peso (NF-e)', 'dec'], ['pre_transportadora', 'Transportadora (pré)'], ['transportadora', 'Transportadora (NF-e)'],
        ['pre_destino', 'Destino (pré)'], ['destino', 'Destino (NF-e)']],
      linhas, mais: rows.length > 5000,
      resumo: [['Notas comparadas', linhas.length], ['Conferem', conta(linhas, (l) => l.situacao === 'Confere')], ['Divergem', conta(linhas, (l) => l.situacao === 'Diverge')],
        ['Diferença de valor', soma(linhas, 'dif_valor'), 'moeda'], ['Transportadora trocada', conta(linhas, (l) => /transportadora/.test(l.divergencias || ''))],
        ['Notas sem pré-nota', sem?.n || 0]],
    };
  }

  // 89 ---------------------------------------------------------------------------------------------------------------
  async function arquivosPendentes(req, q) {
    const p = []; const extra = filtros(q, p);
    const { rows } = await consulta(req, `SELECT COALESCE(${TRANSP}, '') AS chave, COUNT(*) FILTER (WHERE ${SEM_CTE})::int AS sem_cte,
        to_char(MIN(f.data_emissao_nf) FILTER (WHERE ${SEM_CTE}), 'YYYY-MM-DD') AS desde, COUNT(*) FILTER (WHERE ${CTE_SEM_NOTA})::int AS cte_sem_nota,
        COALESCE(SUM(f.valor_faturado) FILTER (WHERE ${SEM_CTE}), 0)::float AS valor_sem_cte
      FROM fretes f WHERE ((${SEM_CTE}) OR (${CTE_SEM_NOTA}))${extra} GROUP BY 1`, p);
    const mapa = new Map();
    const pegar = (nome) => {
      const k = norm(nome) || '?';
      const achado = [...mapa.entries()].find(([x]) => x !== '?' && k !== '?' && (x.includes(k) || k.includes(x)));
      if (achado) return achado[1];
      const l = { grupo: nome || '(sem transportadora)', chave: null, sem_cte: 0, desde: null, cte_sem_nota: 0, valor_sem_cte: 0, edi_aguardando: 0, edi_erro: 0 };
      mapa.set(k, l); return l;
    };
    rows.forEach((r) => { const l = pegar(r.chave); Object.assign(l, { chave: r.chave, sem_cte: r.sem_cte, desde: r.desde, cte_sem_nota: r.cte_sem_nota, valor_sem_cte: r.valor_sem_cte }); });
    if (vePotudo(req) && !String(q.cliente || '').trim()) {
      const { rows: edi } = await pool.query(`SELECT COALESCE(NULLIF(nome_emissor, ''), cnpj_emissor, '?') AS nome, COUNT(*) FILTER (WHERE status = 'aguardando')::int AS ag,
          COUNT(*) FILTER (WHERE status = 'erro')::int AS er, to_char(MIN(criado_em), 'YYYY-MM-DD') AS desde
        FROM edi_recebidos WHERE status IN ('aguardando', 'erro') GROUP BY 1`).catch(() => ({ rows: [] }));
      edi.filter((e) => !String(q.transportadora || '').trim() || mesmoNome(e.nome, q.transportadora)).forEach((e) => {
        const l = pegar(e.nome); l.edi_aguardando += e.ag; l.edi_erro += e.er; if (!l.desde || e.desde < l.desde) l.desde = e.desde;
      });
    }
    const linhas = [...mapa.values()].map((l) => ({ ...l, dias: dias(l.desde), total: l.sem_cte + l.cte_sem_nota + l.edi_aguardando + l.edi_erro }))
      .filter((l) => l.total > 0).sort((a, b) => b.total - a.total);
    return {
      colunas: [['grupo', 'Transportadora'], ['total', 'Pendências', 'num'], ['sem_cte', 'Notas sem CT-e', 'num'], ['valor_sem_cte', 'Valor dessas notas', 'moeda'], ['cte_sem_nota', 'CT-e sem nota', 'num'],
        ['edi_aguardando', 'EDI aguardando conferência', 'num'], ['edi_erro', 'EDI com erro', 'num'], ['desde', 'Mais antiga', 'data'], ['dias', 'Dias', 'num']],
      linhas, agrupado: true, drillValor: 'chave',
      resumo: [['Transportadoras com pendência', linhas.length], ['Notas sem CT-e (mais de 3 dias)', soma(linhas, 'sem_cte')], ['CT-e sem nota', soma(linhas, 'cte_sem_nota')],
        ['Arquivos EDI parados', soma(linhas, 'edi_aguardando') + soma(linhas, 'edi_erro')]],
    };
  }

  // 90 ---------------------------------------------------------------------------------------------------------------
  async function conhecimentos(req, q, de, ate) {
    const p = [de, ate]; const extra = filtros(q, p);
    const { rows } = await consulta(req, `SELECT COALESCE(f.frete_principal_id, f.id) AS id, f.numero_cte, f.cte_serie AS serie, to_char(${DATA}, 'YYYY-MM-DD') AS emissao_cte, ${TRANSP} AS transportadora,
        f.tomador_cte_nome AS tomador, f.cte_remetente_nome AS remetente, f.cte_destinatario_nome AS destinatario,
        NULLIF(CONCAT_WS(' → ', NULLIF(CONCAT_WS('/', f.cte_cidade_inicio, f.uf_inicio_cte), ''), NULLIF(CONCAT_WS('/', f.cte_cidade_fim, f.uf_fim_cte), '')), '') AS trecho,
        ${NF} AS nf, ${TIPO} AS tipo, f.valor_total_cte::float AS valor, f.valor_total_calculado::float AS calculado, COALESCE(f.glosa_valor, 0)::float AS glosa,
        ${SITUACAO_CTE} AS situacao, ff.numero AS fatura, to_char(ff.pago_em, 'YYYY-MM-DD') AS pago_em, f.chave_cte AS chave
      FROM fretes f LEFT JOIN faturas_frete ff ON ff.id = f.fatura_id
      WHERE f.chave_cte IS NOT NULL AND ${DATA} BETWEEN $1::date AND $2::date${extra} ORDER BY ${DATA} DESC, f.numero_cte DESC LIMIT 5001`, p);
    const linhas = rows.slice(0, 5000).map((r) => ({ ...r, diferenca: r.calculado != null && r.valor != null ? r2(r.valor - r.calculado) : null }));
    const validos = linhas.filter((l) => l.situacao !== 'Cancelado');
    return {
      colunas: [['numero_cte', 'CT-e'], ['serie', 'Série'], ['emissao_cte', 'Emissão', 'data'], ['transportadora', 'Transportadora'], ['tomador', 'Tomador'], ['remetente', 'Remetente'],
        ['destinatario', 'Destinatário'], ['trecho', 'Origem → destino'], ['nf', 'NF-e'], ['tipo', 'Tipo'], ['valor', 'Valor', 'moeda'], ['calculado', 'Pela tabela', 'moeda'],
        ['diferenca', 'Diferença', 'difcusto'], ['glosa', 'Glosa', 'moeda'], ['situacao', 'Situação', 'financeiro'], ['fatura', 'Fatura'], ['pago_em', 'Pago em', 'data'], ['chave', 'Chave', 'chave']],
      linhas, mais: rows.length > 5000,
      resumo: [['CT-e', linhas.length], ['Valor', soma(validos, 'valor'), 'moeda'], ['Acima da tabela', soma(validos.filter((l) => l.diferenca > 0), 'diferenca'), 'moeda'],
        ['Glosas', soma(validos, 'glosa'), 'moeda'], ['Pagos', conta(linhas, (l) => l.situacao === 'Pago')], ['Retidos', conta(linhas, (l) => l.situacao === 'Retido na auditoria')],
        ['Cancelados', conta(linhas, (l) => l.situacao === 'Cancelado')]],
    };
  }

  // 91 ---------------------------------------------------------------------------------------------------------------
  async function integracao(req, q, de, ate) {
    const p = [de, ate]; const extra = filtros(q, p);
    const { rows } = await consulta(req, `SELECT f.id AS registro, COALESCE(f.frete_principal_id, f.id) AS id, to_char(a.criado_em, 'YYYY-MM-DD"T"HH24:MI') AS integrado_em, a.usuario_id, a.usuario_nome,
        f.numero_cte, to_char(f.data_emissao_cte, 'YYYY-MM-DD') AS emissao_cte, ${TRANSP} AS transportadora, ${NF} AS nf, ${TIPO} AS tipo, f.valor_total_cte::float AS valor,
        ROUND(EXTRACT(EPOCH FROM (a.criado_em - f.data_emissao_cte::timestamp)) / 86400.0, 1)::float AS dias
      FROM auditoria a JOIN fretes f ON f.id = a.registro_id
      WHERE a.acao = 'importar_cte' AND a.criado_em >= $1::date AND a.criado_em < $2::date + 1${extra}
      ORDER BY a.criado_em DESC LIMIT 5001`, p);
    const linhas = rows.slice(0, 5000).map(({ usuario_id: uid, usuario_nome: un, ...r }) => ({ ...r, situacao: origemCte(uid, un), usuario: uid ? un : 'Automático', dias: r.dias != null ? Math.max(0, r.dias) : null }));
    const auto = conta(linhas, (l) => l.situacao !== 'Envio manual');
    const comDias = linhas.filter((l) => l.dias != null);
    const resumo = [['CT-e integrados', linhas.length], ['Automáticos', div(auto, linhas.length), 'pct'], ['Enviados à mão', linhas.length - auto],
      ['Dias da emissão até chegar (média)', div(soma(comDias, 'dias'), comDias.length), 'dec'], ['Chegaram com mais de 5 dias', conta(comDias, (l) => l.dias > 5)]];
    return {
      colunas: [['integrado_em', 'Integrado em', 'datahora'], ['situacao', 'Por onde entrou'], ['usuario', 'Usuário'], ['numero_cte', 'CT-e'], ['emissao_cte', 'Emissão do CT-e', 'data'],
        ['dias', 'Dias até integrar', 'dec'], ['transportadora', 'Transportadora'], ['nf', 'NF-e'], ['tipo', 'Tipo'], ['valor', 'Valor', 'moeda']],
      linhas, mais: rows.length > 5000, resumo,
    };
  }

  // 92 ---------------------------------------------------------------------------------------------------------------
  async function produtividade(req, q, de, ate) {
    soTodos(req);
    const p = [de, ate];
    const [{ rows: decisoes }, { rows: acoes }, { rows: edi }, { rows: cont }] = await Promise.all([
      pool.query(`SELECT aprovado_por_nome AS u, COUNT(*) FILTER (WHERE status_aprovacao = 'Aprovado')::int AS aprovados, COUNT(*) FILTER (WHERE status_aprovacao = 'Rejeitado')::int AS reprovados,
          AVG(EXTRACT(EPOCH FROM (aprovado_em - cte_dados_em)) / 86400.0) FILTER (WHERE cte_dados_em IS NOT NULL AND cte_dados_em <= aprovado_em)::float AS dias
        FROM fretes WHERE aprovado_em >= $1::date AND aprovado_em < $2::date + 1 AND aprovado_por_nome IS NOT NULL AND aprovado_por_nome NOT ILIKE 'Sistema%' GROUP BY 1`, p),
      pool.query(`SELECT usuario_nome AS u, COUNT(*) FILTER (WHERE acao = 'registrar_glosa')::int AS glosas, COUNT(*) FILTER (WHERE acao = 'conferir_fatura')::int AS faturas_conferidas,
          COUNT(*) FILTER (WHERE acao IN ('aprovada', 'liberada', 'paga', 'bloqueada', 'desbloqueada', 'baixar_fatura'))::int AS decisoes_fatura,
          COUNT(*) FILTER (WHERE acao = 'definir_transportadora_que_levou')::int AS ajustes
        FROM auditoria WHERE criado_em >= $1::date AND criado_em < $2::date + 1 AND usuario_id IS NOT NULL GROUP BY 1`, p),
      pool.query(`SELECT tratado_por AS u, COUNT(*)::int AS edi FROM edi_recebidos WHERE tratado_em >= $1::date AND tratado_em < $2::date + 1 AND tratado_por IS NOT NULL AND tratado_por <> 'EDI automático' GROUP BY 1`, p).catch(() => ({ rows: [] })),
      pool.query(`SELECT criado_por AS u, COUNT(*)::int AS contestacoes FROM contestacoes WHERE criado_em >= $1::date AND criado_em < $2::date + 1 AND criado_por IS NOT NULL GROUP BY 1`, p).catch(() => ({ rows: [] })),
    ]);
    const mapa = new Map();
    const de_ = (u) => { if (!mapa.has(u)) mapa.set(u, { grupo: u, aprovados: 0, reprovados: 0, glosas: 0, faturas_conferidas: 0, decisoes_fatura: 0, edi: 0, contestacoes: 0, ajustes: 0, dias: null }); return mapa.get(u); };
    decisoes.forEach((r) => Object.assign(de_(r.u), { aprovados: r.aprovados, reprovados: r.reprovados, dias: r.dias != null ? Math.round(r.dias * 10) / 10 : null }));
    acoes.forEach((r) => Object.assign(de_(r.u), { glosas: r.glosas, faturas_conferidas: r.faturas_conferidas, decisoes_fatura: r.decisoes_fatura, ajustes: r.ajustes }));
    edi.forEach((r) => { de_(r.u).edi = r.edi; });
    cont.forEach((r) => { de_(r.u).contestacoes = r.contestacoes; });
    const K = ['aprovados', 'reprovados', 'glosas', 'faturas_conferidas', 'decisoes_fatura', 'edi', 'contestacoes', 'ajustes'];
    const linhas = [...mapa.values()].map((l) => ({ ...l, total: K.reduce((t, k) => t + l[k], 0) })).filter((l) => l.total > 0).sort((a, b) => b.total - a.total);
    return {
      colunas: [['grupo', 'Usuário'], ['total', 'Resolvidas', 'num'], ['aprovados', 'CT-e aprovados', 'num'], ['reprovados', 'CT-e reprovados', 'num'], ['glosas', 'Glosas', 'num'],
        ['faturas_conferidas', 'Faturas conferidas', 'num'], ['decisoes_fatura', 'Decisões de fatura', 'num'], ['edi', 'Arquivos EDI tratados', 'num'], ['contestacoes', 'Contestações abertas', 'num'],
        ['ajustes', 'Transportadora que levou', 'num'], ['dias', 'Dias até decidir o CT-e (média)', 'dec']],
      linhas, agrupado: true,
      resumo: [['Usuários', linhas.length], ['Pendências resolvidas', soma(linhas, 'total')], ['CT-e decididos', soma(linhas, 'aprovados') + soma(linhas, 'reprovados')],
        ['Dias até decidir (média)', div(linhas.reduce((t, l) => t + (l.dias || 0) * (l.aprovados + l.reprovados), 0), linhas.filter((l) => l.dias != null).reduce((t, l) => t + l.aprovados + l.reprovados, 0)), 'dec']],
    };
  }

  // 93 e 95: tabelas de preço ---------------------------------------------------------------------------------------
  async function tabelas(req, q, de, ate) {
    soTodos(req);
    const p = [de, ate]; const cond = [];
    if (String(q.transportadora || '').trim()) { p.push(String(q.transportadora).trim()); cond.push(`t.razao_social ILIKE '%' || $${p.length} || '%'`); }
    const { rows } = await pool.query(`SELECT tp.id, t.razao_social AS transportadora, tp.nome AS tabela, tp.ativa, tp.cliente_doc, tp.cliente_nome, tp.cliente_por_raiz, tp.descarga_clientes,
        to_char(tp.vigencia_desde, 'YYYY-MM-DD') AS desde, tp.validade_meses, to_char(tp.vigencia_desde + make_interval(months => tp.validade_meses), 'YYYY-MM-DD') AS vence_em,
        tp.indice_correcao, to_char(tp.atualizado_em, 'YYYY-MM-DD') AS atualizada, tp.uf_destino,
        (SELECT COUNT(*) FROM tabela_preco_faixas x WHERE x.tabela_preco_id = tp.id)::int AS trechos,
        (SELECT COUNT(*) FROM fretes f WHERE f.tabela_preco_id_usada = tp.id AND f.data_emissao_nf BETWEEN $1::date AND $2::date)::int AS notas,
        (SELECT COALESCE(SUM(f.valor_total_cte), 0) FROM fretes f WHERE f.tabela_preco_id_usada = tp.id AND f.data_emissao_nf BETWEEN $1::date AND $2::date)::float AS frete
      FROM tabelas_preco tp JOIN transportadoras t ON t.id = tp.transportadora_id${cond.length ? ` WHERE ${cond.join(' AND ')}` : ''}
      ORDER BY t.razao_social, tp.nome`, p);
    const hoje = hojeSP();
    return rows.map((r) => {
      const ate_ = r.vence_em; const d = ate_ ? dias(hoje, ate_) : null;
      const situacao = !r.ativa ? 'Inativa' : !ate_ ? 'Sem validade definida' : d < 0 ? 'Vencida' : d <= 30 ? 'Vence em até 30 dias' : 'Válida';
      return { ...r, dias_vencer: d, situacao };
    });
  }
  async function vigencia(req, q, de, ate) {
    const linhas = await tabelas(req, q, de, ate);
    return {
      colunas: [['transportadora', 'Transportadora'], ['tabela', 'Tabela'], ['situacao', 'Situação', 'confere'], ['desde', 'Vigente desde', 'data'], ['validade_meses', 'Validade (meses)', 'num'],
        ['vence_em', 'Vence em', 'data'], ['dias_vencer', 'Dias para vencer', 'num'], ['indice_correcao', 'Índice de reajuste'], ['cliente_nome', 'Só do cliente'], ['uf_destino', 'UF'],
        ['trechos', 'Trechos', 'num'], ['notas', 'Notas calculadas no período', 'num'], ['frete', 'Frete dessas notas', 'moeda'], ['atualizada', 'Última alteração', 'data']],
      linhas: linhas.map(({ cliente_doc: _a, cliente_por_raiz: _b, descarga_clientes: _c, ativa: _d, ...l }) => l),
      resumo: [['Tabelas', linhas.length], ['Válidas', conta(linhas, (l) => l.situacao === 'Válida')], ['Vencem em até 30 dias', conta(linhas, (l) => l.situacao === 'Vence em até 30 dias')],
        ['Vencidas', conta(linhas, (l) => l.situacao === 'Vencida')], ['Sem validade definida', conta(linhas, (l) => l.situacao === 'Sem validade definida')], ['Inativas', conta(linhas, (l) => l.situacao === 'Inativa')]],
    };
  }
  const docFmt = (d) => { const x = String(d || '').replace(/\D/g, ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
  async function restricao(req, q, de, ate) {
    const todas = await tabelas(req, q, de, ate);
    const linhas = [];
    for (const t of todas) {
      if (t.cliente_doc) {
        linhas.push({ transportadora: t.transportadora, tabela: t.tabela, restricao: t.cliente_por_raiz && String(t.cliente_doc).length === 14 ? 'Só do cliente e das filiais (raiz do CNPJ)' : 'Só deste cliente (CNPJ/CPF)',
          pessoa: t.cliente_nome || '', documento: docFmt(t.cliente_doc), doc: t.cliente_doc, raiz: !!t.cliente_por_raiz, situacao: t.situacao, vence_em: t.vence_em, notas: t.notas, frete: t.frete });
      }
      const desc = String(t.descarga_clientes || '').split(/[\n;,]+/).map((x) => x.trim()).filter(Boolean);
      if (desc.length) {
        linhas.push({ transportadora: t.transportadora, tabela: t.tabela, restricao: 'Taxa de descarga só para estes clientes', pessoa: desc.join(', '), documento: null,
          situacao: t.situacao, vence_em: t.vence_em, notas: t.notas, frete: t.frete });
      }
    }
    // Notas do período de cada pessoa com tabela própria (quanto o cliente usa).
    const docs = linhas.filter((l) => l.doc);
    if (docs.length) {
      const { rows } = await consulta(req, `SELECT regexp_replace(COALESCE(f.cliente_documento, ''), '\\D', '', 'g') AS doc, COUNT(*)::int AS n FROM fretes f
        WHERE ${BASE} AND ${EMITIDAS} GROUP BY 1`, [de, ate]);
      docs.forEach((l) => { l.notas_cliente = rows.filter((r) => r.doc === l.doc || (l.raiz && r.doc.length === 14 && r.doc.slice(0, 8) === l.doc.slice(0, 8))).reduce((t, r) => t + r.n, 0); });
    }
    const pessoas = new Set(docs.map((l) => l.raiz ? l.doc.slice(0, 8) : l.doc));
    return {
      colunas: [['transportadora', 'Transportadora'], ['tabela', 'Tabela'], ['restricao', 'Restrição'], ['pessoa', 'Pessoa'], ['documento', 'CNPJ/CPF'], ['situacao', 'Situação da tabela', 'confere'],
        ['vence_em', 'Vence em', 'data'], ['notas_cliente', 'Notas do cliente no período', 'num'], ['notas', 'Notas calculadas com a tabela', 'num'], ['frete', 'Frete dessas notas', 'moeda']],
      linhas: linhas.map(({ doc: _a, raiz: _b, ...l }) => l),
      resumo: [['Tabelas com restrição', new Set(linhas.map((l) => `${l.transportadora}|${l.tabela}`)).size], ['Pessoas com tabela própria', pessoas.size],
        ['Tabelas gerais (sem restrição)', conta(todas, (t) => !t.cliente_doc)], ['Restrições em tabela vencida ou inativa', conta(linhas, (l) => ['Vencida', 'Inativa'].includes(l.situacao))]],
    };
  }

  // 96 ---------------------------------------------------------------------------------------------------------------
  async function doca(req, q, de, ate) {
    soTodos(req);
    const p = [de, ate]; const cond = [];
    if (String(q.transportadora || '').trim()) { p.push(String(q.transportadora).trim()); cond.push(`v.transportadora ILIKE '%' || $${p.length} || '%'`); }
    const min = (a, b) => `AVG(EXTRACT(EPOCH FROM (${b} - ${a})) / 60.0) FILTER (WHERE ${a} IS NOT NULL AND ${b} >= ${a})`;
    const { rows } = await pool.query(`SELECT COALESCE(d.nome, '(sem doca)') AS grupo, COUNT(*)::int AS visitas,
        COUNT(*) FILTER (WHERE v.operacao = 'carga')::int AS cargas, COUNT(*) FILTER (WHERE v.operacao = 'descarga')::int AS descargas,
        COUNT(*) FILTER (WHERE v.status = 'saiu')::int AS concluidas, COUNT(*) FILTER (WHERE v.status = 'cancelado')::int AS canceladas,
        COUNT(*) FILTER (WHERE v.status = 'nao_compareceu')::int AS nao_compareceu,
        COUNT(*) FILTER (WHERE v.chegada_em > v.previsto_em + make_interval(mins => COALESCE(v.janela_min, 0) + 15))::int AS atrasadas,
        ${min('v.chegada_em', 'v.chamado_em')}::float AS espera, ${min('v.inicio_doca_em', 'v.fim_doca_em')}::float AS na_doca,
        ${min('v.chegada_em', 'v.saida_em')}::float AS no_patio,
        COALESCE(SUM(EXTRACT(EPOCH FROM (v.fim_doca_em - v.inicio_doca_em)) / 3600.0) FILTER (WHERE v.fim_doca_em >= v.inicio_doca_em), 0)::float AS horas,
        COALESCE(SUM(v.volumes), 0)::int AS volumes, COALESCE(SUM(v.peso_kg), 0)::float AS peso
      FROM patio_visitas v LEFT JOIN patio_docas d ON d.id = v.doca_id
      WHERE COALESCE(v.chegada_em, v.previsto_em) >= $1::date AND COALESCE(v.chegada_em, v.previsto_em) < $2::date + 1${cond.length ? ` AND ${cond.join(' AND ')}` : ''}
      GROUP BY 1 ORDER BY 2 DESC`, p);
    const linhas = rows.map((r) => ({ ...r, espera: r2(r.espera), na_doca: r2(r.na_doca), no_patio: r2(r.no_patio), horas: r2(r.horas) }));
    const media = (k) => div(linhas.reduce((t, l) => t + (l[k] || 0) * l.concluidas, 0), linhas.filter((l) => l[k] != null).reduce((t, l) => t + l.concluidas, 0));
    return {
      colunas: [['grupo', 'Doca'], ['visitas', 'Visitas', 'num'], ['cargas', 'Carregamentos', 'num'], ['descargas', 'Descargas', 'num'], ['concluidas', 'Concluídas', 'num'],
        ['atrasadas', 'Chegaram atrasadas', 'num'], ['nao_compareceu', 'Não compareceram', 'num'], ['canceladas', 'Canceladas', 'num'], ['espera', 'Espera até a doca (min)', 'dec'],
        ['na_doca', 'Tempo na doca (min)', 'dec'], ['no_patio', 'Tempo no pátio (min)', 'dec'], ['horas', 'Horas de doca ocupada', 'dec'], ['volumes', 'Volumes', 'num'], ['peso', 'Peso (kg)', 'dec']],
      linhas, agrupado: true,
      resumo: [['Visitas', soma(linhas, 'visitas')], ['Concluídas', soma(linhas, 'concluidas')], ['Espera média (min)', media('espera'), 'dec'], ['Tempo médio na doca (min)', media('na_doca'), 'dec'],
        ['Chegaram atrasadas', soma(linhas, 'atrasadas')], ['Não compareceram', soma(linhas, 'nao_compareceu')]],
    };
  }

  // 97 ---------------------------------------------------------------------------------------------------------------
  async function justificativas(req, q, de, ate) {
    const p = [de, ate]; const extra = filtros(q, p);
    const PER = (c) => `${c} >= $1::date AND ${c} < $2::date + 1`;
    const { rows } = await consulta(req, `
      SELECT COALESCE(f.frete_principal_id, f.id) AS id, to_char(f.aprovado_em, 'YYYY-MM-DD"T"HH24:MI') AS em, 'Aprovação do CT-e' AS situacao, f.numero_cte AS cte, ${NF} AS nf, ${TRANSP} AS transportadora,
          f.aprovado_por_nome AS usuario, f.justificativa_aprovacao AS justificativa, ${VALOR}::float AS valor
        FROM fretes f WHERE f.status_aprovacao = 'Aprovado' AND NULLIF(TRIM(f.justificativa_aprovacao), '') IS NOT NULL AND ${PER('f.aprovado_em')}${extra}
      UNION ALL
      SELECT COALESCE(f.frete_principal_id, f.id), to_char(f.aprovado_em, 'YYYY-MM-DD"T"HH24:MI'), 'Reprovação do CT-e', f.numero_cte, ${NF}, ${TRANSP}, f.aprovado_por_nome, f.motivo_rejeicao, ${VALOR}::float
        FROM fretes f WHERE f.status_aprovacao = 'Rejeitado' AND NULLIF(TRIM(f.motivo_rejeicao), '') IS NOT NULL AND ${PER('COALESCE(f.aprovado_em, f.atualizado_em)')}${extra}
      UNION ALL
      SELECT COALESCE(f.frete_principal_id, f.id), to_char(f.glosa_registrada_em, 'YYYY-MM-DD"T"HH24:MI'), 'Glosa', f.numero_cte, ${NF}, ${TRANSP}, f.glosa_registrada_por, f.glosa_motivo, f.glosa_valor::float
        FROM fretes f WHERE COALESCE(f.glosa_valor, 0) > 0 AND f.glosa_registrada_em IS NOT NULL AND ${PER('f.glosa_registrada_em')}${extra}
      ORDER BY 2 DESC LIMIT 5000`, p);
    const linhas = [...rows];
    if (vePotudo(req) && !String(q.cliente || '').trim()) {
      const [{ rows: fat }, { rows: dfe }] = await Promise.all([
        pool.query(`SELECT NULL::int AS id, to_char(COALESCE(conferido_em, data_emissao::timestamp), 'YYYY-MM-DD"T"HH24:MI') AS em, 'Bloqueio de fatura' AS situacao, NULL AS cte, NULL AS nf,
            transportadora, conferido_por_nome AS usuario, bloqueio_motivo AS justificativa, COALESCE(valor_informado, valor_ctes)::float AS valor, numero AS fatura
          FROM faturas_frete WHERE NULLIF(TRIM(bloqueio_motivo), '') IS NOT NULL AND COALESCE(conferido_em, data_emissao::timestamp) >= $1::date AND COALESCE(conferido_em, data_emissao::timestamp) < $2::date + 1`, [de, ate]).catch(() => ({ rows: [] })),
        pool.query(`SELECT NULL::int AS id, to_char(manifestada_em, 'YYYY-MM-DD"T"HH24:MI') AS em, 'Manifestação da NF-e (' || COALESCE(manifestacao, '?') || ')' AS situacao, NULL AS cte,
            SUBSTRING(chave FROM 26 FOR 9) AS nf, emitente_nome AS transportadora, NULL AS usuario, justificativa, valor::float
          FROM dfe_recebidos WHERE NULLIF(TRIM(justificativa), '') IS NOT NULL AND manifestada_em >= $1::date AND manifestada_em < $2::date + 1`, [de, ate]).catch(() => ({ rows: [] })),
      ]);
      linhas.push(...fat.map((f) => ({ ...f, cte: f.fatura ? `Fatura ${f.fatura}` : null })), ...dfe.map((d) => ({ ...d, nf: d.nf ? String(Number(d.nf)) : null })));
      linhas.sort((a, b) => String(b.em).localeCompare(String(a.em)));
    }
    return {
      colunas: [['em', 'Quando', 'datahora'], ['situacao', 'Ação'], ['cte', 'CT-e / fatura'], ['nf', 'NF-e'], ['transportadora', 'Transportadora / emitente'], ['usuario', 'Usuário'],
        ['justificativa', 'Justificativa'], ['valor', 'Valor', 'moeda']],
      linhas: linhas.map(({ fatura: _f, ...l }) => l),
      resumo: [['Ações justificadas', linhas.length], ['Aprovações', conta(linhas, (l) => l.situacao === 'Aprovação do CT-e')], ['Reprovações', conta(linhas, (l) => l.situacao === 'Reprovação do CT-e')],
        ['Glosas', conta(linhas, (l) => l.situacao === 'Glosa')], ['Valor glosado', soma(linhas.filter((l) => l.situacao === 'Glosa'), 'valor'), 'moeda']],
    };
  }

  // 98 ---------------------------------------------------------------------------------------------------------------
  async function porDocumentos(req, q, de, ate) {
    const porDia = (Date.parse(ate) - Date.parse(de)) / 86400000 <= 62;
    const fmt = porDia ? 'YYYY-MM-DD' : 'YYYY-MM';
    const p = [de, ate]; const extra = filtros(q, p);
    const PER = (c) => `${c} >= $1::date AND ${c} < $2::date + 1`;
    const grupo = (c) => `to_char(${c}, '${fmt}')`;
    const contar = async (sql, params = p, escopo = true) => (escopo ? consulta(req, sql, params) : pool.query(sql, params)).then((r) => r.rows).catch(() => []);
    const todos = vePotudo(req) && !String(q.cliente || '').trim();
    const [nfe, cte, apr, rep, comp, oco, fat, edi] = await Promise.all([
      contar(`SELECT ${grupo('f.criado_em')} AS k, COUNT(*)::int AS n FROM fretes f WHERE ${BASE} AND f.chave_nfe IS NOT NULL AND ${PER('f.criado_em')}${extra} GROUP BY 1`),
      contar(`SELECT ${grupo('COALESCE(f.cte_dados_em, f.criado_em)')} AS k, COUNT(*)::int AS n FROM fretes f WHERE f.chave_cte IS NOT NULL AND ${PER('COALESCE(f.cte_dados_em, f.criado_em)')}${extra} GROUP BY 1`),
      contar(`SELECT ${grupo('f.aprovado_em')} AS k, COUNT(*)::int AS n FROM fretes f WHERE f.status_aprovacao = 'Aprovado' AND ${PER('f.aprovado_em')}${extra} GROUP BY 1`),
      contar(`SELECT ${grupo('f.aprovado_em')} AS k, COUNT(*)::int AS n FROM fretes f WHERE f.status_aprovacao = 'Rejeitado' AND ${PER('f.aprovado_em')}${extra} GROUP BY 1`),
      contar(`SELECT ${grupo('f.canhoto_registrado_em')} AS k, COUNT(*)::int AS n FROM fretes f WHERE ${PER('f.canhoto_registrado_em')}${extra} GROUP BY 1`),
      contar(`SELECT ${grupo('o.criado_em')} AS k, COUNT(*)::int AS n FROM ocorrencias_rastreio o JOIN fretes f ON f.id = o.frete_id WHERE ${PER('o.criado_em')}${extra} GROUP BY 1`),
      todos ? contar(`SELECT ${grupo('data_emissao')} AS k, COUNT(*)::int AS n FROM faturas_frete WHERE data_emissao BETWEEN $1::date AND $2::date GROUP BY 1`, [de, ate], false) : [],
      todos ? contar(`SELECT ${grupo('criado_em')} AS k, COUNT(*)::int AS n FROM edi_recebidos WHERE ${PER('criado_em')} GROUP BY 1`, [de, ate], false) : [],
    ]);
    const mapa = new Map();
    const por = (ls, campo) => ls.forEach((r) => { if (!r.k) return; if (!mapa.has(r.k)) mapa.set(r.k, { periodo: r.k, nfe: 0, cte: 0, aprovados: 0, reprovados: 0, comprovantes: 0, ocorrencias: 0, faturas: 0, edi: 0 }); mapa.get(r.k)[campo] = r.n; });
    por(nfe, 'nfe'); por(cte, 'cte'); por(apr, 'aprovados'); por(rep, 'reprovados'); por(comp, 'comprovantes'); por(oco, 'ocorrencias'); por(fat, 'faturas'); por(edi, 'edi');
    const K = ['nfe', 'cte', 'aprovados', 'reprovados', 'comprovantes', 'ocorrencias', 'faturas', 'edi'];
    const linhas = [...mapa.values()].map((l) => ({ ...l, total: K.reduce((t, k) => t + l[k], 0) })).sort((a, b) => b.periodo.localeCompare(a.periodo));
    return {
      colunas: [['periodo', porDia ? 'Dia' : 'Mês', porDia ? 'data' : 'mes'], ['total', 'Documentos', 'num'], ['nfe', 'NF-e recebidas', 'num'], ['cte', 'CT-e recebidos', 'num'],
        ['aprovados', 'CT-e aprovados', 'num'], ['reprovados', 'CT-e reprovados', 'num'], ['comprovantes', 'Comprovantes de entrega', 'num'], ['ocorrencias', 'Ocorrências', 'num'],
        ...(todos ? [['faturas', 'Faturas', 'num'], ['edi', 'Arquivos EDI', 'num']] : [])],
      linhas, agrupado: true,
      resumo: [['Documentos', soma(linhas, 'total')], ['NF-e', soma(linhas, 'nfe')], ['CT-e', soma(linhas, 'cte')], ['CT-e decididos', soma(linhas, 'aprovados') + soma(linhas, 'reprovados')],
        [porDia ? 'Média por dia' : 'Média por mês', div(soma(linhas, 'total'), linhas.length), 'dec']],
    };
  }

  // 99 ---------------------------------------------------------------------------------------------------------------
  async function pendencias(req, q) {
    const p = []; const extra = filtros(q, p);
    const hoje = hojeSP();
    const { rows } = await consulta(req, `
      (SELECT f.id, 'Nota sem CT-e' AS situacao, 'NF ' || f.numero_nf AS documento, ${TRANSP} AS transportadora, f.cliente, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS desde,
          f.valor_faturado::float AS valor, 'Emitida e sem o CT-e da transportadora' AS detalhe FROM fretes f WHERE ${SEM_CTE}${extra} LIMIT 2000)
      UNION ALL
      (SELECT COALESCE(f.frete_principal_id, f.id), 'CT-e retido na auditoria', 'CT-e ' || f.numero_cte, ${TRANSP}, f.cliente, to_char(${DATA}, 'YYYY-MM-DD'), ${VALOR}::float,
          COALESCE(NULLIF(f.motivo_conferencia, ''), 'Divergência com a tabela') FROM fretes f WHERE f.status = 'Frete Retido' AND f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE${extra} LIMIT 2000)
      UNION ALL
      (SELECT f.id, 'CT-e sem nota', 'CT-e ' || f.numero_cte, ${TRANSP}, f.cte_destinatario_nome, to_char(${DATA}, 'YYYY-MM-DD'), ${VALOR}::float, 'A nota do CT-e não foi encontrada'
        FROM fretes f WHERE ${CTE_SEM_NOTA}${extra} LIMIT 2000)
      UNION ALL
      (SELECT f.id, 'Entrega atrasada', 'NF ' || f.numero_nf, ${TRANSP}, f.cliente, to_char(f.data_entrega_prevista, 'YYYY-MM-DD'), f.valor_faturado::float,
          COALESCE('Última ocorrência: ' || NULLIF(f.rastreio_ultima_ocorrencia, ''), 'Sem ocorrência da transportadora') FROM fretes f
        WHERE ${BASE} AND ${ABERTA} AND f.data_entrega_prevista < CURRENT_DATE AND f.data_emissao_nf >= CURRENT_DATE - 180${extra} LIMIT 2000)`, p);
    const linhas = [...rows];
    if (vePotudo(req) && !String(q.cliente || '').trim()) {
      const [{ rows: fat }, { rows: edi }, { rows: cont }] = await Promise.all([
        pool.query(`SELECT CASE WHEN situacao = 'bloqueada' THEN 'Fatura bloqueada' ELSE 'Fatura vencida sem pagamento' END AS situacao, 'Fatura ' || numero AS documento, transportadora,
            to_char(CASE WHEN situacao = 'bloqueada' THEN data_emissao ELSE data_vencimento END, 'YYYY-MM-DD') AS desde, COALESCE(valor_informado, valor_ctes)::float AS valor,
            COALESCE(NULLIF(bloqueio_motivo, ''), 'Venceu em ' || to_char(data_vencimento, 'DD/MM/YYYY')) AS detalhe
          FROM faturas_frete WHERE pago_em IS NULL AND (situacao = 'bloqueada' OR data_vencimento < CURRENT_DATE) LIMIT 2000`).catch(() => ({ rows: [] })),
        pool.query(`SELECT CASE WHEN status = 'erro' THEN 'Arquivo EDI com erro' ELSE 'Arquivo EDI aguardando conferência' END AS situacao, COALESCE(tipo, 'EDI') || ' ' || COALESCE(nome_arquivo, '') AS documento,
            COALESCE(NULLIF(nome_emissor, ''), cnpj_emissor) AS transportadora, to_char(criado_em, 'YYYY-MM-DD') AS desde, COALESCE(mensagem, 'Abra na tela EDI') AS detalhe
          FROM edi_recebidos WHERE status IN ('aguardando', 'erro') LIMIT 2000`).catch(() => ({ rows: [] })),
        pool.query(`SELECT 'Contestação sem resposta' AS situacao, 'Contestação #' || id AS documento, transportadora, to_char(enviada_em, 'YYYY-MM-DD') AS desde, valor_contestado::float AS valor,
            CASE WHEN prazo_resposta < CURRENT_DATE THEN 'Prazo de resposta vencido em ' || to_char(prazo_resposta, 'DD/MM/YYYY') ELSE 'Aguardando a transportadora' END AS detalhe
          FROM contestacoes WHERE status = 'enviada' AND respondida_em IS NULL LIMIT 2000`).catch(() => ({ rows: [] })),
      ]);
      const filtroT = (l) => !String(q.transportadora || '').trim() || mesmoNome(l.transportadora, q.transportadora);
      linhas.push(...[...fat, ...edi, ...cont].filter(filtroT).map((l) => ({ id: null, cliente: null, valor: null, ...l })));
    }
    const ls = linhas.map((l) => ({ ...l, dias: dias(l.desde, hoje) })).sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
    const tipos = [...new Set(ls.map((l) => l.situacao))];
    return {
      colunas: [['situacao', 'Pendência'], ['documento', 'Documento'], ['transportadora', 'Transportadora'], ['cliente', 'Cliente'], ['desde', 'Desde', 'data'], ['dias', 'Dias', 'num'],
        ['valor', 'Valor', 'moeda'], ['detalhe', 'Detalhe']],
      linhas: ls,
      resumo: [['Pendências', ls.length], ...tipos.slice(0, 5).map((t) => [t, conta(ls, (l) => l.situacao === t)]), ['Mais de 30 dias', conta(ls, (l) => l.dias > 30)]],
    };
  }

  // 106 --------------------------------------------------------------------------------------------------------------
  async function transportadoraDoMapa(req, q, de, ate) {
    const tm = require('./transportadoraMapa');
    const p = [de, ate]; const extra = filtros(q, p);
    const { rows } = await consulta(req, `SELECT f.id, f.numero_nf, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS emissao, to_char(f.data_coleta, 'YYYY-MM-DD') AS coleta,
        f.numero_mapa, f.cliente, f.cidade, f.uf, COALESCE(f.transportadora_nfe, f.pre_nota->>'transportadora') AS transp_nf,
        f.mapa_transportadora AS transp_mapa, f.mapa_transportadora_cnpj, f.transportadora_cte AS transp_cte, f.transportadora_cnpj_cte, f.numero_cte,
        to_char(f.data_entrega_prevista, 'YYYY-MM-DD') AS previsao, (f.mapa_sem_tabela AND f.carga_direta IS NOT TRUE) AS sem_tabela
      FROM fretes f WHERE ${BASE} AND (f.mapa_transportadora IS NOT NULL OR f.mapa_transportadora_cnpj IS NOT NULL)
        AND COALESCE(f.data_coleta, f.data_emissao_nf) BETWEEN $1 AND $2${extra}
      ORDER BY COALESCE(f.data_coleta, f.data_emissao_nf) DESC, f.numero_nf DESC LIMIT 5001`, p);
    const linhas = rows.map((l) => ({
      ...l, destino: [l.cidade, l.uf].filter(Boolean).join('/'),
      situacao: tm.situacao({ nf: { nome: l.transp_nf }, mapa: { nome: l.transp_mapa, cnpj: l.mapa_transportadora_cnpj }, cte: { nome: l.transp_cte, cnpj: l.transportadora_cnpj_cte } })
        + (l.sem_tabela ? ' · sem tabela: carga direta?' : ''),
    }));
    const qs = (t) => conta(linhas, (l) => l.situacao.split(' · ')[0] === t);
    return {
      colunas: [['numero_nf', 'NF'], ['situacao', 'Situação'], ['coleta', 'Coleta', 'data'], ['numero_mapa', 'Mapa'], ['cliente', 'Cliente'], ['destino', 'Destino'],
        ['transp_nf', 'Na NF-e'], ['transp_mapa', 'Coletou (mapa)'], ['transp_cte', 'No CT-e'], ['previsao', 'Previsão', 'data']],
      linhas,
      resumo: [['Notas com mapa', linhas.length], ['CT-e de outra transportadora', qs('CT-e de outra transportadora')],
        ['Saiu por outra (NF-e ≠ mapa)', conta(linhas, (l) => l.situacao.startsWith('Saiu por outra'))], ['Aguardando CT-e', conta(linhas, (l) => /aguardando CT-e/i.test(l.situacao))],
        ['Confere', qs('Confere')], ['Sem tabela: carga direta?', conta(linhas, (l) => l.sem_tabela)]],
    };
  }

  const T = 'operacional';
  return {
    87: { titulo: 'Comparativo entre nota fiscal e pré-nota fiscal', grupo: 'Notas e CT-e', tela: T, rodar: preNota,
      desc: 'Cada NF-e emitida no período comparada com a pré-nota (o pedido que o ERP mandou na planilha antes da nota): valor, volumes, peso, transportadora, destino e cliente. Só entram as notas que chegaram depois de a planilha do ERP ser importada.' },
    88: { titulo: 'Comparativo de fretes', grupo: 'Notas e CT-e', tela: T, rodar: async () => ({ colunas: [], linhas: [] }),
      atalho: { pagina: 'relatorios-auditoria', numero: 13, rotulo: '13 · Frete contratado × cobrado (327)' },
      desc: 'Abre o relatório 13 · Frete contratado × cobrado (Relatórios de auditoria), que compara o frete da tabela com o cobrado em cada CT-e.' },
    89: { titulo: 'Transportadoras que possuem arquivos pendentes', grupo: 'Arquivos e integração', tela: T, semPeriodo: true, rodar: arquivosPendentes,
      detalhe: (req, q, de, ate, v) => listaNotas(req, q, `${SEM_CTE} AND COALESCE(${TRANSP}, '') = $1`, [v], { ordem: 'f.data_emissao_nf, f.numero_nf' }),
      desc: 'Hoje, por transportadora: notas CIF emitidas há mais de 3 dias (até 120) ainda sem o CT-e, CT-e sem a nota e arquivos EDI parados (aguardando conferência ou com erro). Dois cliques mostram as notas sem CT-e.' },
    90: { titulo: 'Relação de conhecimentos de frete', grupo: 'Notas e CT-e', tela: T, rodar: conhecimentos,
      desc: 'Todos os CT-e do período (data do CT-e), inclusive os cancelados: tomador, remetente, destinatário, trecho, nota, tipo, valor, valor pela tabela, diferença, glosa, situação (auditoria, fatura, pagamento) e a chave.' },
    91: { titulo: 'Relação de integração de conhecimentos de frete', grupo: 'Arquivos e integração', tela: T, rodar: integracao,
      desc: 'Cada CT-e que entrou no período: quando, por onde (envio manual, e-mail, SEFAZ, pasta de XML, NF-Stock) e quem enviou, e quantos dias depois da emissão ele chegou.' },
    92: { titulo: 'Produtividade de resolução de pendência', grupo: 'Pendências', tela: T, rodar: produtividade,
      desc: 'O que cada usuário resolveu no período: CT-e aprovados e reprovados, glosas, faturas conferidas e decididas, arquivos EDI tratados, contestações abertas, e quantos dias, em média, entre o CT-e chegar e a decisão.' },
    93: { titulo: 'Vigência de tabela de frete', grupo: 'Tabelas de frete', tela: T, rodar: vigencia,
      desc: 'Cada tabela de preço: vigente desde, validade, quando vence, quantos dias faltam, o índice de reajuste e quantas notas do período foram calculadas com ela. Situação: válida, vence em até 30 dias, vencida, sem validade ou inativa.' },
    94: { titulo: 'Possibilidade de agrupamento de CT-e', grupo: 'Notas e CT-e', tela: T, rodar: async () => ({ colunas: [], linhas: [] }),
      atalho: { destino: 'r:consolidacao', rotulo: 'Consolidar rotas (314)' },
      desc: 'Abre a tela Consolidar rotas (314), que junta as notas que vão para o mesmo destino e mostra quanto custaria um CT-e só.' },
    95: { titulo: 'Restrição pessoa tabela de frete', grupo: 'Tabelas de frete', tela: T, rodar: restricao,
      desc: 'As tabelas de preço que valem só para uma pessoa (o CNPJ/CPF do cliente, ou todas as filiais pela raiz do CNPJ) e as que cobram descarga só de alguns clientes, com a situação da tabela e quanto o cliente usa.' },
    96: { titulo: 'Operação doca', grupo: 'Pátio', tela: T, rodar: doca,
      desc: 'Por doca (Pátio e portaria), no período: visitas, carregamentos e descargas, atrasos, não comparecimentos, espera até a doca, tempo na doca e no pátio e as horas de doca ocupada.' },
    97: { titulo: 'Relação de justificativas de ação', grupo: 'Pendências', tela: T, rodar: justificativas,
      desc: 'Cada ação com justificativa no período: aprovação e reprovação de CT-e, glosa, bloqueio de fatura e manifestação de NF-e, com quem fez, quando e o motivo escrito.' },
    98: { titulo: 'Operação por documentos', grupo: 'Pendências', tela: T, rodar: porDocumentos,
      desc: 'Quantos documentos a operação tratou por dia (período de até 62 dias) ou por mês: NF-e e CT-e recebidos, CT-e aprovados e reprovados, comprovantes, ocorrências, faturas e arquivos EDI.' },
    106: { titulo: 'Transportadora do mapa × NF-e × CT-e', grupo: 'Notas e CT-e', tela: T, rodar: transportadoraDoMapa,
      desc: 'Notas com mapa de carregamento no período (data da coleta): a transportadora que está na NF-e, a que de fato coletou (TRANSPORTADORA_MAPA da planilha Timeline de pedidos) e a do CT-e. Situação: confere, saiu por outra (a NF-e cita uma e coletou outra), CT-e de outra transportadora (o CT-e não é de quem coletou) e aguardando CT-e, com a previsão de entrega.' },
    99: { titulo: 'Relação de pendências', grupo: 'Pendências', tela: T, semPeriodo: true, rodar: pendencias,
      desc: 'Tudo o que está pendente hoje, da mais antiga para a mais nova: notas sem CT-e, CT-e retidos, CT-e sem nota, entregas atrasadas, faturas bloqueadas ou vencidas, arquivos EDI parados e contestações sem resposta.' },
  };
};
module.exports.divergencias = divergencias;
module.exports.origemCte = origemCte;
