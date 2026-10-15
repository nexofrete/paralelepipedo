// Painel gerencial da transportadora: faturamento, CT-e, peso, frete por kg,
// evolução mensal, clientes, rotas, entregas no prazo e resultado por viagem
// (receita dos CT-e do MDF-e menos os custos lançados nele).
const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middlewareAuth');
const { permitirAlguma } = require('../permissoes');
const { registrar } = require('../auditoria');

const router = express.Router();
const pode = permitirAlguma('pode_emitir_cte', 'pode_ver_financeiro', 'pode_ver_relatorios');
const dataIso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const docLimpo = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const CUSTOS = ['combustivel', 'pedagio', 'motorista', 'terceiro', 'outros'];

// Peso do CT-e em kg (quantidade em KG ou TON).
function pesoKg(d = {}) {
  const q = (d.carga?.quantidades || []);
  const kg = q.find((x) => String(x.cUnid).padStart(2, '0') === '01');
  if (kg) return Number(kg.qCarga) || 0;
  const t = q.find((x) => String(x.cUnid).padStart(2, '0') === '02');
  return t ? (Number(t.qCarga) || 0) * 1000 : 0;
}
function tomador(d = {}) {
  const p = { 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')] || {};
  return { doc: docLimpo(p.cnpj || p.cpf), nome: p.xNome || '—' };
}
const valor = (r) => Number(r.dados?.valores?.vTPrest ?? r.valor_total) || 0;

async function ctesDoPeriodo(de, ate) {
  const { rows } = await pool.query(`SELECT id, chave, autorizado_em, valor_total, dados, situacao_entrega, data_entrega, previsao_original, demonstracao
    FROM ctes_emitidos WHERE status = 'autorizado' AND (autorizado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date`, [de, ate]);
  return rows;
}

// Indicadores de um conjunto de CT-e. O complementar soma no faturamento, mas não é carga nova.
function indicadores(rows) {
  const carga = rows.filter((r) => String(r.dados?.tpCTe ?? '0') !== '1');
  const fat = rows.reduce((s, r) => s + valor(r), 0);
  const peso = carga.reduce((s, r) => s + pesoKg(r.dados), 0);
  const valorCarga = carga.reduce((s, r) => s + (Number(r.dados?.carga?.vCarga) || 0), 0);
  const icms = rows.reduce((s, r) => s + (Number(r.dados?.icms?.vICMS) || 0), 0);
  const entregues = carga.filter((r) => r.situacao_entrega === 'entregue' && r.data_entrega && r.previsao_original);
  const noPrazo = entregues.filter((r) => new Date(r.data_entrega).toISOString().slice(0, 10) <= new Date(r.previsao_original).toISOString().slice(0, 10));
  return {
    faturamento: centavos(fat), ctes: carga.length, complementares: rows.length - carga.length, peso_kg: Math.round(peso),
    frete_kg: peso > 0 ? Math.round((fat / peso) * 1000) / 1000 : null, ticket: carga.length ? centavos(fat / carga.length) : null,
    frete_sobre_carga: valorCarga > 0 ? Math.round((fat / valorCarga) * 10000) / 100 : null, icms: centavos(icms),
    entregues: entregues.length, no_prazo: noPrazo.length, pct_no_prazo: entregues.length ? Math.round((noPrazo.length / entregues.length) * 1000) / 10 : null,
  };
}

router.get('/', autenticar, pode, async (req, res) => {
  try {
    const ate = dataIso(req.query.ate) || hoje();
    const de = dataIso(req.query.de) || `${ate.slice(0, 8)}01`;
    if (de > ate) return res.status(400).json({ erro: 'A data inicial é depois da final.' });
    // Período anterior do mesmo tamanho, para comparar.
    const dias = Math.round((new Date(`${ate}T12:00:00Z`) - new Date(`${de}T12:00:00Z`)) / 86400000) + 1;
    const antAte = new Date(new Date(`${de}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
    const antDe = new Date(new Date(`${antAte}T12:00:00Z`).getTime() - (dias - 1) * 86400000).toISOString().slice(0, 10);
    const [rows, anteriores] = await Promise.all([ctesDoPeriodo(de, ate), ctesDoPeriodo(antDe, antAte)]);

    // Últimos 12 meses até o fim do período.
    const inicio12 = new Date(`${ate.slice(0, 7)}-01T12:00:00Z`); inicio12.setUTCMonth(inicio12.getUTCMonth() - 11);
    const doAno = await ctesDoPeriodo(inicio12.toISOString().slice(0, 10), ate);
    const meses = Array.from({ length: 12 }, (_, i) => { const d = new Date(inicio12); d.setUTCMonth(d.getUTCMonth() + i); return d.toISOString().slice(0, 7); });
    const mensal = meses.map((m) => {
      const doMes = doAno.filter((r) => new Date(r.autorizado_em.getTime() - 3 * 3600000).toISOString().slice(0, 7) === m);
      const i = indicadores(doMes);
      return { mes: m, faturamento: i.faturamento, ctes: i.ctes, peso_kg: i.peso_kg };
    });

    // Por cliente (tomador).
    const porCliente = new Map();
    rows.forEach((r) => {
      const t = tomador(r.dados);
      const g = porCliente.get(t.doc) || { doc: t.doc, nome: t.nome, linhas: [] };
      g.linhas.push(r); porCliente.set(t.doc, g);
    });
    const clientes = [...porCliente.values()].map((g) => ({ doc: g.doc, nome: g.nome, ...indicadores(g.linhas) }))
      .sort((a, b) => b.faturamento - a.faturamento);

    // Por rota: UF de início → cidade/UF de fim.
    const porRota = new Map();
    rows.filter((r) => String(r.dados?.tpCTe ?? '0') !== '1').forEach((r) => {
      const d = r.dados || {};
      const k = `${d.inicio?.UF || '?'}|${d.fim?.xMun || '?'}|${d.fim?.UF || '?'}`;
      const g = porRota.get(k) || { origem: d.inicio?.UF || '?', origem_cidade: d.inicio?.xMun || '', destino: d.fim?.xMun || '?', uf: d.fim?.UF || '?', linhas: [] };
      g.linhas.push(r); porRota.set(k, g);
    });
    const rotas = [...porRota.values()].map(({ linhas, ...g }) => ({ ...g, ...indicadores(linhas) })).sort((a, b) => b.faturamento - a.faturamento).slice(0, 20);

    const { rows: [rec] } = await pool.query(`SELECT COALESCE(SUM(valor_bruto - desconto - valor_pago) FILTER (WHERE status IN ('aberta', 'parcial')), 0) AS a_receber,
        COALESCE(SUM(valor_bruto - desconto - valor_pago) FILTER (WHERE status IN ('aberta', 'parcial') AND vencimento < $1::date), 0) AS vencido FROM faturas_transporte`, [hoje()]);
    const { rows: [atrasadas] } = await pool.query(`SELECT COUNT(*)::int AS n FROM ctes_emitidos WHERE status = 'autorizado' AND COALESCE(dados->>'tpCTe', '0') <> '1'
        AND situacao_entrega NOT IN ('entregue', 'devolvido') AND previsao_entrega < $1::date`, [hoje()]);

    res.json({
      periodo: { de, ate, anterior: { de: antDe, ate: antAte } },
      atual: indicadores(rows), anterior: indicadores(anteriores),
      mensal, clientes: clientes.slice(0, 15), total_clientes: clientes.length, rotas,
      a_receber: Number(rec.a_receber), vencido: Number(rec.vencido), entregas_atrasadas: atrasadas.n,
      demonstracao: rows.some((r) => r.demonstracao),
    });
  } catch (err) { console.error('[painel]', err); res.status(400).json({ erro: err.message || 'Erro ao montar o painel.' }); }
});

// Resultado por viagem: MDF-e do período, receita dos CT-e dele e custos lançados.
router.get('/viagens', autenticar, pode, async (req, res) => {
  try {
    const ate = dataIso(req.query.ate) || hoje();
    const de = dataIso(req.query.de) || `${ate.slice(0, 8)}01`;
    const { rows } = await pool.query(`SELECT id, serie, numero, placa, uf_ini, uf_fim, status, autorizado_em, encerrado_em, custos, dados, demonstracao,
        dados->'condutores'->0->>'xNome' AS motorista
      FROM mdfes WHERE status IN ('autorizado', 'encerrado') AND (autorizado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date ORDER BY autorizado_em DESC LIMIT 300`, [de, ate]);
    const chaves = [...new Set(rows.flatMap((m) => (m.dados?.descargas || []).flatMap((x) => x.ctes || [])))];
    const { rows: ctes } = chaves.length ? await pool.query(`SELECT chave, valor_total, dados, status FROM ctes_emitidos WHERE chave = ANY($1)`, [chaves]) : { rows: [] };
    const porChave = new Map(ctes.map((c) => [c.chave, c]));
    res.json(rows.map((m) => {
      const doMdfe = (m.dados?.descargas || []).flatMap((x) => x.ctes || []).map((k) => porChave.get(k)).filter((c) => c && c.status === 'autorizado');
      const receita = centavos(doMdfe.reduce((s, c) => s + valor(c), 0));
      const custos = m.custos || {};
      const custo = centavos(CUSTOS.reduce((s, k) => s + (Number(custos[k]) || 0), 0));
      const peso = doMdfe.reduce((s, c) => s + pesoKg(c.dados), 0);
      const temCusto = CUSTOS.some((k) => Number(custos[k]) > 0);
      return {
        id: m.id, serie: m.serie, numero: m.numero, placa: m.placa, motorista: m.motorista, uf_ini: m.uf_ini, uf_fim: m.uf_fim, status: m.status,
        autorizado_em: m.autorizado_em, demonstracao: m.demonstracao, ctes: doMdfe.length, peso_kg: Math.round(peso), receita, custos, custo,
        margem: temCusto ? centavos(receita - custo) : null, margem_pct: temCusto && receita > 0 ? Math.round(((receita - custo) / receita) * 1000) / 10 : null,
      };
    }));
  } catch (err) { console.error('[painel]', err); res.status(400).json({ erro: err.message || 'Erro ao listar as viagens.' }); }
});

router.put('/viagens/:id(\\d+)/custos', autenticar, pode, async (req, res) => {
  try {
    const custos = Object.fromEntries(CUSTOS.map((k) => [k, Math.max(0, centavos(req.body?.[k]))]));
    const { rows } = await pool.query(`UPDATE mdfes SET custos = $2 WHERE id = $1 AND status IN ('autorizado', 'encerrado') RETURNING serie, numero`, [req.params.id, custos]);
    if (!rows[0]) return res.status(404).json({ erro: 'Viagem (MDF-e) não encontrada.' });
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'viagem_custos', detalhes: `Lançou custos da viagem do MDF-e ${rows[0].serie}/${rows[0].numero}: R$ ${Object.values(custos).reduce((s, v) => s + v, 0).toFixed(2)}` });
    res.json({ ok: true, custos });
  } catch (err) { res.status(400).json({ erro: err.message || 'Erro ao salvar os custos.' }); }
});

// Resultado (margem) por CT-e e por cliente e o demonstrativo do período.
const resultado = require('../resultado');
const periodoDe = (q) => { const ate = dataIso(q.ate) || hoje(); return { de: dataIso(q.de) || `${ate.slice(0, 8)}01`, ate }; };
router.get('/resultado', autenticar, pode, async (req, res) => {
  try {
    const p = periodoDe(req.query);
    if (p.de > p.ate) return res.status(400).json({ erro: 'A data inicial é depois da final.' });
    const r = await resultado.calcular(p);
    res.json({ ...r, documentos: r.documentos.slice(0, 2000), total_documentos: r.documentos.length });
  } catch (err) { console.error('[resultado]', err); res.status(400).json({ erro: err.message || 'Erro ao calcular o resultado.' }); }
});
// Planilha (CSV, abre no Excel) com a margem de cada documento.
router.get('/resultado.csv', autenticar, pode, async (req, res) => {
  try {
    const r = await resultado.calcular(periodoDe(req.query));
    const n = (v) => (v == null ? '' : String(Number(v).toFixed(2)).replace('.', ','));
    const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [['Data', 'Documento', 'Cliente (tomador)', 'CNPJ/CPF', 'Origem', 'Destino', 'Peso kg', 'Receita', 'ICMS', 'ISS', 'Outros impostos', 'Seguro',
      'Custo da viagem', 'Frota própria', 'Custo total', 'Margem', 'Margem %', 'Viagens'].join(';')];
    r.documentos.forEach((d) => linhas.push([d.data.split('-').reverse().join('/'), campo(d.documento), campo(d.tomador_nome), campo(d.tomador_doc), campo(d.origem), campo(d.destino),
      d.peso, n(d.receita), n(d.icms), n(d.iss), n(d.impostos - d.icms - d.iss), n(d.seguro), n(d.viagem), n(d.frota), n(d.custo), n(d.margem), n(d.margem_pct), campo(d.viagens.join(', '))].join(';')));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="resultado-${r.periodo.de}-a-${r.periodo.ate}.csv"` });
    res.send(`\uFEFF${linhas.join('\r\n')}\r\n`);
  } catch (err) { res.status(400).send(String(err.message || 'Erro.')); }
});
router.get('/resultado/config', autenticar, pode, async (req, res) => {
  try { res.json(await resultado.config()); } catch (err) { res.status(400).json({ erro: err.message }); }
});
router.put('/resultado/config', autenticar, async (req, res) => {
  try {
    if (req.usuario?.perfil !== 'admin') return res.status(403).json({ erro: 'Só o administrador muda os percentuais do resultado.' });
    const c = await resultado.salvarConfig(req.body || {});
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'resultado_config', detalhes: `Percentuais do resultado: impostos ${c.impostos_pct}%, seguro ${c.seguro_pct}%, meta ${c.meta_margem_pct}%` });
    return res.json(c);
  } catch (err) { return res.status(400).json({ erro: err.message }); }
});

module.exports = router;
module.exports.ajudantes = { pesoKg, indicadores };
