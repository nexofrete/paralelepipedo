// Gestão de NF-e (embarcador): os dados completos da nota (série, emitente, valor dos
// produtos, peso bruto e líquido, saída, endereço de entrega), a consulta com filtros,
// o XML (um ou vários em .zip), o DANFE e a denegação.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');
const pool = require('./db');
const { consultaCliente } = require('./permissoes');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false });
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const num = (v) => (v != null && String(v).trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const dig = (v) => String(v ?? '').replace(/\D/g, '');
const CSTAT_DENEGADA = ['110', '301', '302', '303'];

function lerXml(xml) {
  const j = parser.parse(xml);
  const nfe = j.nfeProc?.NFe || j.NFe;
  const inf = nfe?.infNFe;
  if (!inf) throw falha('XML não é uma NF-e.');
  return { inf, prot: j.nfeProc?.protNFe?.infProt || null };
}

// Os campos novos da nota, a partir do XML.
function dadosDaNota(xml) {
  const { inf, prot } = lerXml(xml);
  const ide = inf.ide || {}; const emit = inf.emit || {}; const dest = inf.dest || {};
  const tot = inf.total?.ICMSTot || {}; const vols = lista(inf.transp?.vol);
  const soma = (c) => { const v = vols.map((x) => num(x[c])).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
  const ent = inf.entrega; const ed = dest.enderDest || {};
  const end = ent ? { logradouro: ent.xLgr, numero: ent.nro, complemento: ent.xCpl, bairro: ent.xBairro, cidade: ent.xMun, uf: ent.UF, cep: ent.CEP, nome: ent.xNome, local_diferente: true }
    : { logradouro: ed.xLgr, numero: ed.nro, complemento: ed.xCpl, bairro: ed.xBairro, cidade: ed.xMun, uf: ed.UF, cep: ed.CEP, local_diferente: false };
  const saida = ide.dhSaiEnt || (ide.dSaiEnt ? `${ide.dSaiEnt}T${ide.hSaiEnt || '00:00:00'}` : null);
  return {
    nf_serie: ide.serie != null ? String(ide.serie) : null,
    emitente_nome: emit.xNome ? String(emit.xNome).slice(0, 200) : null,
    emitente_cnpj: dig(emit.CNPJ || emit.CPF) || null,
    valor_produtos: num(tot.vProd),
    peso_bruto: soma('pesoB'), peso_liquido: soma('pesoL'),
    // Data/hora de saída no horário de Brasília (sem o fuso).
    data_saida: saida ? String(saida).slice(0, 19).replace('T', ' ') : null,
    entrega_endereco: JSON.stringify(Object.fromEntries(Object.entries(end).map(([k, v]) => [k, v == null ? null : typeof v === 'boolean' ? v : String(v)]))),
    denegada: prot ? CSTAT_DENEGADA.includes(String(prot.cStat)) : false,
    protocolo: prot ? { cStat: String(prot.cStat || ''), xMotivo: prot.xMotivo || '', nProt: prot.nProt || '' } : null,
  };
}

// Denegada: fica marcada (e conta como cancelada para o frete: sai de "aguardando CT-e" e o CT-e que vier fica retido).
async function marcarDenegada(id, motivo) {
  await pool.query(`UPDATE fretes SET nf_denegada = TRUE, nf_cancelada = TRUE,
      observacoes = CASE WHEN POSITION('USO DENEGADO' IN UPPER(COALESCE(observacoes, ''))) > 0 THEN observacoes ELSE CONCAT_WS(E'\\n', NULLIF(observacoes, ''), $2::text) END, atualizado_em = NOW()
    WHERE id = $1 OR frete_principal_id = $1`, [id, `⚠ NF-e com USO DENEGADO pela SEFAZ${motivo ? ` (${motivo})` : ''}: não tem valor fiscal, não deve circular nem gerar frete.`]);
}

async function completar(id) {
  const { rows: [f] } = await pool.query('SELECT id, xml_nfe_original FROM fretes WHERE id = $1', [id]);
  if (!f?.xml_nfe_original) return false;
  let d;
  try { d = dadosDaNota(f.xml_nfe_original); } catch { await pool.query('UPDATE fretes SET nf_dados_em = NOW() WHERE id = $1', [id]); return false; }
  await pool.query(`UPDATE fretes SET nf_serie = $2, emitente_nome = $3, emitente_cnpj = $4, valor_produtos = $5, peso_bruto = $6, peso_liquido = $7,
      data_saida = $8, entrega_endereco = $9, nf_dados_em = NOW() WHERE id = $1`,
  [id, d.nf_serie, d.emitente_nome, d.emitente_cnpj, d.valor_produtos, d.peso_bruto, d.peso_liquido, d.data_saida, d.entrega_endereco]);
  if (d.denegada) await marcarDenegada(id, `${d.protocolo.cStat} ${d.protocolo.xMotivo}`.trim());
  return { ok: true, denegada: d.denegada };
}
// As notas já importadas: preenche a partir do XML guardado (aos poucos, ao ligar o sistema).
let completando = false;
async function completarTodos() {
  if (completando) return 0;
  completando = true; let n = 0;
  try {
    for (;;) {
      const { rows } = await pool.query('SELECT id FROM fretes WHERE xml_nfe_original IS NOT NULL AND nf_dados_em IS NULL LIMIT 300');
      if (!rows.length) break;
      for (const r of rows) { await completar(r.id).catch(() => pool.query('UPDATE fretes SET nf_dados_em = NOW() WHERE id = $1', [r.id])); n += 1; }
    }
  } finally { completando = false; }
  if (n) console.log(`[notas] ${n} nota(s) com série, emitente, pesos, saída e endereço lidos do XML.`);
  return n;
}

// ---------- Consulta ----------
const SITUACAO = `CASE WHEN f.nf_denegada THEN 'denegada' WHEN f.nf_cancelada THEN 'cancelada' ELSE 'autorizada' END`;
function filtros(q, params) {
  const cond = ['f.frete_principal_id IS NULL', "(f.numero_nf IS NOT NULL AND f.numero_nf <> '')"];
  const add = (sql, v) => { params.push(v); cond.push(sql.replace(/\?/g, `$${params.length}`)); };
  const t = String(q.busca || '').trim();
  if (t) {
    const d = dig(t);
    if (d.length === 44) add('f.chave_nfe = ?', d);
    else add(`(LTRIM(f.numero_nf, '0') = LTRIM(?, '0') OR f.cliente ILIKE '%' || ? || '%' OR f.emitente_nome ILIKE '%' || ? || '%' OR f.numero_pedido = ?)`, t);
  }
  if (String(q.emitente || '').trim()) { const e = String(q.emitente).trim(); dig(e).length >= 8 ? add('f.emitente_cnpj LIKE ? || \'%\'', dig(e)) : add("f.emitente_nome ILIKE '%' || ? || '%'", e); }
  if (String(q.destinatario || '').trim()) { const e = String(q.destinatario).trim(); dig(e).length >= 8 ? add("regexp_replace(COALESCE(f.cliente_documento, ''), '\\D', '', 'g') LIKE ? || '%'", dig(e)) : add("f.cliente ILIKE '%' || ? || '%'", e); }
  if (String(q.serie || '').trim()) add('f.nf_serie = ?', String(q.serie).trim());
  if (/^[A-Za-z]{2}$/.test(q.uf || '')) add('UPPER(f.uf) = ?', q.uf.toUpperCase());
  if (String(q.cidade || '').trim()) add("f.cidade ILIKE '%' || ? || '%'", String(q.cidade).trim());
  const campoData = q.data === 'saida' ? 'f.data_saida::date' : 'f.data_emissao_nf';
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.de || '')) add(`${campoData} >= ?::date`, q.de);
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.ate || '')) add(`${campoData} <= ?::date`, q.ate);
  if (['autorizada', 'cancelada', 'denegada'].includes(q.situacao)) add(`${SITUACAO} = ?`, q.situacao);
  if (q.situacao === 'sem_cte') cond.push(`f.chave_cte IS NULL AND f.cte_coberto_por IS NULL AND f.nf_cancelada IS NOT TRUE`);
  return cond.join(' AND ');
}
const COLUNAS = `f.id, f.numero_nf, f.nf_serie, f.chave_nfe, f.data_emissao_nf, f.data_saida, f.emitente_nome, f.emitente_cnpj, f.cliente, f.cliente_documento,
  f.cidade, f.uf, f.entrega_endereco, f.valor_produtos::float, f.valor_faturado::float, f.peso_bruto::float, f.peso_liquido::float, f.peso_kg::float, f.qtd_volumes,
  f.numero_pedido, f.numero_cte, f.transportadora_nfe, f.status, f.data_entrega, (f.xml_nfe_original IS NOT NULL) AS tem_xml, ${SITUACAO} AS situacao`;
async function listar(req, q = {}) {
  const params = [];
  const where = filtros(q, params);
  const { rows } = await consultaCliente(req, `SELECT ${COLUNAS} FROM fretes f WHERE ${where} ORDER BY f.data_emissao_nf DESC NULLS LAST, f.id DESC LIMIT 2000`, params);
  const { rows: [t] } = await consultaCliente(req,
    `SELECT COUNT(*)::int AS notas, COALESCE(SUM(f.valor_faturado), 0)::float AS valor, COALESCE(SUM(f.valor_produtos), 0)::float AS produtos,
            COALESCE(SUM(COALESCE(f.peso_bruto, f.peso_kg)), 0)::float AS peso, COALESCE(SUM(f.qtd_volumes), 0)::int AS volumes,
            COUNT(*) FILTER (WHERE f.nf_cancelada AND NOT f.nf_denegada)::int AS canceladas, COUNT(*) FILTER (WHERE f.nf_denegada)::int AS denegadas
       FROM fretes f WHERE ${where}`, params);
  return { totais: t, notas: rows, limite: rows.length >= 2000 };
}

async function xmlDaNota(req, id) {
  const { rows: [f] } = await consultaCliente(req, 'SELECT f.numero_nf, f.chave_nfe, f.nf_cancelada, f.nf_denegada, f.xml_nfe_original FROM fretes f WHERE f.id = $1', [id]);
  if (!f?.xml_nfe_original) throw falha('Esta nota não tem o XML guardado (entrou pela planilha do ERP).', 404);
  return { nome: `${f.chave_nfe || `NF-${f.numero_nf}`}-nfe.xml`, xml: f.xml_nfe_original, cancelada: !!f.nf_cancelada && !f.nf_denegada };
}
// Vários XML num .zip (os filtrados na tela, até 5000).
async function zipDasNotas(req, q = {}) {
  const params = [];
  const where = filtros(q, params);
  const { rows } = await consultaCliente(req, `SELECT f.numero_nf, f.chave_nfe, f.xml_nfe_original FROM fretes f WHERE ${where} AND f.xml_nfe_original IS NOT NULL ORDER BY f.data_emissao_nf LIMIT 5000`, params);
  if (!rows.length) throw falha('Nenhuma nota com XML nos filtros escolhidos.', 404);
  const { EscritorZip } = require('./utils/zip');
  const arquivo = path.join(os.tmpdir(), `notas-${crypto.randomBytes(6).toString('hex')}.zip`);
  const zip = new EscritorZip(arquivo);
  const usados = new Set();
  for (const r of rows) {
    let nome = `${r.chave_nfe || `NF-${r.numero_nf}`}-nfe.xml`;
    while (usados.has(nome)) nome = nome.replace('.xml', '-2.xml');
    usados.add(nome);
    zip.adicionar(nome, Buffer.from(r.xml_nfe_original, 'utf8'));
  }
  zip.fechar();
  return { arquivo, quantidade: rows.length };
}

// DANFE de várias notas numa página (as marcadas na tela, ou as do filtro), até 300.
const LIMITE_LOTE = 300;
async function danfesEmLote(req, q = {}) {
  const params = [];
  let where = filtros(q, params);
  const ids = String(q.ids || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length) { params.push(ids); where += ` AND f.id = ANY($${params.length}::int[])`; }
  const { rows } = await consultaCliente(req, `SELECT f.numero_nf, f.nf_cancelada, f.nf_denegada, f.xml_nfe_original FROM fretes f
     WHERE ${where} AND f.xml_nfe_original IS NOT NULL ORDER BY f.data_emissao_nf, f.numero_nf LIMIT ${LIMITE_LOTE + 1}`, params);
  if (!rows.length) throw falha('Nenhuma nota com XML para imprimir.', 404);
  if (rows.length > LIMITE_LOTE) throw falha(`São mais de ${LIMITE_LOTE} notas: filtre um período menor ou marque as notas.`, 400);
  return { quantidade: rows.length, html: require('./danfe').danfeLote(rows.map((r) => ({ xml: r.xml_nfe_original, numero: r.numero_nf, marca: r.nf_cancelada && !r.nf_denegada ? 'CANCELADA' : null }))) };
}
// Eventos da nota (cancelamento, Carta de Correção, Comprovante de Entrega...), com o XML guardado.
async function eventosDaNota(req, id) {
  const { rows: [f] } = await consultaCliente(req, 'SELECT f.chave_nfe FROM fretes f WHERE f.id = $1', [id]);
  if (!f) throw falha('Nota não encontrada.', 404);
  if (!f.chave_nfe) return [];
  const { rows } = await pool.query(`SELECT id, tp_evento, descricao, detalhe, protocolo, dh_evento, usuario_nome, criado_em FROM documento_eventos
     WHERE chave = $1 ORDER BY COALESCE(dh_evento, criado_em::date), id`, [f.chave_nfe]);
  return rows;
}
async function xmlDoEvento(req, id, eventoId) {
  if (!(await eventosDaNota(req, id)).some((e) => e.id === eventoId)) throw falha('Evento não encontrado.', 404);
  const { rows: [e] } = await pool.query('SELECT chave, tp_evento, xml FROM documento_eventos WHERE id = $1', [eventoId]);
  return { nome: `${e.chave}-evento-${e.tp_evento || 'x'}-${eventoId}.xml`, xml: e.xml };
}

module.exports = { danfesEmLote, eventosDaNota, xmlDoEvento, dadosDaNota, completar, completarTodos, marcarDenegada, listar, xmlDaNota, zipDasNotas, lerXml, CSTAT_DENEGADA };
