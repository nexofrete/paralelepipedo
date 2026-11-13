// Resultado da auditoria: o retorno do trabalho de quem audita, por mês e por transportadora (pela emissão do CT-e).
//  - Cobrado a mais: o que os CT-e cobraram acima da tabela, fora da tolerância.
//  - Recuperado: glosas (feitas à mão, por regra automática ou por contestação aceita) + créditos de contestação já
//    abatidos em fatura + CT-e barrados (reprovados ou da transportadora que não levou) — o mesmo critério da
//    "Economia da auditoria" dos indicadores, mais os créditos.
//  - Aprovado mesmo divergente: cobrou a mais, foi aprovado sem glosa (por uma pessoa ou por regra automática).
//  - Em apuração: o que os CT-e ainda retidos cobram a mais.
const pool = require('./db');

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const PREFIXO_REGRA = 'Regra automática: ';

async function gerar(req, q = {}) {
  const { consultaCliente } = require('./permissoes');
  const tolMod = require('./toleranciaAuditoria');
  const fim = /^\d{4}-\d{2}-\d{2}$/.test(q.ate || '') ? q.ate : new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  // Padrão: os últimos 12 meses (do 1º dia do mês, 11 meses atrás, até hoje).
  const d0 = new Date(`${fim}T00:00:00Z`); d0.setUTCDate(1); d0.setUTCMonth(d0.getUTCMonth() - 11);
  const ini = /^\d{4}-\d{2}-\d{2}$/.test(q.de || '') ? q.de : d0.toISOString().slice(0, 10);
  const params = [ini, fim];
  let extra = '';
  if (String(q.transportadora || '').trim()) { params.push(`%${String(q.transportadora).trim()}%`); extra = ` AND f.transportadora ILIKE $${params.length}`; }
  const { rows } = await consultaCliente(req,
    `SELECT f.id, COALESCE(f.transportadora, 'Sem transportadora') AS transportadora, to_char(f.data_emissao_cte, 'YYYY-MM') AS mes,
            f.valor_total_cte::float AS valor_cte, f.valor_total_frete::float AS valor_tabela, f.dif_negociado_tabela::float AS dif,
            f.status, f.status_aprovacao, f.aprovado_por_nome, f.glosa_valor::float AS glosa, f.glosa_motivo, f.glosa_motivo_codigo, f.glosa_registrada_por,
            f.cte_nao_levou,
            COALESCE((SELECT SUM(i.valor_aceito) FROM contestacao_itens i WHERE i.frete_id = f.id AND i.situacao = 'aceito' AND i.credito AND i.abatido_fatura_id IS NOT NULL), 0)::float AS credito,
            COALESCE((SELECT tp.transportadora_id FROM tabelas_preco tp WHERE tp.id = f.tabela_preco_id_usada),
                     (SELECT tr.id FROM transportadoras tr WHERE UPPER(TRIM(tr.razao_social)) = UPPER(TRIM(COALESCE(f.transportadora_cte, f.transportadora))) LIMIT 1)) AS transportadora_id_tol
       FROM fretes f
      WHERE f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE AND COALESCE(f.status, '') NOT IN ('Cancelado', 'Não cobrado')
        AND COALESCE(f.vinculo_cte, '') <> 'complementar' AND f.data_emissao_cte BETWEEN $1::date AND $2::date${extra}`, params);
  const tol = await tolMod.carregar();

  const vazio = () => ({ ctes: 0, divergentes: 0, cobrado_a_mais: 0, glosas_manual: 0, glosas_regra: 0, glosas_contestacao: 0, creditos: 0, barrados: 0,
    aprovado_divergente_pessoa: 0, aprovado_divergente_regra: 0, decididos_regra: 0, em_apuracao: 0, qtd_em_apuracao: 0, motivos: {} });
  const total = vazio(); const porMes = {}; const porTransp = {};
  for (const f of rows) {
    const alvos = [total, porMes[f.mes] || (porMes[f.mes] = vazio()), porTransp[f.transportadora] || (porTransp[f.transportadora] = vazio())];
    const excesso = Math.max(0, -(Number(f.dif) || 0));
    const divergente = f.valor_tabela != null && excesso > tolMod.valorDe(tol, f.transportadora_id_tol, 'total', f.valor_tabela) + 0.004;
    const barrado = f.cte_nao_levou || f.status_aprovacao === 'Rejeitado';
    const porRegra = String(f.aprovado_por_nome || '').startsWith(PREFIXO_REGRA);
    const glosa = Number(f.glosa) || 0;
    const fonteGlosa = String(f.glosa_registrada_por || '').startsWith(PREFIXO_REGRA) ? 'glosas_regra' : /^Contestação nº/.test(f.glosa_motivo || '') ? 'glosas_contestacao' : 'glosas_manual';
    for (const a of alvos) {
      a.ctes += 1;
      if (divergente) { a.divergentes += 1; a.cobrado_a_mais += excesso; }
      if (glosa > 0) { a[fonteGlosa] += glosa; const m = f.glosa_motivo_codigo || 'sem_motivo'; a.motivos[m] = (a.motivos[m] || 0) + glosa; }
      a.creditos += Number(f.credito) || 0;
      if (barrado) a.barrados += Number(f.valor_cte) || 0;
      if (porRegra) a.decididos_regra += 1;
      if (divergente && f.status_aprovacao === 'Aprovado' && !glosa && !barrado) a[porRegra ? 'aprovado_divergente_regra' : 'aprovado_divergente_pessoa'] += excesso;
      if (divergente && f.status === 'Frete Retido' && !barrado) { a.em_apuracao += excesso; a.qtd_em_apuracao += 1; }
    }
  }
  const { MOTIVOS } = require('./contestacoes');
  const fechar = (a) => {
    const o = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v]));
    o.glosas = r2(o.glosas_manual + o.glosas_regra + o.glosas_contestacao);
    o.recuperado = r2(o.glosas + o.creditos + o.barrados);
    o.aprovado_divergente = r2(o.aprovado_divergente_pessoa + o.aprovado_divergente_regra);
    o.pct_recuperado = o.cobrado_a_mais > 0 ? Math.round((Math.min(o.glosas + o.creditos, o.cobrado_a_mais) / o.cobrado_a_mais) * 1000) / 10 : null;
    o.motivos = Object.entries(a.motivos).map(([k, v]) => ({ motivo: k, nome: MOTIVOS[k] || 'Sem motivo informado', valor: r2(v) })).sort((x, y) => y.valor - x.valor);
    return o;
  };
  return {
    de: ini, ate: fim, total: fechar(total),
    por_mes: Object.entries(porMes).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ chave: k, ...fechar(v) })),
    por_transportadora: Object.entries(porTransp).map(([k, v]) => ({ chave: k, ...fechar(v) })).filter((t) => t.cobrado_a_mais || t.recuperado).sort((a, b) => b.cobrado_a_mais - a.cobrado_a_mais),
  };
}

module.exports = { gerar };
