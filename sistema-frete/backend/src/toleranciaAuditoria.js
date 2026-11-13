// Tolerância da auditoria de frete por transportadora e por componente.
// Regra mais específica primeiro (transportadora + componente), depois a geral do componente,
// depois o total da transportadora e, por fim, a tolerância geral (Configurações » Auditoria).
// Sempre vale o MAIOR entre o valor fixo (R$) e o percentual da base.
// A conferência automática do banco usa a mesma regra (função tolerancia_auditoria no schema.sql).
const pool = require('./db');

const COMPONENTES = {
  total: 'Total do frete', frete_peso: 'Frete peso', ad_valorem: 'Ad valorem', gris: 'GRIS', pedagio: 'Pedágio', tde: 'TDE', tda: 'TDA', trt: 'TRT',
  despacho: 'Despacho / taxa de emissão', descarga: 'Descarga', outros: 'Outras taxas',
};
const num = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : null; };

let cache = { em: 0, v: null };
async function carregar(forcar = false) {
  if (!forcar && cache.v && Date.now() - cache.em < 60000) return cache.v;
  const { rows: [c] } = await pool.query('SELECT tolerancia_valor, tolerancia_percentual FROM configuracao_auditoria WHERE id = 1');
  const { rows } = await pool.query(`SELECT r.id, r.transportadora_id, r.componente, r.valor::float, r.percentual::float, t.razao_social AS transportadora
    FROM auditoria_tolerancias r LEFT JOIN transportadoras t ON t.id = r.transportadora_id ORDER BY t.razao_social NULLS FIRST, r.componente`);
  const regras = new Map(rows.map((r) => [`${r.transportadora_id || 0}|${r.componente}`, { valor: r.valor || 0, pct: r.percentual || 0 }]));
  cache = { em: Date.now(), v: { geral: { valor: Number(c?.tolerancia_valor) || 0, pct: Number(c?.tolerancia_percentual) || 0 }, regras, lista: rows } };
  return cache.v;
}
const limpar = () => { cache = { em: 0, v: null }; };

// { valor, pct } que vale para a transportadora e o componente.
function regra(cfg, transportadoraId, componente = 'total') {
  const t = Number(transportadoraId) || 0;
  const r = cfg.regras;
  return (componente !== 'total' && t && r.get(`${t}|${componente}`)) || (componente !== 'total' && r.get(`0|${componente}`))
    || (t && r.get(`${t}|total`)) || cfg.geral;
}
// Tolerância em R$ para uma base (valor da tabela).
const valorDe = (cfg, transportadoraId, componente, base) => { const g = regra(cfg, transportadoraId, componente); return Math.max(g.valor, (Math.abs(Number(base) || 0) * g.pct) / 100); };

// Grava a lista inteira (Configurações » Auditoria). linhas: [{ transportadora_id|null, componente, valor, percentual }].
async function salvar(linhas) {
  const ok = []; const vistos = new Set();
  for (const l of Array.isArray(linhas) ? linhas : []) {
    const componente = COMPONENTES[l.componente] ? l.componente : null;
    const tid = Number(l.transportadora_id) || null;
    const valor = num(l.valor); const percentual = num(l.percentual);
    if (!componente) throw Object.assign(new Error('Componente inválido.'), { status: 400 });
    if (!tid && componente === 'total') throw Object.assign(new Error('O total para todas as transportadoras é a tolerância geral, acima.'), { status: 400 });
    if (valor == null && percentual == null) continue;
    if ((percentual || 0) > 100) throw Object.assign(new Error('Percentual até 100%.'), { status: 400 });
    const chave = `${tid || 0}|${componente}`;
    if (vistos.has(chave)) throw Object.assign(new Error(`Regra repetida: ${COMPONENTES[componente]}${tid ? '' : ' (todas)'} — deixe uma só.`), { status: 400 });
    vistos.add(chave);
    ok.push({ tid, componente, valor: valor || 0, percentual: percentual || 0 });
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('DELETE FROM auditoria_tolerancias');
    for (const l of ok) await db.query('INSERT INTO auditoria_tolerancias (transportadora_id, componente, valor, percentual) VALUES ($1,$2,$3,$4)', [l.tid, l.componente, l.valor, l.percentual]);
    await db.query('COMMIT');
  } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
  limpar();
  return ok.length;
}

// Refaz a conferência automática dos fretes ainda não decididos por uma pessoa (o trigger do banco
// aplica a tolerância nova: libera o que passou a caber, retém o que deixou de caber).
async function reconferir() {
  const { rowCount } = await pool.query(`UPDATE fretes SET atualizado_em = atualizado_em
     WHERE chave_cte IS NOT NULL AND COALESCE(status, 'Pendente') NOT IN ('Faturado', 'Cancelado', 'Não cobrado', 'Arquivado')
       AND (status_aprovacao IS DISTINCT FROM 'Aprovado' OR aprovado_por_nome = 'Sistema (conferência automática)')
       AND status_aprovacao IS DISTINCT FROM 'Rejeitado'`);
  return rowCount;
}

module.exports = { COMPONENTES, carregar, limpar, regra, valorDe, salvar, reconferir };
