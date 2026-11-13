// Regras automáticas da auditoria: decisões que sempre são tomadas do mesmo jeito saem da fila sozinhas.
// Cada regra: transportadora (ou todas) + condição + ação.
//   Condições: diferenca_ate (o CT-e passou da tabela até R$ X ou Y%),
//              componente_ate (toda a diferença está num componente, ex.: pedágio, até R$ X ou Y%),
//              taxa_nao_prevista (o CT-e cobrou uma taxa que a tabela não prevê; opcional: só aquela taxa, até R$ X).
//   Ações: aprovar (libera com a justificativa da regra) ou glosar (glosa o que passou, com o motivo padronizado).
// Só entram fretes retidos por cobrar A MAIS, sem decisão de uma pessoa, sem glosa, fora de contestação aberta e sem
// alerta que peça uma pessoa (transportadoras diferentes, cobrança em dobro, não levou, carga direta, motivo de conferência).
// A primeira regra (pela ordem) que casar decide. Roda a cada 10 minutos, ao salvar as regras e no botão "Aplicar agora".
const pool = require('./db');

const TIPOS = { diferenca_ate: 'Diferença total até', componente_ate: 'Diferença só num componente, até', taxa_nao_prevista: 'Taxa não prevista na tabela' };
const ACOES = { aprovar: 'Aprovar', glosar: 'Glosar' };
const PREFIXO = 'Regra automática: ';
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const numOuNull = (v) => (v === '' || v == null || !Number.isFinite(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));

async function listar() {
  const { rows } = await pool.query(`SELECT r.*, t.razao_social AS transportadora_nome,
      (SELECT COUNT(*)::int FROM fretes f WHERE f.regra_auditoria_id = r.id) AS fretes_decididos,
      (SELECT COALESCE(SUM(f.glosa_valor), 0)::float FROM fretes f WHERE f.regra_auditoria_id = r.id) AS valor_glosado
    FROM auditoria_regras r LEFT JOIN transportadoras t ON t.id = r.transportadora_id ORDER BY r.ordem, r.id`);
  return rows;
}

// Grava a lista inteira (as que vierem com id são atualizadas; as que sumirem são apagadas, sem desfazer o que já decidiram).
async function salvar(lista, usuarioNome) {
  if (!Array.isArray(lista)) throw falha('Envie a lista de regras.');
  const { COMPONENTES } = require('./auditoriaDetalhada');
  const limpas = lista.map((r, i) => {
    const nome = String(r.nome || '').trim().slice(0, 100);
    if (!nome) throw falha(`Dê um nome à regra ${i + 1}.`);
    if (!TIPOS[r.tipo]) throw falha(`Regra "${nome}": escolha a condição.`);
    if (!ACOES[r.acao]) throw falha(`Regra "${nome}": escolha a ação.`);
    const componente = r.componente && COMPONENTES[r.componente] ? r.componente : null;
    if (r.tipo === 'componente_ate' && !componente) throw falha(`Regra "${nome}": escolha o componente.`);
    const valor = numOuNull(r.valor); const percentual = numOuNull(r.percentual);
    if ((valor != null && valor < 0) || (percentual != null && (percentual < 0 || percentual > 100))) throw falha(`Regra "${nome}": valor ou % inválido.`);
    if (r.tipo !== 'taxa_nao_prevista' && !(valor > 0) && !(percentual > 0)) throw falha(`Regra "${nome}": informe até quanto (R$ ou %).`);
    return { id: Number(r.id) || null, nome, ativo: r.ativo !== false && r.ativo !== 'false', ordem: i, transportadora_id: Number(r.transportadora_id) || null,
      tipo: r.tipo, componente, valor, percentual, acao: r.acao };
  });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const manter = limpas.filter((r) => r.id).map((r) => r.id);
    await db.query('DELETE FROM auditoria_regras WHERE NOT (id = ANY($1::int[]))', [manter]);
    for (const r of limpas) {
      const v = [r.nome, r.ativo, r.ordem, r.transportadora_id, r.tipo, r.componente, r.valor, r.percentual, r.acao];
      if (r.id) await db.query(`UPDATE auditoria_regras SET nome=$1, ativo=$2, ordem=$3, transportadora_id=$4, tipo=$5, componente=$6, valor=$7, percentual=$8, acao=$9, atualizado_em=NOW() WHERE id=$10`, [...v, r.id]);
      else await db.query(`INSERT INTO auditoria_regras (nome, ativo, ordem, transportadora_id, tipo, componente, valor, percentual, acao, criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [...v, usuarioNome]);
    }
    await db.query('COMMIT');
  } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
  return listar();
}

// Fretes que podem ser decididos por regra.
async function candidatos(ids = null) {
  const ad = require('./auditoriaDetalhada');
  const params = [];
  let extra = '';
  if (Array.isArray(ids)) { params.push(ids); extra = ` AND f.id = ANY($${params.length}::int[])`; }
  const { rows } = await pool.query(`SELECT ${ad.CAMPOS}, f.dif_negociado_tabela, f.transportadora, f.valor_total_frete
     FROM fretes f
    WHERE f.chave_cte IS NOT NULL AND f.status = 'Frete Retido' AND f.dif_negociado_tabela < 0
      AND f.status_aprovacao IS DISTINCT FROM 'Aprovado' AND f.status_aprovacao IS DISTINCT FROM 'Rejeitado'
      AND COALESCE(f.glosa_valor, 0) = 0 AND f.fatura_id IS NULL
      AND NOT COALESCE(f.cte_cancelado, FALSE) AND NOT COALESCE(f.cte_nao_levou, FALSE) AND f.carga_direta IS NOT TRUE
      AND NOT COALESCE(f.alerta_transportadora_diferente, FALSE) AND NOT COALESCE(f.alerta_cobranca_dupla, FALSE)
      AND NULLIF(f.motivo_conferencia, '') IS NULL AND COALESCE(f.vinculo_cte, '') <> 'complementar'
      AND NOT EXISTS (SELECT 1 FROM contestacao_itens ci JOIN contestacoes c ON c.id = ci.contestacao_id
                       WHERE ci.frete_id = f.id AND c.status IN ('rascunho', 'enviada'))${extra}
    ORDER BY f.id LIMIT 5000`, params);
  return rows;
}

// A regra casa com o frete? Devolve { valor (o que glosar), texto } ou null.
function avaliar(regra, f, conf) {
  if (regra.transportadora_id && Number(regra.transportadora_id) !== Number(f.transportadora_id_tol)) return null;
  const excesso = r2(-(Number(f.dif_negociado_tabela) || 0));
  if (!(excesso > 0)) return null;
  const base = Number(f.valor_total_frete) || 0;
  const limite = Math.max(Number(regra.valor) || 0, (base * (Number(regra.percentual) || 0)) / 100);
  const brl = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
  if (regra.tipo === 'diferenca_ate') {
    return excesso <= limite + 0.004 ? { valor: excesso, texto: `cobrou ${brl(excesso)} acima da tabela (limite ${brl(limite)})` } : null;
  }
  if (!conf) return null;   // sem o XML do CT-e não dá para saber o componente
  const fora = (conf.componentes || []).filter((c) => ['a_mais', 'nao_autorizada'].includes(c.situacao));
  const nomeComp = (k) => require('./auditoriaDetalhada').COMPONENTES[k] || k;
  if (regra.tipo === 'componente_ate') {
    if (!fora.length || fora.some((c) => c.chave !== regra.componente)) return null;
    const noComp = r2(fora.reduce((s, c) => s + (c.situacao === 'nao_autorizada' ? Number(c.cobrado) : Number(c.diferenca)), 0));
    if (Math.abs(noComp - excesso) > Math.max(1, excesso * 0.02)) return null;   // tem diferença fora do componente
    return excesso <= limite + 0.004 ? { valor: excesso, texto: `diferença só em ${nomeComp(regra.componente)}: ${brl(excesso)} (limite ${brl(limite)})` } : null;
  }
  if (regra.tipo === 'taxa_nao_prevista') {
    const nao = fora.filter((c) => c.situacao === 'nao_autorizada' && (!regra.componente || c.chave === regra.componente));
    if (!nao.length) return null;
    const soma = r2(nao.reduce((s, c) => s + Number(c.cobrado), 0));
    if (regra.valor != null && Number(regra.valor) > 0 && soma > Number(regra.valor) + 0.004) return null;
    return { valor: Math.min(soma, excesso), texto: `cobrou ${nao.map((c) => `${nomeComp(c.chave)} ${brl(c.cobrado)}`).join(', ')}, que a tabela não prevê` };
  }
  return null;
}
const MOTIVO_GLOSA = (regra) => (regra.tipo === 'taxa_nao_prevista' ? 'taxa_nao_prevista' : regra.tipo === 'componente_ate' && regra.componente !== 'frete_peso' ? 'taxa_acima' : 'valor_acima');

// Avalia (e, se aplicar = true, grava). regrasTeste: regras ainda não salvas, para simular.
async function rodar({ aplicar = false, regrasTeste = null, ids = null } = {}) {
  const regras = (regrasTeste || (await listar())).filter((r) => r.ativo !== false);
  const resultado = { avaliados: 0, decididos: [], por_regra: {} };
  if (!regras.length) return resultado;
  const fretes = await candidatos(ids);
  resultado.avaliados = fretes.length;
  if (!fretes.length) return resultado;
  const ad = require('./auditoriaDetalhada');
  const tol = await require('./toleranciaAuditoria').carregar();
  const somas = await ad.somasCobertas(fretes.map((f) => f.id));
  for (const f of fretes) {
    let conf = null;
    try { conf = ad.conferirFrete(f, tol, somas.get(f.id)); } catch { conf = null; }
    for (const [i, regra] of regras.entries()) {
      const m = avaliar(regra, f, conf);
      if (!m) continue;
      const chave = regra.id || `nova-${i}`;
      const pr = resultado.por_regra[chave] || (resultado.por_regra[chave] = { regra: regra.nome, qtd: 0, valor: 0 });
      pr.qtd += 1; pr.valor = r2(pr.valor + m.valor);
      resultado.decididos.push({ frete_id: f.id, numero_cte: f.numero_cte, numero_nf: f.numero_nf, transportadora: f.transportadora, regra: regra.nome, acao: regra.acao, valor: m.valor, texto: m.texto });
      if (aplicar && regra.id) await gravar(f, regra, m);
      break;
    }
  }
  if (aplicar) {
    for (const [id, pr] of Object.entries(resultado.por_regra)) {
      await pool.query('UPDATE auditoria_regras SET ultimo_em = NOW(), ultimo_qtd = $2 WHERE id = $1', [Number(id), pr.qtd]).catch(() => {});
    }
  }
  return resultado;
}
async function gravar(f, regra, m) {
  const quem = `${PREFIXO}${regra.nome}`.slice(0, 150);
  const just = `${regra.acao === 'glosar' ? 'Glosado' : 'Aprovado'} pela regra automática "${regra.nome}": ${m.texto}.`;
  if (regra.acao === 'glosar') {
    await pool.query(`UPDATE fretes SET glosa_valor = $2, glosa_motivo = $3, glosa_motivo_codigo = $4, glosa_registrada_por = $5, glosa_registrada_em = NOW(),
        status_aprovacao = 'Aprovado', aprovado_por_nome = $5, aprovado_em = NOW(), motivo_rejeicao = NULL, justificativa_aprovacao = $3,
        status = 'Liberado p/ Pagamento', regra_auditoria_id = $6, atualizado_em = NOW()
      WHERE id = $1 AND status = 'Frete Retido' AND status_aprovacao IS DISTINCT FROM 'Aprovado'`, [f.id, m.valor, just, MOTIVO_GLOSA(regra), quem, regra.id]);
  } else {
    await pool.query(`UPDATE fretes SET status_aprovacao = 'Aprovado', aprovado_por_nome = $2, aprovado_em = NOW(), motivo_rejeicao = NULL, justificativa_aprovacao = $3,
        status = 'Liberado p/ Pagamento', regra_auditoria_id = $4, atualizado_em = NOW()
      WHERE id = $1 AND status = 'Frete Retido' AND status_aprovacao IS DISTINCT FROM 'Aprovado'`, [f.id, quem, just, regra.id]);
  }
}

// Desfaz o que a regra decidiu (fretes ainda não faturados) e a desliga.
async function desfazer(id) {
  const { rows: [r] } = await pool.query('SELECT * FROM auditoria_regras WHERE id = $1', [id]);
  if (!r) throw falha('Regra não encontrada.', 404);
  const { rowCount } = await pool.query(`UPDATE fretes SET status_aprovacao = 'Pendente', aprovado_por_nome = NULL, aprovado_em = NULL, justificativa_aprovacao = NULL,
      glosa_valor = CASE WHEN glosa_registrada_por LIKE $2 THEN NULL ELSE glosa_valor END,
      glosa_motivo = CASE WHEN glosa_registrada_por LIKE $2 THEN NULL ELSE glosa_motivo END,
      glosa_motivo_codigo = CASE WHEN glosa_registrada_por LIKE $2 THEN NULL ELSE glosa_motivo_codigo END,
      glosa_registrada_em = CASE WHEN glosa_registrada_por LIKE $2 THEN NULL ELSE glosa_registrada_em END,
      glosa_registrada_por = CASE WHEN glosa_registrada_por LIKE $2 THEN NULL ELSE glosa_registrada_por END,
      status = 'Frete Retido', regra_auditoria_id = NULL, atualizado_em = NOW()
    WHERE regra_auditoria_id = $1 AND fatura_id IS NULL AND COALESCE(status, '') NOT IN ('Faturado', 'Cancelado')`, [id, `${PREFIXO}%`]);
  await pool.query('UPDATE auditoria_regras SET ativo = FALSE, atualizado_em = NOW() WHERE id = $1', [id]);
  return { desfeitos: rowCount, regra: r.nome };
}

let timer = null;
function agendar() {
  if (timer) return;
  const passo = async () => {
    try {
      const r = await rodar({ aplicar: true });
      if (r.decididos.length) console.log(`[regras auditoria] ${r.decididos.length} frete(s) decididos por regra automática.`);
    } catch (e) { console.error('[regras auditoria]', e.message); }
  };
  setTimeout(passo, 60 * 1000).unref?.();
  timer = setInterval(passo, 10 * 60 * 1000); timer.unref?.();
}

module.exports = { TIPOS, ACOES, PREFIXO, listar, salvar, avaliar, rodar, desfazer, agendar };
