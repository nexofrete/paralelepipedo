// Relatórios e indicadores do embarcador num painel só: quanto foi contratado,
// pago e falta pagar; gasto por transportadora, cliente, região, estado,
// modalidade e mês; entregas (entregues, pendentes, atrasadas, hoje, próximos
// 7 dias) e pontualidade; ocorrências; e a economia que a auditoria trouxe.
// Tudo respeita o cliente do usuário (consultaCliente) e o período escolhido
// (pela emissão do CT-e; sem CT-e, pela emissão da nota).
const { consultaCliente, vePotudo } = require('./permissoes');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

const REGIOES = {
  Norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MS', 'MT'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};
const regiaoDaUf = (uf) => Object.keys(REGIOES).find((r) => REGIOES[r].includes(String(uf || '').toUpperCase())) || 'Sem UF';
const MODAIS = { '01': 'Rodoviário', '02': 'Aéreo', '03': 'Aquaviário', '04': 'Ferroviário', '05': 'Dutoviário', '06': 'Multimodal' };
const SERVICOS = { 0: 'Normal', 1: 'Subcontratação', 2: 'Redespacho', 3: 'Redespacho intermediário', 4: 'Serviço vinculado a multimodal' };

function periodo({ de, ate } = {}) {
  const fim = iso(ate) || hojeBr();
  const ini = iso(de) || `${fim.slice(0, 7)}-01`;
  if (ini > fim) throw falha('O início do período é depois do fim.');
  return { de: ini, ate: fim };
}

// Valor do CT-e (ou o negociado, enquanto o CT-e não chega) e o que a tabela dizia que era devido.
const VALOR = 'COALESCE(f.valor_total_cte, f.valor_frete_negociado, 0)';
const DEVIDO = 'COALESCE(f.valor_total_frete, f.valor_total_calculado)';
const DATA = 'COALESCE(f.data_emissao_cte, f.data_emissao_nf)';
// CT-e que conta como frete contratado (sem os cancelados, os que não são da empresa e os que a auditoria barrou).
const CONTA = `f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE AND f.cte_nao_levou IS NOT TRUE AND COALESCE(f.status_aprovacao, '') <> 'Rejeitado'
  AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')`;

// Situação do pagamento de cada CT-e: pago (fatura com pagamento), faturado (na fatura, a pagar),
// liberado (conferido, sem fatura), em conferência ou retido.
const SITUACAO = `CASE WHEN ff.pago_em IS NOT NULL THEN 'pago' WHEN f.fatura_id IS NOT NULL OR f.status = 'Faturado' THEN 'faturado'
  WHEN f.status = 'Frete Retido' THEN 'retido' WHEN f.status IN ('Liberado p/ Pagamento', 'Conferido') OR f.status_aprovacao = 'Aprovado' THEN 'liberado' ELSE 'conferencia' END`;

function somar(linhas, chave) {
  const mapa = new Map();
  for (const l of linhas) {
    const k = chave(l);
    const a = mapa.get(k) || { chave: k, ctes: 0, contratado: 0, pago: 0, pendente: 0, peso: 0, valor_nf: 0 };
    a.ctes += 1; a.contratado += l.valor; a.peso += l.peso; a.valor_nf += l.valor_nf;
    if (l.situacao === 'pago') a.pago += l.valor; else a.pendente += l.valor;
    mapa.set(k, a);
  }
  return [...mapa.values()].map((a) => ({ ...a, contratado: r2(a.contratado), pago: r2(a.pago), pendente: r2(a.pendente), peso: r2(a.peso), valor_nf: r2(a.valor_nf),
    percentual_nf: a.valor_nf ? r2((a.contratado / a.valor_nf) * 100) : null, por_kg: a.peso ? Math.round((a.contratado / a.peso) * 10000) / 10000 : null }))
    .sort((x, y) => y.contratado - x.contratado);
}

async function painel(req, q = {}) {
  const { de, ate } = periodo(q);
  const hoje = hojeBr();
  const filtroTransp = String(q.transportadora || '').trim();
  const params = [de, ate];
  let extra = '';
  if (filtroTransp) { params.push(filtroTransp); extra = ` AND COALESCE(f.transportadora_cte, f.transportadora) = $${params.length}`; }

  // ---------- Fretes (CT-e) do período ----------
  const { rows: ctes } = await consultaCliente(req,
    `SELECT f.id, ${VALOR}::float AS valor, COALESCE(f.peso_kg, 0)::float AS peso, CASE WHEN f.frete_principal_id IS NULL THEN COALESCE(f.valor_faturado, 0) ELSE 0 END::float AS valor_nf,
            COALESCE(f.transportadora_cte, f.transportadora, 'Sem transportadora') AS transportadora, COALESCE(f.cliente, 'Sem cliente') AS cliente,
            UPPER(COALESCE(f.uf_fim_cte, f.uf, '')) AS uf, to_char(${DATA}, 'YYYY-MM') AS mes,
            substring(f.xml_cte_original from '<modal>(\\d+)</modal>') AS modal, f.tp_serv_cte, f.frete_cif_fob, f.carga_direta, f.redespacho, f.frete_principal_id,
            ${SITUACAO} AS situacao
       FROM fretes f LEFT JOIN faturas_frete ff ON ff.id = f.fatura_id
      WHERE ${CONTA} AND ${DATA} BETWEEN $1::date AND $2::date${extra}`, params);

  const total = (sit) => r2(ctes.filter((c) => !sit || (Array.isArray(sit) ? sit.includes(c.situacao) : c.situacao === sit)).reduce((s, c) => s + c.valor, 0));
  const qtd = (sit) => ctes.filter((c) => c.situacao === sit).length;
  const financeiro = {
    contratado: total(), ctes: ctes.length, pago: total('pago'), qtd_pago: qtd('pago'),
    pendente: total(['faturado', 'liberado', 'conferencia', 'retido']),
    faturado: total('faturado'), qtd_faturado: qtd('faturado'), liberado: total('liberado'), qtd_liberado: qtd('liberado'),
    conferencia: total('conferencia'), qtd_conferencia: qtd('conferencia'), retido: total('retido'), qtd_retido: qtd('retido'),
    valor_nf: r2(ctes.reduce((s, c) => s + c.valor_nf, 0)), peso: r2(ctes.reduce((s, c) => s + c.peso, 0)),
  };
  financeiro.percentual_nf = financeiro.valor_nf ? r2((financeiro.contratado / financeiro.valor_nf) * 100) : null;

  const modalidade = {
    modal: somar(ctes, (c) => MODAIS[c.modal] || (c.modal ? `Modal ${c.modal}` : 'Rodoviário (sem XML)')),
    servico: somar(ctes, (c) => SERVICOS[c.tp_serv_cte] ?? 'Normal'),
    carga: somar(ctes, (c) => (c.carga_direta ? 'Lotação / carga direta' : 'Fracionada')),
    cif_fob: somar(ctes, (c) => (c.frete_cif_fob ? String(c.frete_cif_fob).toUpperCase() : 'Não informado')),
    entrega: somar(ctes, (c) => (c.frete_principal_id ? 'Reentrega / complementar' : c.redespacho ? 'Via redespacho' : 'Direta')),
  };

  // ---------- Entregas (por nota) ----------
  const NOTA = `f.frete_principal_id IS NULL AND f.nf_cancelada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE AND f.nf_retornou IS NOT TRUE AND f.nf_entrada IS NOT TRUE
    AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')${extra}`;
  const { rows: [ent] } = await consultaCliente(req,
    `SELECT COUNT(*) FILTER (WHERE f.data_entrega BETWEEN $1::date AND $2::date)::int AS entregues,
            COUNT(*) FILTER (WHERE f.data_entrega BETWEEN $1::date AND $2::date AND f.data_entrega_prevista IS NOT NULL)::int AS com_prazo,
            COUNT(*) FILTER (WHERE f.data_entrega BETWEEN $1::date AND $2::date AND f.data_entrega <= f.data_entrega_prevista)::int AS no_prazo,
            COALESCE(AVG(f.data_entrega - f.data_entrega_prevista) FILTER (WHERE f.data_entrega BETWEEN $1::date AND $2::date AND f.data_entrega > f.data_entrega_prevista), 0)::float AS atraso_medio,
            COUNT(*) FILTER (WHERE f.data_entrega IS NULL)::int AS pendentes,
            COUNT(*) FILTER (WHERE f.data_entrega IS NULL AND f.data_entrega_prevista < $${params.length + 1}::date)::int AS atrasadas,
            COUNT(*) FILTER (WHERE f.data_entrega IS NULL AND f.data_entrega_prevista = $${params.length + 1}::date)::int AS hoje,
            COUNT(*) FILTER (WHERE f.data_entrega IS NULL AND f.data_entrega_prevista BETWEEN $${params.length + 1}::date + 1 AND $${params.length + 1}::date + 7)::int AS proximos_7,
            COUNT(*) FILTER (WHERE f.data_entrega IS NULL AND f.data_entrega_prevista IS NULL)::int AS sem_previsao
       FROM fretes f WHERE ${NOTA} AND (f.data_entrega IS NULL OR f.data_entrega BETWEEN $1::date AND $2::date)`, [...params, hoje]);
  ent.pontualidade = ent.com_prazo ? Math.round((ent.no_prazo / ent.com_prazo) * 1000) / 10 : null;
  ent.atraso_medio = Math.round(ent.atraso_medio * 10) / 10;
  const { rows: pontTransp } = await consultaCliente(req,
    `SELECT COALESCE(f.transportadora_cte, f.transportadora, 'Sem transportadora') AS chave, COUNT(*)::int AS entregues,
            COUNT(*) FILTER (WHERE f.data_entrega_prevista IS NOT NULL)::int AS com_prazo, COUNT(*) FILTER (WHERE f.data_entrega <= f.data_entrega_prevista)::int AS no_prazo
       FROM fretes f WHERE ${NOTA} AND f.data_entrega BETWEEN $1::date AND $2::date GROUP BY 1`, params);
  const { rows: abertasTransp } = await consultaCliente(req,
    `SELECT COALESCE(f.transportadora_cte, f.transportadora, 'Sem transportadora') AS chave, COUNT(*)::int AS pendentes,
            COUNT(*) FILTER (WHERE f.data_entrega_prevista < $${params.length + 1}::date)::int AS atrasadas
       FROM fretes f WHERE $1::date <= $2::date AND ${NOTA} AND f.data_entrega IS NULL GROUP BY 1`, [...params, hoje]);

  // ---------- Ocorrências ----------
  const { rows: ocs } = await consultaCliente(req,
    `SELECT COALESCE(NULLIF(o.ocorrencia, ''), NULLIF(o.tipo, ''), 'Sem descrição') AS ocorrencia, COALESCE(f.transportadora_cte, f.transportadora, 'Sem transportadora') AS transportadora,
            to_char(o.data_hora, 'YYYY-MM') AS mes, COUNT(*)::int AS qtd
       FROM ocorrencias_rastreio o JOIN fretes f ON f.id = o.frete_id
      WHERE o.data_hora::date BETWEEN $1::date AND $2::date
        AND (o.tipo IS NULL OR o.tipo NOT ILIKE ANY (ARRAY['%entreg%', '%transit%', '%transfer%', '%coleta%', '%emiss%', '%saida%', '%saída%', '%chegada%']))
        AND COALESCE(o.ocorrencia, '') !~* '(entrega realizada|entregue|em tr[aâ]nsito|saiu para entrega|chegada|transfer[eê]ncia|coletad|emitid)'${extra}
      GROUP BY 1, 2, 3`, params);
  const { rows: [extrasOc] } = await consultaCliente(req,
    `SELECT COUNT(*) FILTER (WHERE f.frete_principal_id IS NOT NULL AND ${DATA} BETWEEN $1::date AND $2::date)::int AS reentregas,
            COUNT(*) FILTER (WHERE f.rastreio_problema AND f.data_entrega IS NULL)::int AS com_problema_agora
       FROM fretes f WHERE f.cte_cancelado IS NOT TRUE${extra}`, params);
  // Sinistros não têm cliente: só quem vê todos os fretes vê o total.
  const { rows: sins } = !vePotudo(req) ? { rows: [] } : await consultaCliente(req,
    `SELECT COUNT(*)::int AS qtd, COALESCE(SUM(valor_prejuizo), 0)::float AS prejuizo, COALESCE(SUM(valor_ressarcido) FILTER (WHERE ressarcido), 0)::float AS ressarcido
       FROM sinistros WHERE COALESCE(data_ocorrencia, criado_em::date) BETWEEN $1::date AND $2::date${filtroTransp ? ' AND transportadora = $3' : ''}`, params);
  const agrupar = (campo) => [...ocs.reduce((m, o) => m.set(o[campo], (m.get(o[campo]) || 0) + o.qtd), new Map())].map(([chave, qtdOc]) => ({ chave, qtd: qtdOc })).sort((a, b) => b.qtd - a.qtd);
  const ocorrencias = { total: ocs.reduce((s, o) => s + o.qtd, 0), por_tipo: agrupar('ocorrencia').slice(0, 30), por_transportadora: agrupar('transportadora'), por_mes: agrupar('mes').sort((a, b) => a.chave.localeCompare(b.chave)),
    reentregas: extrasOc.reentregas, com_problema_agora: extrasOc.com_problema_agora, sinistros: sins[0]?.qtd || 0, sinistros_prejuizo: r2(sins[0]?.prejuizo), sinistros_ressarcido: r2(sins[0]?.ressarcido) };

  // ---------- Economia da auditoria ----------
  // Confirmada: glosas + CT-e barrados (recusados ou da transportadora que não levou a carga, cobrança em dobro).
  // Em apuração: o excesso dos CT-e retidos sobre o valor devido pela tabela.
  const { rows: eco } = await consultaCliente(req,
    `SELECT COALESCE(f.transportadora_cte, f.transportadora, 'Sem transportadora') AS transportadora, to_char(${DATA}, 'YYYY-MM') AS mes,
            COALESCE(SUM(f.glosa_valor) FILTER (WHERE f.cte_cancelado IS NOT TRUE), 0)::float AS glosas,
            COUNT(*) FILTER (WHERE f.glosa_valor > 0 AND f.cte_cancelado IS NOT TRUE)::int AS qtd_glosas,
            COALESCE(SUM(COALESCE(f.valor_total_cte, 0)) FILTER (WHERE f.cte_cancelado IS NOT TRUE AND (f.cte_nao_levou OR f.status_aprovacao = 'Rejeitado')), 0)::float AS barrados,
            COUNT(*) FILTER (WHERE f.cte_cancelado IS NOT TRUE AND (f.cte_nao_levou OR f.status_aprovacao = 'Rejeitado'))::int AS qtd_barrados,
            COALESCE(SUM(GREATEST(COALESCE(f.valor_total_cte, 0) - ${DEVIDO}, 0)) FILTER (WHERE f.status = 'Frete Retido' AND ${DEVIDO} IS NOT NULL AND f.cte_cancelado IS NOT TRUE), 0)::float AS em_apuracao,
            COUNT(*) FILTER (WHERE f.status = 'Frete Retido' AND f.cte_cancelado IS NOT TRUE)::int AS qtd_retidos
       FROM fretes f WHERE f.chave_cte IS NOT NULL AND ${DATA} BETWEEN $1::date AND $2::date${extra} GROUP BY 1, 2`, params);
  const somaEco = (linhas) => {
    const s = linhas.reduce((a, l) => ({ glosas: a.glosas + l.glosas, qtd_glosas: a.qtd_glosas + l.qtd_glosas, barrados: a.barrados + l.barrados, qtd_barrados: a.qtd_barrados + l.qtd_barrados,
      em_apuracao: a.em_apuracao + l.em_apuracao, qtd_retidos: a.qtd_retidos + l.qtd_retidos }), { glosas: 0, qtd_glosas: 0, barrados: 0, qtd_barrados: 0, em_apuracao: 0, qtd_retidos: 0 });
    return { ...s, glosas: r2(s.glosas), barrados: r2(s.barrados), em_apuracao: r2(s.em_apuracao), economizado: r2(s.glosas + s.barrados) };
  };
  const ecoPor = (campo) => [...new Set(eco.map((l) => l[campo]))].map((k) => ({ chave: k, ...somaEco(eco.filter((l) => l[campo] === k)) })).filter((l) => l.economizado || l.em_apuracao);
  const economia = { ...somaEco(eco), por_transportadora: ecoPor('transportadora').sort((a, b) => b.economizado - a.economizado), por_mes: ecoPor('mes').sort((a, b) => a.chave.localeCompare(b.chave)) };
  economia.percentual = financeiro.contratado + economia.economizado ? r2((economia.economizado / (financeiro.contratado + economia.economizado)) * 100) : null;

  // ---------- Por transportadora (tudo junto) ----------
  const porTransp = somar(ctes, (c) => c.transportadora).map((t) => {
    const p = pontTransp.find((x) => x.chave === t.chave) || {};
    const a = abertasTransp.find((x) => x.chave === t.chave) || {};
    const e = economia.por_transportadora.find((x) => x.chave === t.chave) || {};
    return { ...t, entregues: p.entregues || 0, pontualidade: p.com_prazo ? Math.round((p.no_prazo / p.com_prazo) * 1000) / 10 : null, pendentes: a.pendentes || 0, atrasadas: a.atrasadas || 0,
      ocorrencias: ocorrencias.por_transportadora.find((x) => x.chave === t.chave)?.qtd || 0, economizado: e.economizado || 0 };
  });

  const porUf = somar(ctes, (c) => c.uf || 'Sem UF');
  return {
    de, ate, hoje, transportadora: filtroTransp || null, financeiro, entregas: ent, ocorrencias, economia, modalidade,
    por_transportadora: porTransp, por_cliente: somar(ctes, (c) => c.cliente), por_regiao: somar(ctes, (c) => regiaoDaUf(c.uf)), por_uf: porUf,
    por_mes: somar(ctes, (c) => c.mes).sort((a, b) => a.chave.localeCompare(b.chave)),
    regioes: REGIOES,
  };
}

module.exports = { painel, periodo, regiaoDaUf, REGIOES, MODAIS, somar };
