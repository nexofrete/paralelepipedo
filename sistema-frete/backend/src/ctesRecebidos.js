// Gestão de CT-e recebidos (embarcador): os dados completos do CT-e lidos do XML guardado
// (remetente, destinatário, cidades, modal, CFOP, ICMS), a consulta com filtros e totais,
// o XML (um ou vários em .zip), o DACTE e os eventos (Carta de Correção, Cancelamento...).
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');
const pool = require('./db');
const { vePotudo, textoLimpo } = require('./permissoes');
const { parseCTe } = require('./utils/xmlParser');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false });
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const num = (v) => (v != null && String(v).trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const doc = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const corta = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));

const MODAIS = { '01': 'Rodoviário', '02': 'Aéreo', '03': 'Aquaviário', '04': 'Ferroviário', '05': 'Dutoviário', '06': 'Multimodal' };
const SERVICOS = { 0: 'Normal', 1: 'Subcontratação', 2: 'Redespacho', 3: 'Redespacho intermediário', 4: 'Vinculado a multimodal' };
const TIPOS = { 0: 'Normal', 1: 'Complementar', 2: 'Anulação', 3: 'Substituto' };

function lerXml(xml) {
  const j = parser.parse(xml);
  const cte = j.cteProc?.CTe || j.CTe || j.cteOSProc?.CTeOS || j.CTeOS;
  const inf = cte?.infCte;
  if (!inf) throw falha('XML não é um CT-e.');
  return { inf, prot: (j.cteProc || j.cteOSProc)?.protCTe?.infProt || null };
}

// Os campos novos do CT-e, a partir do XML.
function dadosDoCte(xml) {
  const p = parseCTe(xml);
  const { prot } = lerXml(xml);
  return {
    cte_serie: corta(p.serie_cte, 5),
    cte_remetente_nome: corta(p.remetente_nome, 200), cte_remetente_doc: corta(p.remetente_doc, 20),
    cte_destinatario_nome: corta(p.destinatario_nome, 200), cte_destinatario_doc: corta(p.destinatario_doc, 20),
    cte_cidade_inicio: corta(p.cidade_inicio, 100), cte_cidade_fim: corta(p.cidade_fim, 100),
    cte_modal: corta(p.modal, 2), cte_cfop: corta(p.cfop, 4), cte_icms_cst: corta(p.icms_cst, 10),
    cte_icms_base: p.icms_base, cte_icms_aliquota: p.icms_aliquota, cte_icms_valor: p.icms_valor,
    cte_protocolo: corta(prot?.nProt, 20),
  };
}
const CAMPOS = ['cte_serie', 'cte_remetente_nome', 'cte_remetente_doc', 'cte_destinatario_nome', 'cte_destinatario_doc', 'cte_cidade_inicio', 'cte_cidade_fim',
  'cte_modal', 'cte_cfop', 'cte_icms_cst', 'cte_icms_base', 'cte_icms_aliquota', 'cte_icms_valor', 'cte_protocolo'];

async function completar(id) {
  const { rows: [f] } = await pool.query('SELECT id, xml_cte_original FROM fretes WHERE id = $1', [id]);
  if (!f?.xml_cte_original) return false;
  let d;
  try { d = dadosDoCte(f.xml_cte_original); } catch { await pool.query('UPDATE fretes SET cte_dados_em = NOW() WHERE id = $1', [id]); return false; }
  await pool.query(`UPDATE fretes SET ${CAMPOS.map((c, i) => `${c} = $${i + 2}`).join(', ')}, cte_dados_em = NOW() WHERE id = $1`, [id, ...CAMPOS.map((c) => d[c])]);
  return true;
}
// Os CT-e sem os dados (importados antes, ou com o XML trocado): lê do XML guardado.
let completando = null;
function completarTodos() {
  if (completando) return completando;
  completando = (async () => {
    let n = 0;
    for (;;) {
      const { rows } = await pool.query('SELECT id FROM fretes WHERE xml_cte_original IS NOT NULL AND cte_dados_em IS NULL LIMIT 300');
      if (!rows.length) break;
      for (const r of rows) { await completar(r.id).catch(() => pool.query('UPDATE fretes SET cte_dados_em = NOW() WHERE id = $1', [r.id])); n += 1; }
    }
    if (n) console.log(`[ctes] ${n} CT-e com remetente, cidades, modal, CFOP e ICMS lidos do XML.`);
    return n;
  })().finally(() => { completando = null; });
  return completando;
}

// ---------- Consulta ----------
const SITUACAO = `CASE WHEN f.cte_cancelado THEN 'cancelado' WHEN f.tipo_cte = 1 THEN 'complementar' WHEN f.tipo_cte = 2 THEN 'anulacao' WHEN f.tipo_cte = 3 THEN 'substituto' ELSE 'normal' END`;
function filtros(req, q, params) {
  const cond = ["f.chave_cte IS NOT NULL AND f.chave_cte <> ''"];
  const add = (sql, v) => { params.push(v); cond.push(sql.replace(/\?/g, `$${params.length}`)); };
  if (!vePotudo(req)) add('f.cliente = ?', textoLimpo(req.usuario?.cliente_nome) ?? '');
  const quem = (campoDoc, campoNome, v) => {
    const t = String(v || '').trim(); if (!t) return;
    const d = doc(t);
    if (d.length >= 8 && /^\d/.test(d)) add(`${campoDoc} LIKE ? || '%'`, d); else add(`${campoNome} ILIKE '%' || ? || '%'`, t);
  };
  const t = String(q.busca || '').trim();
  if (t) {
    const d = doc(t);
    if (d.length === 44) add('f.chave_cte = ?', d);
    else add(`(LTRIM(f.numero_cte, '0') = LTRIM(?, '0') OR LTRIM(f.numero_nf, '0') = LTRIM(?, '0') OR f.numero_pedido = ?)`, t);
  }
  quem("regexp_replace(COALESCE(f.transportadora_cnpj_cte, ''), '[^0-9A-Za-z]', '', 'g')", 'f.transportadora_cte', q.transportadora);
  quem("regexp_replace(COALESCE(f.tomador_cte_cnpj, ''), '[^0-9A-Za-z]', '', 'g')", 'f.tomador_cte_nome', q.tomador);
  quem('f.cte_remetente_doc', 'f.cte_remetente_nome', q.remetente);
  quem('f.cte_destinatario_doc', 'f.cte_destinatario_nome', q.destinatario);
  if (/^[A-Za-z]{2}$/.test(q.uf_inicio || '')) add('f.uf_inicio_cte = ?', q.uf_inicio.toUpperCase());
  if (/^[A-Za-z]{2}$/.test(q.uf_fim || '')) add('f.uf_fim_cte = ?', q.uf_fim.toUpperCase());
  if (String(q.cidade_inicio || '').trim()) add("f.cte_cidade_inicio ILIKE '%' || ? || '%'", String(q.cidade_inicio).trim());
  if (String(q.cidade_fim || '').trim()) add("f.cte_cidade_fim ILIKE '%' || ? || '%'", String(q.cidade_fim).trim());
  if (MODAIS[q.modal]) add('f.cte_modal = ?', q.modal);
  if (/^[0-4]$/.test(String(q.servico ?? ''))) add('f.tp_serv_cte = ?::smallint', Number(q.servico));
  if (/^\d{4}$/.test(q.cfop || '')) add('f.cte_cfop = ?', q.cfop);
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.de || '')) add('f.data_emissao_cte >= ?::date', q.de);
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.ate || '')) add('f.data_emissao_cte <= ?::date', q.ate);
  if (['normal', 'cancelado', 'complementar', 'anulacao', 'substituto'].includes(q.situacao)) add(`${SITUACAO} = ?`, q.situacao);
  return cond.join(' AND ');
}
const COLUNAS = `f.id, f.numero_cte, f.cte_serie, f.chave_cte, f.data_emissao_cte, f.transportadora_cte, f.transportadora_cnpj_cte,
  f.tomador_cte_nome, f.tomador_cte_cnpj, f.tomador_cte_papel, f.cte_remetente_nome, f.cte_remetente_doc, f.cte_destinatario_nome, f.cte_destinatario_doc,
  f.uf_inicio_cte, f.uf_fim_cte, f.cte_cidade_inicio, f.cte_cidade_fim, f.cte_modal, f.tp_serv_cte, f.tipo_cte, f.cte_cfop,
  COALESCE(f.valor_total_cte, f.valor_frete_negociado)::float AS valor_frete, f.cte_icms_cst, f.cte_icms_base::float, f.cte_icms_aliquota::float, f.cte_icms_valor::float,
  f.cte_protocolo, f.numero_nf, f.numero_pedido, f.status, f.cte_cancelado, f.cte_cancelado_motivo, (f.xml_cte_original IS NOT NULL) AS tem_xml, ${SITUACAO} AS situacao,
  (SELECT COUNT(*)::int FROM documento_eventos e WHERE e.chave = f.chave_cte) AS eventos`;
async function listar(req, q = {}) {
  await completarTodos();
  const params = [];
  const where = filtros(req, q, params);
  const { rows } = await pool.query(`SELECT ${COLUNAS} FROM fretes f WHERE ${where} ORDER BY f.data_emissao_cte DESC NULLS LAST, f.id DESC LIMIT 2000`, params);
  const { rows: [t] } = await pool.query(
    `SELECT COUNT(*)::int AS ctes,
            COALESCE(SUM(COALESCE(f.valor_total_cte, f.valor_frete_negociado)) FILTER (WHERE NOT f.cte_cancelado), 0)::float AS frete,
            COALESCE(SUM(f.cte_icms_base) FILTER (WHERE NOT f.cte_cancelado), 0)::float AS base_icms,
            COALESCE(SUM(f.cte_icms_valor) FILTER (WHERE NOT f.cte_cancelado), 0)::float AS icms,
            COUNT(*) FILTER (WHERE f.cte_cancelado)::int AS cancelados,
            COUNT(DISTINCT f.transportadora_cnpj_cte)::int AS transportadoras
       FROM fretes f WHERE ${where}`, params);
  return { totais: t, ctes: rows, limite: rows.length >= 2000, modais: MODAIS, servicos: SERVICOS, tipos: TIPOS };
}

async function linhaDoCte(req, id) {
  const params = [id];
  const escopo = vePotudo(req) ? '' : (params.push(textoLimpo(req.usuario?.cliente_nome) ?? ''), ' AND f.cliente = $2');
  const { rows: [f] } = await pool.query(`SELECT f.id, f.numero_cte, f.chave_cte, f.cte_cancelado, f.xml_cte_original FROM fretes f WHERE f.id = $1${escopo}`, params);
  if (!f) throw falha('CT-e não encontrado.', 404);
  if (!f.xml_cte_original) throw falha('Este CT-e não tem o XML guardado.', 404);
  return f;
}
async function xmlDoCte(req, id) {
  const f = await linhaDoCte(req, id);
  return { nome: `${f.chave_cte || `CTe-${f.numero_cte}`}-cte.xml`, xml: f.xml_cte_original };
}
// Vários XML num .zip (os filtrados na tela, até 5000), com os XML dos eventos de cada um.
async function zipDosCtes(req, q = {}) {
  const params = [];
  const where = filtros(req, q, params);
  const { rows } = await pool.query(`SELECT f.numero_cte, f.chave_cte, f.xml_cte_original FROM fretes f WHERE ${where} AND f.xml_cte_original IS NOT NULL ORDER BY f.data_emissao_cte LIMIT 5000`, params);
  if (!rows.length) throw falha('Nenhum CT-e com XML nos filtros escolhidos.', 404);
  const { rows: eventos } = await pool.query('SELECT chave, tp_evento, id, xml FROM documento_eventos WHERE chave = ANY($1::text[]) ORDER BY id', [rows.map((r) => r.chave_cte)]);
  const { EscritorZip } = require('./utils/zip');
  const arquivo = path.join(os.tmpdir(), `ctes-${crypto.randomBytes(6).toString('hex')}.zip`);
  const zip = new EscritorZip(arquivo);
  const usados = new Set();
  const por = (nome, xml) => { let n = nome; while (usados.has(n)) n = n.replace('.xml', '-2.xml'); usados.add(n); zip.adicionar(n, Buffer.from(xml, 'utf8')); };
  rows.forEach((r) => por(`${r.chave_cte || `CTe-${r.numero_cte}`}-cte.xml`, r.xml_cte_original));
  eventos.forEach((e) => por(`eventos/${e.chave}-evento-${e.tp_evento || 'x'}-${e.id}.xml`, e.xml));
  zip.fechar();
  return { arquivo, quantidade: rows.length, eventos: eventos.length };
}

// ---------- DACTE do CT-e recebido (o mesmo desenho do DACTE emitido pelo sistema) ----------
function participante(no, ender) {
  if (!no) return null;
  const e = no[ender] || {};
  return { xNome: no.xNome, cnpj: no.CNPJ, cpf: no.CPF, ie: no.IE, fone: no.fone || e.fone,
    endereco: { xLgr: e.xLgr, nro: e.nro, xCpl: e.xCpl, xBairro: e.xBairro, xMun: e.xMun, UF: e.UF, CEP: e.CEP } };
}
function dadosDacte(xml, { cancelado = false } = {}) {
  const { inf, prot } = lerXml(xml);
  const ide = inf.ide || {}; const norm = inf.infCTeNorm || {}; const carga = norm.infCarga || {};
  const icmsGrupo = inf.imp?.ICMS || {}; const k = Object.keys(icmsGrupo)[0]; const i = k ? icmsGrupo[k] : {};
  const toma4 = ide.toma4 || ide.toma04; const toma3 = ide.toma3 || ide.toma03;
  const emit = participante(inf.emit, 'enderEmit');
  const d = {
    emitente: { ...emit, rntrc: norm.infModal?.rodo?.RNTRC || '' },
    remetente: participante(inf.rem, 'enderReme'), destinatario: participante(inf.dest, 'enderDest'),
    expedidor: participante(inf.exped, 'enderExped'), recebedor: participante(inf.receb, 'enderReceb'),
    outroTomador: toma4 ? participante(toma4, 'enderToma') : null,
    tomador: toma4 ? 4 : Number(toma3?.toma ?? 0),
    tpCTe: ide.tpCTe ?? 0, tpServ: ide.tpServ ?? 0, cfop: ide.CFOP, natOp: ide.natOp,
    modalNome: (MODAIS[String(ide.modal || '01').padStart(2, '0')] || 'Rodoviário').toUpperCase(),
    inicio: { xMun: ide.xMunIni, UF: ide.UFIni }, fim: { xMun: ide.xMunFim, UF: ide.UFFim },
    carga: { proPred: carga.proPred, xOutCat: carga.xOutCat, vCarga: num(carga.vCarga), quantidades: lista(carga.infQ) },
    valores: { componentes: lista(inf.vPrest?.Comp), vTPrest: num(inf.vPrest?.vTPrest), vRec: num(inf.vPrest?.vRec) },
    icms: { cst: k === 'ICMSSN' ? 'SN' : k === 'ICMSOutraUF' ? 'OUTRAUF' : i.CST, vBC: i.vBC ?? i.vBCOutraUF ?? i.vBCSTRet, pICMS: i.pICMS ?? i.pICMSOutraUF ?? i.pICMSSTRet,
      vICMS: i.vICMS ?? i.vICMSOutraUF ?? i.vICMSSTRet, pRedBC: i.pRedBC ?? i.pRedBCOutraUF },
    nfes: lista(norm.infDoc?.infNFe).map((n) => n.chave).filter(Boolean),
    complementados: lista(inf.infCteComp).map((c) => c.chCTe || c.chave).filter(Boolean),
    substituido: { chave: norm.infCteSub?.chCte || norm.infCteSub?.chCTe || null },
    docAnt: lista(norm.docAnt?.emiDocAnt).map((e) => ({ xNome: e.xNome, cnpj: e.CNPJ, cpf: e.CPF,
      chaves: lista(e.idDocAnt).flatMap((x) => lista(x.idDocAntEle)).map((x) => x.chCTe).filter(Boolean) })),
    observacoes: inf.compl?.xObs || '',
  };
  const chave = String(inf['@_Id'] || '').replace(/^CTe/, '');
  const reg = { chave, numero: ide.nCT, serie: ide.serie, ambiente: Number(ide.tpAmb || 1), status: cancelado ? 'cancelado' : 'autorizado',
    protocolo: prot?.nProt || null, autorizado_em: prot?.dhRecbto || null, xml_autorizado: xml, criado_em: ide.dhEmi };
  return { d, reg };
}
async function dacte(req, id) {
  const f = await linhaDoCte(req, id);
  const { d, reg } = dadosDacte(f.xml_cte_original, { cancelado: !!f.cte_cancelado });
  return require('./cte/dacte').gerarDacte(d, reg);
}

// ---------- Eventos ----------
// Guarda o XML do evento (uma vez só por conteúdo). dados: o que o parseEvento leu.
async function guardarEvento(xml, dados, usuarioNome) {
  if (!dados?.chave || !dados.tipoDocumento) return null;
  const hash = crypto.createHash('sha256').update(xml).digest('hex');
  const NOMES = { 110110: 'Carta de Correção', 110111: 'Cancelamento', 110112: 'Cancelamento por substituição', 110130: 'Comprovante de Entrega',
    110180: 'Comprovante de Entrega', 610110: 'Prestação de serviço em desacordo', 210200: 'Confirmação da operação', 210210: 'Ciência da operação' };
  const { rows: [r] } = await pool.query(
    `INSERT INTO documento_eventos (chave, tipo_documento, tp_evento, descricao, detalhe, protocolo, dh_evento, xml, hash, usuario_nome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (chave, hash) DO NOTHING RETURNING id`,
    [String(dados.chave).slice(0, 44), dados.tipoDocumento, corta(dados.tpEvento, 6), corta(dados.descEvento || NOMES[Number(dados.tpEvento)] || 'Evento', 120),
      dados.textoDetalhe || null, corta(dados.numeroProtocolo, 30), /^\d{4}-\d{2}-\d{2}$/.test(dados.dhEvento || '') ? dados.dhEvento : null, xml, hash, corta(usuarioNome, 150)]);
  return r?.id || null;
}
async function eventosDoFrete(req, id) {
  const params = [id];
  const escopo = vePotudo(req) ? '' : (params.push(textoLimpo(req.usuario?.cliente_nome) ?? ''), ' AND f.cliente = $2');
  const { rows: [f] } = await pool.query(`SELECT f.chave_cte, f.chave_nfe FROM fretes f WHERE f.id = $1${escopo}`, params);
  if (!f) throw falha('Registro não encontrado.', 404);
  const chaves = [f.chave_cte, f.chave_nfe].filter(Boolean);
  const { rows } = await pool.query(
    `SELECT id, chave, tipo_documento, tp_evento, descricao, detalhe, protocolo, dh_evento, usuario_nome, criado_em FROM documento_eventos
      WHERE chave = ANY($1::text[]) ORDER BY COALESCE(dh_evento, criado_em::date), id`, [chaves]);
  return rows;
}
async function xmlDoEvento(req, freteId, eventoId) {
  const evs = await eventosDoFrete(req, freteId);
  if (!evs.some((e) => e.id === eventoId)) throw falha('Evento não encontrado.', 404);
  const { rows: [e] } = await pool.query('SELECT chave, tp_evento, xml FROM documento_eventos WHERE id = $1', [eventoId]);
  return { nome: `${e.chave}-evento-${e.tp_evento || 'x'}-${eventoId}.xml`, xml: e.xml };
}

module.exports = { dadosDoCte, completar, completarTodos, listar, xmlDoCte, zipDosCtes, dadosDacte, dacte, guardarEvento, eventosDoFrete, xmlDoEvento, MODAIS, SERVICOS };
