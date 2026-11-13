// Diferenças que se repetem: em vez de olhar CT-e por CT-e, acha o padrão por trás das divergências.
//  - componente: "a TDE vem a mais em 9 de 10 CT-e da transportadora X" (geral ou para um cliente);
//  - trecho: "para CAMPINAS/SP a transportadora X cobra sempre uns 8% acima da tabela".
// Para cada padrão sugere o caminho: quando a diferença é sempre a mesma (valor ou %), o mais provável é a tabela
// estar desatualizada → corrigir a tabela; quando varia, é erro de cobrança → contestar tudo de uma vez.
const pool = require('./db');

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const MIN_CTES = 3;
const mediana = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Quanto os valores variam em torno da mediana (0 = todos iguais).
const dispersao = (a) => { const m = mediana(a); if (!m) return 1; return mediana(a.map((x) => Math.abs(x - m))) / Math.abs(m); };

async function analisar({ de, ate, transportadora } = {}) {
  const ad = require('./auditoriaDetalhada');
  const fim = /^\d{4}-\d{2}-\d{2}$/.test(ate || '') ? ate : new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const ini = /^\d{4}-\d{2}-\d{2}$/.test(de || '') ? de : new Date(Date.parse(fim) - 90 * 86400000).toISOString().slice(0, 10);
  const params = [ini, fim];
  let extra = '';
  if (String(transportadora || '').trim()) { params.push(`%${String(transportadora).trim()}%`); extra = ` AND f.transportadora ILIKE $${params.length}`; }
  const { rows } = await pool.query(`SELECT ${ad.CAMPOS}, f.transportadora, f.dif_negociado_tabela, f.cidade, f.uf, f.tabela_preco_id_usada,
       f.glosa_valor, f.fatura_id, f.status_aprovacao
     FROM fretes f
    WHERE f.chave_cte IS NOT NULL AND NOT COALESCE(f.cte_cancelado, FALSE) AND f.carga_direta IS NOT TRUE
      AND COALESCE(f.vinculo_cte, '') <> 'complementar' AND COALESCE(f.status, '') NOT IN ('Cancelado', 'Não cobrado')
      AND f.valor_total_frete > 0 AND f.data_emissao_cte BETWEEN $1::date AND $2::date${extra}
    ORDER BY f.data_emissao_cte DESC LIMIT 8000`, params);
  const tol = await require('./toleranciaAuditoria').carregar();
  const somas = await ad.somasCobertas(rows.map((r) => r.id));

  const totalPorTransp = {}; const totalPorTranspCliente = {};
  const comps = new Map(); const trechos = new Map();
  for (const f of rows) {
    const tr = f.transportadora || '—';
    totalPorTransp[tr] = (totalPorTransp[tr] || 0) + 1;
    const kc = `${tr}|${f.cliente || ''}`; totalPorTranspCliente[kc] = (totalPorTranspCliente[kc] || 0) + 1;
    const excesso = r2(-(Number(f.dif_negociado_tabela) || 0));
    const base = Number(f.valor_total_frete) || 0;
    // Trecho: todo CT-e entra na conta (para saber em quantos dos CT-e do trecho houve diferença).
    const destino = f.cidade ? `${String(f.cidade).toUpperCase()}${f.uf ? `/${f.uf}` : ''}` : null;
    if (destino) {
      const k = `${tr}|${destino}`;
      const t = trechos.get(k) || { tipo: 'trecho', transportadora: tr, destino, total: 0, ids: [], pcts: [], valores: [], tabelas: {} };
      t.total += 1;
      if (excesso > require('./toleranciaAuditoria').valorDe(tol, f.transportadora_id_tol, 'total', base) + 0.004) {
        t.ids.push(f.id); t.pcts.push((excesso / base) * 100); t.valores.push(excesso);
        if (f.tabela_preco_id_usada) t.tabelas[f.tabela_preco_id_usada] = (t.tabelas[f.tabela_preco_id_usada] || 0) + 1;
      }
      trechos.set(k, t);
    }
    // Componentes cobrados a mais / não previstos (precisa do XML).
    let conf = null;
    try { conf = ad.conferirFrete(f, tol, somas.get(f.id)); } catch { conf = null; }
    for (const c of conf?.componentes || []) {
      if (!['a_mais', 'nao_autorizada'].includes(c.situacao)) continue;
      const v = c.situacao === 'nao_autorizada' ? Number(c.cobrado) : Number(c.diferenca);
      for (const cliente of f.cliente ? [null, f.cliente] : [null]) {
        const k = `${tr}|${cliente || '*'}|${c.chave}`;
        const p = comps.get(k) || { tipo: 'componente', transportadora: tr, cliente, componente: c.chave, componente_nome: c.nome, nao_previsto: 0, ids: [], valores: [], tabelas: {} };
        p.ids.push(f.id); p.valores.push(v);
        if (c.situacao === 'nao_autorizada') p.nao_previsto += 1;
        if (f.tabela_preco_id_usada) p.tabelas[f.tabela_preco_id_usada] = (p.tabelas[f.tabela_preco_id_usada] || 0) + 1;
        comps.set(k, p);
      }
    }
  }

  const tabelaMaisUsada = (m) => { const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return e ? Number(e[0]) : null; };
  const padroes = [];
  for (const p of comps.values()) {
    const total = p.cliente ? totalPorTranspCliente[`${p.transportadora}|${p.cliente}`] : totalPorTransp[p.transportadora];
    const freq = p.ids.length / (total || 1);
    // Na transportadora inteira basta 30% (a taxa pode valer só para parte das entregas); num cliente, metade.
    if (p.ids.length < MIN_CTES || freq < (p.cliente ? 0.5 : 0.3)) continue;
    const disp = dispersao(p.valores);
    const igual = disp <= 0.1;
    const med = r2(mediana(p.valores));
    padroes.push({
      ...p, ctes: p.ids.length, total_ctes: total, frequencia: Math.round(freq * 100), valor: r2(p.valores.reduce((s, v) => s + v, 0)), valor_tipico: med,
      sugestao: igual ? 'tabela' : 'contestar', tabela_preco_id: tabelaMaisUsada(p.tabelas),
      texto: `${p.componente_nome} ${p.nao_previsto === p.ids.length ? 'cobrado sem estar na tabela' : 'cobrado acima da tabela'} em ${p.ids.length} de ${total} CT-e${p.cliente ? ` do cliente ${p.cliente}` : ''}`
        + ` (${igual ? `quase sempre R$ ${med.toFixed(2).replace('.', ',')}` : `de R$ ${Math.min(...p.valores).toFixed(2).replace('.', ',')} a R$ ${Math.max(...p.valores).toFixed(2).replace('.', ',')}`})`,
      motivo_sugestao: igual ? 'A diferença é sempre a mesma: provavelmente a tabela está sem esse valor ou desatualizada.' : 'A diferença varia de CT-e para CT-e: parece erro de cobrança.',
    });
  }
  for (const t of trechos.values()) {
    if (t.ids.length < MIN_CTES || t.ids.length / t.total < 0.6) continue;
    const med = mediana(t.pcts);
    if (med < 2) continue;
    const igual = dispersao(t.pcts) <= 0.15;
    padroes.push({
      ...t, ctes: t.ids.length, total_ctes: t.total, frequencia: Math.round((t.ids.length / t.total) * 100), valor: r2(t.valores.reduce((s, v) => s + v, 0)),
      pct_tipico: Math.round(med * 10) / 10, sugestao: igual ? 'tabela' : 'contestar', tabela_preco_id: tabelaMaisUsada(t.tabelas),
      texto: `Para ${t.destino}, ${t.ids.length} de ${t.total} CT-e acima da tabela, ${igual ? `quase sempre +${med.toFixed(1).replace('.', ',')}%` : `em média +${med.toFixed(1).replace('.', ',')}%`}`,
      motivo_sugestao: igual ? 'O % a mais é sempre parecido: provavelmente o preço do trecho na tabela está desatualizado (reajuste não lançado).' : 'O % a mais varia: parece erro de cobrança no trecho.',
    });
  }
  // Trecho cuja diferença já é explicada por uma taxa repetida (ex.: a TDE de todas as entregas daquele cliente): fica a taxa.
  const porTaxa = padroes.filter((p) => p.tipo === 'componente' && p.componente !== 'frete_peso').map((p) => new Set(p.ids));
  const semRepetir = padroes.filter((p) => p.tipo !== 'trecho' || !porTaxa.some((ids) => p.ids.every((id) => ids.has(id))));
  // Frete peso a mais que já está explicado pelos trechos (ex.: CAMPINAS sempre +8%): fica o trecho, mais específico.
  const nosTrechos = new Set(semRepetir.filter((p) => p.tipo === 'trecho').flatMap((p) => p.ids));
  for (let i = semRepetir.length - 1; i >= 0; i -= 1) {
    const p = semRepetir[i];
    if (p.tipo === 'componente' && p.componente === 'frete_peso' && p.ids.every((id) => nosTrechos.has(id))) semRepetir.splice(i, 1);
  }
  // Mesmos CT-e em dois padrões (o da transportadora e o de um cliente): fica o mais específico (o do cliente).
  const vistos = new Set();
  const final = semRepetir.sort((a, b) => b.valor - a.valor || (b.cliente ? 1 : 0) - (a.cliente ? 1 : 0)).filter((p) => {
    const chave = `${p.tipo}|${p.componente || p.destino}|${[...p.ids].sort().join(',')}`;
    if (vistos.has(chave)) return false; vistos.add(chave); return true;
  });
  // Quantos ainda dá para contestar (sem glosa, fora de contestação aberta).
  const todos = [...new Set(final.flatMap((p) => p.ids))];
  const abertos = new Set();
  if (todos.length) {
    const { rows: r } = await pool.query(`SELECT f.id FROM fretes f WHERE f.id = ANY($1::int[]) AND COALESCE(f.glosa_valor, 0) = 0
       AND NOT EXISTS (SELECT 1 FROM contestacao_itens ci JOIN contestacoes c ON c.id = ci.contestacao_id WHERE ci.frete_id = f.id AND c.status <> 'cancelada' AND ci.situacao <> 'recusado')`, [todos]);
    r.forEach((x) => abertos.add(x.id));
  }
  final.forEach((p) => { p.contestaveis = p.ids.filter((id) => abertos.has(id)).length; delete p.valores; delete p.pcts; delete p.tabelas; });
  return { de: ini, ate: fim, analisados: rows.length, padroes: final.slice(0, 100) };
}

module.exports = { analisar, mediana, dispersao };
