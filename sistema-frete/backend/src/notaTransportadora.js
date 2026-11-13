// Nota da transportadora na auditoria (0 a 100), no período (pela emissão do CT-e):
//   40 pontos — CT-e divergentes: 40 com nenhum; zero com metade ou mais dos CT-e acima da tabela (fora da tolerância).
//   30 pontos — cobrado a mais por R$ 1.000 de frete: 30 com nada; zero com R$ 50 ou mais (5%).
//   20 pontos — contestações: a parte do valor contestado que ela aceitou (sem contestação respondida: 20).
//   10 pontos — tempo de resposta das contestações: 10 respondendo no mesmo dia; zero com 20 dias ou mais (sem: 10).
// Faixas: A (85+), B (70+), C (50+), D (abaixo de 50). Precisa de pelo menos 5 CT-e no período para ter nota.
const pool = require('./db');

const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const MIN_CTES = 5;
const faixa = (n) => (n == null ? null : n >= 85 ? 'A' : n >= 70 ? 'B' : n >= 50 ? 'C' : 'D');

async function gerar(req, q = {}) {
  const { consultaCliente } = require('./permissoes');
  const tolMod = require('./toleranciaAuditoria');
  const fim = /^\d{4}-\d{2}-\d{2}$/.test(q.ate || '') ? q.ate : new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const ini = /^\d{4}-\d{2}-\d{2}$/.test(q.de || '') ? q.de : new Date(Date.parse(fim) - 90 * 86400000).toISOString().slice(0, 10);
  const { rows } = await consultaCliente(req,
    `SELECT COALESCE(f.transportadora, 'Sem transportadora') AS transportadora, f.valor_total_cte::float AS valor_cte, f.valor_total_frete::float AS valor_tabela,
            f.dif_negociado_tabela::float AS dif,
            COALESCE((SELECT tp.transportadora_id FROM tabelas_preco tp WHERE tp.id = f.tabela_preco_id_usada),
                     (SELECT tr.id FROM transportadoras tr WHERE UPPER(TRIM(tr.razao_social)) = UPPER(TRIM(COALESCE(f.transportadora_cte, f.transportadora))) LIMIT 1)) AS transportadora_id_tol
       FROM fretes f
      WHERE f.chave_cte IS NOT NULL AND f.cte_cancelado IS NOT TRUE AND COALESCE(f.status, '') NOT IN ('Cancelado', 'Não cobrado') AND f.carga_direta IS NOT TRUE
        AND COALESCE(f.vinculo_cte, '') <> 'complementar' AND f.valor_total_frete IS NOT NULL AND f.data_emissao_cte BETWEEN $1::date AND $2::date`, [ini, fim]);
  const tol = await tolMod.carregar();
  const por = {};
  for (const f of rows) {
    const t = por[f.transportadora] || (por[f.transportadora] = { transportadora: f.transportadora, ctes: 0, divergentes: 0, frete: 0, a_mais: 0 });
    const excesso = Math.max(0, -(Number(f.dif) || 0));
    t.ctes += 1; t.frete += Number(f.valor_cte) || 0;
    if (excesso > tolMod.valorDe(tol, f.transportadora_id_tol, 'total', f.valor_tabela) + 0.004) { t.divergentes += 1; t.a_mais += excesso; }
  }
  // Contestações respondidas que foram enviadas no período.
  const { rows: cts } = await pool.query(`SELECT transportadora, SUM(valor_contestado)::float AS contestado, SUM(COALESCE(valor_aceito, 0))::float AS aceito, COUNT(*)::int AS qtd,
      AVG(EXTRACT(EPOCH FROM (respondida_em - enviada_em)) / 86400)::float AS dias
    FROM contestacoes WHERE status IN ('aceita', 'parcial', 'recusada', 'abatida') AND enviada_em IS NOT NULL AND respondida_em IS NOT NULL
      AND enviada_em::date BETWEEN $1::date AND $2::date GROUP BY 1`, [ini, fim]);
  const ctPor = Object.fromEntries(cts.map((c) => [c.transportadora, c]));
  const lista = Object.values(por).map((t) => {
    const c = ctPor[t.transportadora];
    const pctDiv = t.ctes ? t.divergentes / t.ctes : 0;
    const porMil = t.frete ? (t.a_mais / t.frete) * 1000 : 0;
    const aceitacao = c && c.contestado > 0 ? c.aceito / c.contestado : null;
    const dias = c ? Math.max(0, c.dias || 0) : null;
    const pontos = {
      divergencia: 40 * (1 - Math.min(pctDiv / 0.5, 1)),
      a_mais: 30 * (1 - Math.min(porMil / 50, 1)),
      contestacao: aceitacao == null ? 20 : 20 * aceitacao,
      resposta: dias == null ? 10 : 10 * (1 - Math.min(dias / 20, 1)),
    };
    const nota = t.ctes >= MIN_CTES ? Math.round(pontos.divergencia + pontos.a_mais + pontos.contestacao + pontos.resposta) : null;
    return {
      transportadora: t.transportadora, ctes: t.ctes, divergentes: t.divergentes, pct_divergentes: r1(pctDiv * 100), frete: r2(t.frete), a_mais: r2(t.a_mais),
      a_mais_por_mil: r2(porMil), contestacoes: c?.qtd || 0, pct_aceito: aceitacao == null ? null : r1(aceitacao * 100), dias_resposta: dias == null ? null : r1(dias),
      pontos: Object.fromEntries(Object.entries(pontos).map(([k, v]) => [k, r1(v)])), nota, faixa: faixa(nota),
    };
  }).sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || b.ctes - a.ctes);
  return { de: ini, ate: fim, minimo_ctes: MIN_CTES, transportadoras: lista };
}

module.exports = { gerar, faixa };
