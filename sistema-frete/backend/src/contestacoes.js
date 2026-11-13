// Contestação de frete com a transportadora (embarcador) e motivos de glosa padronizados.
//  1. Nova contestação: a transportadora e o período → os CT-e que cobraram acima da tabela (fora da
//     tolerância), ainda sem glosa e fora de outra contestação aberta, com o valor e o motivo sugeridos.
//  2. Enviar: um e-mail só para a transportadora, com a lista no corpo e a planilha anexa.
//  3. Resposta: item por item aceito (com o valor aceito) ou recusado. O aceito vira GLOSA no frete
//     (a fatura deve vir com o desconto); se o CT-e já foi faturado, vira CRÉDITO, abatido sozinho na
//     conferência da próxima fatura da transportadora.
const pool = require('./db');

const MOTIVOS = {
  valor_acima: 'Frete acima da tabela',
  taxa_acima: 'Taxa acima da tabela',
  taxa_nao_prevista: 'Taxa não prevista na tabela',
  peso_divergente: 'Peso ou volumes diferentes da nota',
  trecho_errado: 'Trecho / cidade errada',
  icms_errado: 'ICMS errado',
  cobranca_dobro: 'Cobrança em dobro',
  nao_levou: 'Transportadora não levou a nota',
  nota_cancelada: 'Nota cancelada',
  outro: 'Outro',
};
const SITUACOES = { rascunho: 'Rascunho', enviada: 'Enviada', aceita: 'Aceita', parcial: 'Aceita em parte', recusada: 'Recusada', abatida: 'Abatida na fatura', cancelada: 'Cancelada' };
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const dataOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

// Motivo sugerido para um frete divergente (a partir do registro e da conferência por componente).
function sugerirMotivo(f, conf) {
  if (f.cte_nao_levou) return 'nao_levou';
  if (f.nf_cancelada) return 'nota_cancelada';
  if (f.alerta_cobranca_dupla) return 'cobranca_dobro';
  const cte = Number(f.valor_total_cte) || 0; const tab = Number(f.valor_total_frete) || 0;
  if (tab > 0 && cte > 0 && (cte / tab > 2 || cte / tab < 0.5)) return 'trecho_errado';
  const cod = new Set((conf?.apontamentos || []).map((a) => a.codigo));
  if (cod.has('TAXA_NAO_PREVISTA')) return 'taxa_nao_prevista';
  if (cod.has('PESO') || cod.has('VOLUMES')) return 'peso_divergente';
  if (cod.has('ICMS_ALIQUOTA') || cod.has('ICMS_BASE') || cod.has('ICMS_VALOR')) return 'icms_errado';
  const taxaAcima = (conf?.componentes || []).some((c) => c.situacao === 'a_mais' && c.chave !== 'frete_peso');
  if (taxaAcima) return 'taxa_acima';
  return 'valor_acima';
}
// Valor a contestar: o que passou da tabela; CT-e de quem não levou / nota cancelada / em dobro: o CT-e inteiro.
function valorContestado(f, motivo) {
  const cte = Number(f.valor_total_cte) || 0;
  if (['nao_levou', 'nota_cancelada', 'cobranca_dobro'].includes(motivo)) return r2(cte);
  return r2(Math.min(cte, -(Number(f.dif_negociado_tabela) || 0)));
}
// Motivo escrito para a transportadora (o código + o detalhe da conferência).
function textoMotivo(f, conf, motivo) {
  const partes = [MOTIVOS[motivo]];
  const comps = (conf?.componentes || []).filter((c) => ['a_mais', 'nao_autorizada'].includes(c.situacao));
  if (comps.length) partes.push(comps.map((c) => (c.situacao === 'nao_autorizada' ? `${c.nome} R$ ${Number(c.cobrado).toFixed(2)} (não previsto)` : `${c.nome} +R$ ${Number(c.diferenca).toFixed(2)}`)).join('; '));
  return partes.join(': ').slice(0, 300);
}

// CT-e da transportadora que podem ser contestados no período.
async function candidatos({ transportadora, de, ate }) {
  if (!String(transportadora || '').trim()) throw falha('Escolha a transportadora.');
  const ad = require('./auditoriaDetalhada');
  const tol = await require('./toleranciaAuditoria').carregar();
  const params = [String(transportadora).trim()];
  let periodo = '';
  if (dataOk(de)) { params.push(de); periodo += ` AND f.data_emissao_cte >= $${params.length}`; }
  if (dataOk(ate)) { params.push(ate); periodo += ` AND f.data_emissao_cte <= $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT ${ad.CAMPOS}, f.numero_pedido, f.dif_negociado_tabela, f.transportadora, f.cte_nao_levou, f.nf_cancelada, f.alerta_cobranca_dupla,
            f.status_aprovacao, f.fatura_id, f.numero_fatura, f.tabela_preco_id_usada
       FROM fretes f
      WHERE f.transportadora = $1 AND f.chave_cte IS NOT NULL AND NOT COALESCE(f.cte_cancelado, FALSE) AND f.carga_direta IS NOT TRUE
        AND COALESCE(f.vinculo_cte, '') <> 'complementar' AND COALESCE(f.glosa_valor, 0) = 0 AND COALESCE(f.status, '') NOT IN ('Cancelado', 'Não cobrado')
        AND NOT EXISTS (SELECT 1 FROM contestacao_itens ci JOIN contestacoes c ON c.id = ci.contestacao_id
                         WHERE ci.frete_id = f.id AND c.status NOT IN ('cancelada') AND ci.situacao <> 'recusado')
        AND (f.cte_nao_levou OR f.nf_cancelada OR f.alerta_cobranca_dupla
             OR f.dif_negociado_tabela < 0)
        ${periodo}
      ORDER BY f.data_emissao_cte, f.numero_cte LIMIT 1000`, params);
  const somas = await ad.somasCobertas(rows.map((r) => r.id));
  const tolTotal = require('./toleranciaAuditoria');
  const lista = [];
  for (const f of rows) {
    const motivo0 = sugerirMotivo(f, null);
    const valor0 = valorContestado(f, motivo0);
    const tab = Number(f.valor_total_frete) || 0;
    // Diferença pequena (dentro da tolerância da transportadora): não entra.
    if (!['nao_levou', 'nota_cancelada', 'cobranca_dobro'].includes(motivo0) && valor0 <= tolTotal.valorDe(tol, f.transportadora_id_tol, 'total', tab) + 0.004) continue;
    let conf = null;
    try { conf = ad.conferirFrete(f, tol, somas.get(f.id)); } catch { conf = null; }
    const motivo = sugerirMotivo(f, conf);
    lista.push({
      frete_id: f.id, numero_cte: f.numero_cte, numero_nf: f.numero_nf, numero_pedido: f.numero_pedido, cliente: f.cliente,
      data: f.data_emissao_cte, valor_cte: r2(f.valor_total_cte), valor_tabela: tab ? r2(tab) : null,
      valor_contestado: valorContestado(f, motivo), motivo_codigo: motivo, motivo_texto: textoMotivo(f, conf, motivo),
      faturado: !!f.fatura_id, numero_fatura: f.numero_fatura || null, aprovado: f.status_aprovacao === 'Aprovado',
    });
  }
  return { transportadora: params[0], email: await emailDa(params[0]), itens: lista };
}
async function emailDa(transportadora) {
  const { rows: [t] } = await pool.query('SELECT email FROM transportadoras WHERE UPPER(TRIM(razao_social)) = UPPER(TRIM($1)) AND email IS NOT NULL LIMIT 1', [transportadora]);
  return t?.email || null;
}

async function criar(b, usuarioNome) {
  const transportadora = String(b.transportadora || '').trim();
  if (!transportadora) throw falha('Escolha a transportadora.');
  const itens = (Array.isArray(b.itens) ? b.itens : []).map((i) => ({
    frete_id: Number(i.frete_id), valor: r2(String(i.valor_contestado ?? '').replace(',', '.')), motivo: MOTIVOS[i.motivo_codigo] ? i.motivo_codigo : 'outro',
    texto: String(i.motivo_texto || '').trim().slice(0, 300) || null,
  })).filter((i) => i.frete_id && i.valor > 0);
  if (!itens.length) throw falha('Marque pelo menos um CT-e com valor a contestar.');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: fretes } = await db.query(`SELECT f.id, f.numero_cte, f.numero_nf, f.transportadora, f.valor_total_cte AS valor_cte, f.valor_total_frete AS valor_tabela,
        EXISTS (SELECT 1 FROM contestacao_itens ci JOIN contestacoes c ON c.id = ci.contestacao_id WHERE ci.frete_id = f.id AND c.status <> 'cancelada' AND ci.situacao <> 'recusado') AS ja
      FROM fretes f WHERE f.id = ANY($1::int[]) FOR UPDATE OF f`, [itens.map((i) => i.frete_id)]);
    const porId = new Map(fretes.map((f) => [f.id, f]));
    for (const i of itens) {
      const f = porId.get(i.frete_id);
      if (!f) throw falha('Algum CT-e não foi encontrado. Atualize a lista.', 404);
      if (f.transportadora !== transportadora) throw falha(`O CT-e ${f.numero_cte} é de outra transportadora.`);
      if (f.ja) throw falha(`O CT-e ${f.numero_cte} já está em outra contestação aberta.`, 409);
      if (i.valor > Number(f.valor_cte) + 0.004) throw falha(`O valor contestado do CT-e ${f.numero_cte} é maior que o próprio CT-e.`);
    }
    const total = r2(itens.reduce((s, i) => s + i.valor, 0));
    const { rows: [c] } = await db.query(`INSERT INTO contestacoes (transportadora, email_para, de, ate, valor_contestado, observacao, criado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [transportadora, String(b.email_para || '').trim().slice(0, 300) || await emailDa(transportadora), dataOk(b.de), dataOk(b.ate), total,
      String(b.observacao || '').trim().slice(0, 2000) || null, usuarioNome]);
    for (const i of itens) {
      const f = porId.get(i.frete_id);
      await db.query(`INSERT INTO contestacao_itens (contestacao_id, frete_id, numero_cte, numero_nf, valor_cte, valor_tabela, valor_contestado, motivo_codigo, motivo_texto)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [c.id, f.id, f.numero_cte, f.numero_nf, f.valor_cte, f.valor_tabela, i.valor, i.motivo, i.texto || MOTIVOS[i.motivo]]);
    }
    await db.query('COMMIT');
    return detalhe(c.id);
  } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
}

async function listar(q = {}) {
  const params = []; const cond = [];
  if (q.status && SITUACOES[q.status]) { params.push(q.status); cond.push(`c.status = $${params.length}`); }
  if (q.abertas === '1') cond.push("c.status IN ('rascunho', 'enviada')");
  if (String(q.transportadora || '').trim()) { params.push(`%${String(q.transportadora).trim()}%`); cond.push(`c.transportadora ILIKE $${params.length}`); }
  const { rows } = await pool.query(`SELECT c.*, (SELECT COUNT(*)::int FROM contestacao_itens i WHERE i.contestacao_id = c.id) AS qtd,
      (SELECT COALESCE(SUM(i.valor_aceito), 0) FROM contestacao_itens i WHERE i.contestacao_id = c.id AND i.credito AND i.abatido_fatura_id IS NULL AND i.situacao = 'aceito')::float AS credito_pendente
    FROM contestacoes c ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY c.id DESC LIMIT 300`, params);
  return rows;
}
async function detalhe(id) {
  const { rows: [c] } = await pool.query('SELECT * FROM contestacoes WHERE id = $1', [id]);
  if (!c) throw falha('Contestação não encontrada.', 404);
  const { rows: itens } = await pool.query(`SELECT i.*, f.cliente, f.numero_pedido, f.data_emissao_cte, f.status AS frete_status, f.glosa_valor, ff.numero AS fatura_abatida
    FROM contestacao_itens i JOIN fretes f ON f.id = i.frete_id LEFT JOIN faturas_frete ff ON ff.id = i.abatido_fatura_id WHERE i.contestacao_id = $1 ORDER BY i.id`, [id]);
  return { ...c, itens };
}

// ---------- Planilha e e-mail ----------
function planilha(c) {
  const XLSX = require('xlsx');
  const linhas = [['CT-e', 'NF', 'Pedido', 'Cliente', 'Emissão', 'Valor do CT-e', 'Valor pela tabela', 'Valor contestado', 'Motivo', 'Detalhe', 'Situação', 'Valor aceito']];
  c.itens.forEach((i) => linhas.push([i.numero_cte, i.numero_nf, i.numero_pedido, i.cliente, i.data_emissao_cte ? new Date(i.data_emissao_cte).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '',
    Number(i.valor_cte), i.valor_tabela != null ? Number(i.valor_tabela) : '', Number(i.valor_contestado), MOTIVOS[i.motivo_codigo] || i.motivo_codigo, i.motivo_texto || '',
    { pendente: 'Pendente', aceito: 'Aceito', recusado: 'Recusado' }[i.situacao] || i.situacao, i.valor_aceito != null ? Number(i.valor_aceito) : '']));
  linhas.push(['TOTAL', '', '', '', '', '', '', Number(c.valor_contestado)]);
  const folha = XLSX.utils.aoa_to_sheet(linhas);
  folha['!cols'] = [10, 10, 10, 30, 11, 14, 14, 14, 30, 50, 11, 12].map((wch) => ({ wch }));
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, folha, 'Contestação');
  return XLSX.write(livro, { type: 'buffer', bookType: 'xlsx' });
}
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
async function htmlEmail(c) {
  const { rows: [emp] } = await pool.query('SELECT razao_social, cnpj, telefone, email FROM empresa WHERE id = 1').catch(() => ({ rows: [{}] }));
  const periodo = c.de || c.ate ? ` (CT-e de ${c.de ? new Date(c.de).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '…'} a ${c.ate ? new Date(c.ate).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '…'})` : '';
  return `<div style="font-family:Arial,sans-serif; font-size:14px; color:#1f2937;">
    <p>Prezados, ${esc(c.transportadora)},</p>
    <p>Na conferência dos CT-e com a tabela de frete negociada${periodo}, encontramos as cobranças abaixo, que somam <b>${brl(c.valor_contestado)}</b>.
      Pedimos que confiram e respondam, item a item, se aceitam o desconto. O valor aceito deve vir abatido na próxima fatura.</p>
    <table style="border-collapse:collapse; font-size:12.5px;"><thead><tr>${['CT-e', 'NF', 'Valor do CT-e', 'Pela tabela', 'Contestado', 'Motivo'].map((h) => `<th style="text-align:left; border-bottom:2px solid #d1d5db; padding:5px 8px;">${h}</th>`).join('')}</tr></thead>
    <tbody>${c.itens.map((i) => `<tr><td style="padding:4px 8px; border-bottom:1px solid #e5e7eb;">${esc(i.numero_cte)}</td><td style="padding:4px 8px; border-bottom:1px solid #e5e7eb;">${esc(i.numero_nf || '')}</td>
      <td style="padding:4px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${brl(i.valor_cte)}</td><td style="padding:4px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${i.valor_tabela != null ? brl(i.valor_tabela) : '—'}</td>
      <td style="padding:4px 8px; border-bottom:1px solid #e5e7eb; text-align:right;"><b>${brl(i.valor_contestado)}</b></td><td style="padding:4px 8px; border-bottom:1px solid #e5e7eb;">${esc(i.motivo_texto || MOTIVOS[i.motivo_codigo])}</td></tr>`).join('')}
    <tr><td colspan="4" style="padding:6px 8px; text-align:right;"><b>Total</b></td><td style="padding:6px 8px; text-align:right;"><b>${brl(c.valor_contestado)}</b></td><td></td></tr></tbody></table>
    ${c.observacao ? `<p>${esc(c.observacao)}</p>` : ''}
    <p>A planilha com todos os itens vai anexa. Contestação nº ${c.id}.</p>
    <p>Atenciosamente,<br>${esc(emp?.razao_social || '')}${emp?.telefone ? `<br>${esc(emp.telefone)}` : ''}${emp?.email ? `<br>${esc(emp.email)}` : ''}</p></div>`;
}
async function enviar(id, usuarioNome, para) {
  const c = await detalhe(id);
  if (!['rascunho', 'enviada'].includes(c.status)) throw falha('Esta contestação já foi respondida ou cancelada.', 409);
  const email = String(para || c.email_para || '').trim();
  const lista = email.split(/[;,\s]+/).filter(Boolean);
  if (!lista.length || lista.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) throw falha('Informe o e-mail da transportadora (no cadastro dela ou aqui).');
  await require('./email').enviarRelatorio({ para: lista.join(', '), assunto: `Contestação de frete nº ${c.id} — ${c.transportadora} — ${brl(c.valor_contestado)}`, html: await htmlEmail(c),
    anexos: [{ filename: `contestacao-${c.id}.xlsx`, content: planilha(c) }] });
  await pool.query("UPDATE contestacoes SET status = 'enviada', email_para = $2, enviada_em = NOW(), enviada_por = $3, atualizado_em = NOW() WHERE id = $1", [id, lista.join(', '), usuarioNome]);
  return detalhe(id);
}
// Sem e-mail: marcar como enviada por outro meio (WhatsApp, portal da transportadora...).
async function marcarEnviada(id, usuarioNome) {
  const { rowCount } = await pool.query("UPDATE contestacoes SET status = 'enviada', enviada_em = NOW(), enviada_por = $2, atualizado_em = NOW() WHERE id = $1 AND status = 'rascunho'", [id, usuarioNome]);
  if (!rowCount) throw falha('Só a contestação em rascunho pode ser marcada como enviada.', 409);
  return detalhe(id);
}

// ---------- Resposta da transportadora ----------
// b: { itens: [{ id, situacao: 'aceito'|'recusado', valor_aceito }], resposta }
async function responder(id, b, usuarioNome) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [c] } = await db.query('SELECT * FROM contestacoes WHERE id = $1 FOR UPDATE', [id]);
    if (!c) throw falha('Contestação não encontrada.', 404);
    if (!['rascunho', 'enviada'].includes(c.status)) throw falha('Esta contestação já foi respondida ou cancelada.', 409);
    const { rows: itens } = await db.query('SELECT i.*, f.fatura_id, f.status AS frete_status FROM contestacao_itens i JOIN fretes f ON f.id = i.frete_id WHERE i.contestacao_id = $1 FOR UPDATE OF i', [id]);
    const resp = new Map((Array.isArray(b.itens) ? b.itens : []).map((x) => [Number(x.id), x]));
    let aceito = 0; let nAceitos = 0; let nRecusados = 0;
    for (const i of itens) {
      const x = resp.get(i.id);
      if (!x || !['aceito', 'recusado'].includes(x.situacao)) throw falha(`Responda o CT-e ${i.numero_cte} (aceito ou recusado).`);
      if (x.situacao === 'recusado') {
        nRecusados += 1;
        await db.query("UPDATE contestacao_itens SET situacao = 'recusado', valor_aceito = 0 WHERE id = $1", [i.id]);
        continue;
      }
      const v = r2(String(x.valor_aceito ?? i.valor_contestado).replace(',', '.'));
      if (!(v > 0) || v > Number(i.valor_contestado) + 0.004) throw falha(`Valor aceito do CT-e ${i.numero_cte}: entre R$ 0,01 e o contestado.`);
      nAceitos += 1; aceito = r2(aceito + v);
      const credito = !!i.fatura_id || i.frete_status === 'Faturado';
      await db.query("UPDATE contestacao_itens SET situacao = 'aceito', valor_aceito = $2, credito = $3 WHERE id = $1", [i.id, v, credito]);
      // Ainda não faturado: vira glosa no frete (a fatura deve vir com o desconto) e o frete fica liberado.
      if (!credito) {
        const motivo = `Contestação nº ${id} aceita pela transportadora: ${i.motivo_texto || MOTIVOS[i.motivo_codigo]}`.slice(0, 500);
        await db.query(`UPDATE fretes SET glosa_valor = $1, glosa_motivo = $2, glosa_motivo_codigo = $3, glosa_registrada_por = $4, glosa_registrada_em = NOW(),
            status_aprovacao = 'Aprovado', aprovado_por_nome = $4, aprovado_em = NOW(), motivo_rejeicao = NULL,
            justificativa_aprovacao = $5, status = CASE WHEN status = 'Frete Retido' THEN 'Liberado p/ Pagamento' ELSE status END, atualizado_em = NOW()
          WHERE id = $6`, [v, motivo, i.motivo_codigo, usuarioNome, `Divergência resolvida pela contestação nº ${id}: glosa de ${v.toFixed(2)} aceita pela transportadora.`, i.frete_id]);
      }
    }
    const status = nAceitos && !nRecusados ? 'aceita' : nAceitos ? 'parcial' : 'recusada';
    await db.query(`UPDATE contestacoes SET status = $2, valor_aceito = $3, resposta = $4, respondida_em = NOW(), respondida_por = $5, atualizado_em = NOW() WHERE id = $1`,
      [id, status, aceito, String(b.resposta || '').trim().slice(0, 2000) || null, usuarioNome]);
    await db.query('COMMIT');
    return detalhe(id);
  } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
}
async function cancelar(id, usuarioNome) {
  const { rowCount } = await pool.query("UPDATE contestacoes SET status = 'cancelada', resposta = CONCAT_WS(E'\\n', resposta, $2::text), atualizado_em = NOW() WHERE id = $1 AND status IN ('rascunho', 'enviada')",
    [id, `Cancelada por ${usuarioNome}`]);
  if (!rowCount) throw falha('Só dá para cancelar contestação em rascunho ou enviada.', 409);
  return true;
}

// ---------- Créditos na conferência da fatura ----------
async function creditosPendentes(db, transportadora) {
  const { rows } = await db.query(`SELECT i.id, i.contestacao_id, i.numero_cte, i.valor_aceito::float FROM contestacao_itens i JOIN contestacoes c ON c.id = i.contestacao_id
     WHERE c.transportadora = $1 AND i.situacao = 'aceito' AND i.credito AND i.abatido_fatura_id IS NULL ORDER BY i.id FOR UPDATE OF i`, [transportadora]);
  return rows;
}
async function abaterCreditos(db, faturaId, creditos) {
  if (!creditos.length) return;
  await db.query('UPDATE contestacao_itens SET abatido_fatura_id = $1, abatido_em = NOW() WHERE id = ANY($2::int[])', [faturaId, creditos.map((x) => x.id)]);
  // Contestação com todos os créditos abatidos (e sem glosa pendente) vira "abatida".
  await db.query(`UPDATE contestacoes c SET status = 'abatida', atualizado_em = NOW() WHERE c.id = ANY($1::int[]) AND c.status IN ('aceita', 'parcial')
     AND NOT EXISTS (SELECT 1 FROM contestacao_itens i WHERE i.contestacao_id = c.id AND i.situacao = 'aceito' AND i.credito AND i.abatido_fatura_id IS NULL)`, [[...new Set(creditos.map((x) => x.contestacao_id))]]);
}

// ---------- Glosas por motivo (para ver o que mais gera desconto) ----------
async function resumoMotivos({ de, ate } = {}) {
  const params = []; let cond = 'f.glosa_valor > 0';
  if (dataOk(de)) { params.push(de); cond += ` AND f.glosa_registrada_em::date >= $${params.length}`; }
  if (dataOk(ate)) { params.push(ate); cond += ` AND f.glosa_registrada_em::date <= $${params.length}`; }
  const { rows } = await pool.query(`SELECT COALESCE(f.glosa_motivo_codigo, 'sem_motivo') AS motivo, f.transportadora, COUNT(*)::int AS qtd, SUM(f.glosa_valor)::float AS valor
     FROM fretes f WHERE ${cond} GROUP BY 1, 2 ORDER BY valor DESC`, params);
  const porMotivo = {}; const porTransp = {};
  for (const r of rows) {
    const m = porMotivo[r.motivo] || (porMotivo[r.motivo] = { motivo: r.motivo, nome: MOTIVOS[r.motivo] || 'Sem motivo informado', qtd: 0, valor: 0 });
    m.qtd += r.qtd; m.valor = r2(m.valor + r.valor);
    const t = porTransp[r.transportadora] || (porTransp[r.transportadora] = { transportadora: r.transportadora, qtd: 0, valor: 0, motivos: {} });
    t.qtd += r.qtd; t.valor = r2(t.valor + r.valor); t.motivos[r.motivo] = r2((t.motivos[r.motivo] || 0) + r.valor);
  }
  const { rows: [cr] } = await pool.query(`SELECT COALESCE(SUM(valor_aceito) FILTER (WHERE credito AND abatido_fatura_id IS NULL), 0)::float AS credito_pendente,
     COALESCE(SUM(valor_aceito) FILTER (WHERE credito AND abatido_fatura_id IS NOT NULL), 0)::float AS credito_abatido FROM contestacao_itens WHERE situacao = 'aceito'`);
  return { por_motivo: Object.values(porMotivo).sort((a, b) => b.valor - a.valor), por_transportadora: Object.values(porTransp).sort((a, b) => b.valor - a.valor), ...cr };
}

module.exports = { MOTIVOS, SITUACOES, sugerirMotivo, valorContestado, candidatos, criar, listar, detalhe, planilha, enviar, marcarEnviada, responder, cancelar, creditosPendentes, abaterCreditos, resumoMotivos };
