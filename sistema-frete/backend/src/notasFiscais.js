// Gestão de NF-e (embarcador): os dados completos da nota (série, emitente, valor dos
// produtos, peso bruto e líquido, saída, endereço de entrega), a consulta com filtros,
// o XML (um ou vários em .zip), o DANFE e a denegação.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');
const pool = require('./db');
const { consultaCliente: consultaComEscopo } = require('./permissoes');
// As NOTAS aparecem mesmo com o CT-e cancelado (o cancelamento é do CT-e; a NF-e continua valendo).
const consultaCliente = (req, sql, params = []) => consultaComEscopo(req, sql, params, { comCteCancelado: true });

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

// Operação da nota pelo CFOP dos itens (e pela natureza da operação):
//  venda       — CFOP de venda: x101 a x125 (produção/revenda, a não contribuinte, entrega futura, ordem...),
//                x401 a x405 (com substituição tributária), x651 a x656 e x667 (combustíveis), 7xxx de exportação;
//  bonificacao — x910 (remessa em bonificação, doação ou brinde) ou, sem CFOP de venda, a natureza "bonificação" (ex.: 5949);
//  outra       — remessa, transferência, devolução, conserto, demonstração, nota de entrada etc.
// Nota com itens de venda e de bonificação conta como venda.
const FINAIS_VENDA = new Set(['101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112', '113', '114', '115', '116', '117', '118',
  '119', '120', '122', '123', '124', '125', '127', '401', '402', '403', '405', '651', '652', '653', '654', '655', '656', '667']);
function classificarOperacao({ cfops = [], natureza = '', tpNF = '1', finNFe = '1' } = {}) {
  if (String(tpNF) === '0' || String(finNFe) === '4') return 'outra';   // entrada ou devolução
  const saida = cfops.filter((c) => /^[567]\d{3}$/.test(c));
  if (saida.some((c) => FINAIS_VENDA.has(c.slice(1)))) return 'venda';
  if (saida.some((c) => c.slice(1) === '910')) return 'bonificacao';
  const nat = String(natureza || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/BONIFIC/.test(nat)) return 'bonificacao';   // há quem emita a bonificação com 5949/6949 (outra saída)
  if (!saida.length && /^VENDA|\bVENDA DE (MERCADORIA|PRODU)/.test(nat)) return 'venda';
  return 'outra';
}
function operacaoDoXml(inf) {
  const ide = inf.ide || {};
  const cfops = [...new Set(lista(inf.det).map((d) => String(d?.prod?.CFOP ?? '').replace(/\D/g, '')).filter((c) => c.length === 4))];
  const natureza = ide.natOp ? String(ide.natOp).slice(0, 120) : null;
  return { nf_natureza: natureza, nf_cfops: cfops, nf_operacao: classificarOperacao({ cfops, natureza, tpNF: ide.tpNF ?? '1', finNFe: ide.finNFe ?? '1' }) };
}

// Os campos novos da nota, a partir do XML.
function dadosDaNota(xml) {
  const { inf, prot } = lerXml(xml);
  const ide = inf.ide || {}; const emit = inf.emit || {}; const dest = inf.dest || {};
  const tot = inf.total?.ICMSTot || {}; const vols = lista(inf.transp?.vol);
  const soma = (c) => { const v = vols.map((x) => num(x[c])).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
  // Endereços: local de entrega (<entrega>, dados adicionais ou destinatário) e redespacho (dados adicionais).
  const ends = require('./enderecoEntrega').daNfe(inf);
  const e0 = ends.entrega || {};
  const end = { logradouro: e0.logradouro, numero: e0.numero, complemento: e0.complemento, bairro: e0.bairro, cidade: e0.cidade, uf: e0.uf, cep: e0.cep, nome: e0.nome,
    cnpj: e0.cnpj, ibge: e0.ibge, local_diferente: e0.origem !== 'destinatario', origem: e0.origem || null, texto: e0.texto || null };
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
    redespacho_endereco: ends.redespacho ? JSON.stringify(ends.redespacho) : null,
    endereco_origem: ends.origem, endereco_conferir: ends.conferir, endereco_conferir_motivo: ends.motivo ? ends.motivo.slice(0, 300) : null,
    denegada: prot ? CSTAT_DENEGADA.includes(String(prot.cStat)) : false,
    protocolo: prot ? { cStat: String(prot.cStat || ''), xMotivo: prot.xMotivo || '', nProt: prot.nProt || '' } : null,
    ...operacaoDoXml(inf),
  };
}

// Denegada: fica marcada (e conta como cancelada para o frete: sai de "aguardando CT-e" e o CT-e que vier fica retido).
async function marcarDenegada(id, motivo) {
  await pool.query(`UPDATE fretes SET nf_denegada = TRUE, nf_cancelada = TRUE,
      observacoes = CASE WHEN POSITION('USO DENEGADO' IN UPPER(COALESCE(observacoes, ''))) > 0 THEN observacoes ELSE CONCAT_WS(E'\\n', NULLIF(observacoes, ''), $2::text) END, atualizado_em = NOW()
    WHERE id = $1 OR frete_principal_id = $1`, [id, `⚠ NF-e com USO DENEGADO pela SEFAZ${motivo ? ` (${motivo})` : ''}: não tem valor fiscal, não deve circular nem gerar frete.`]);
}

// Grava os endereços lidos (menos na nota com endereço corrigido à mão).
const gravarEnderecos = (id, d) => pool.query(`UPDATE fretes SET entrega_endereco = $2, redespacho_endereco = $3, endereco_origem = $4, endereco_conferir = $5,
    endereco_conferir_motivo = $6, endereco_lido_em = NOW(), endereco_versao = $7 WHERE id = $1 AND NOT endereco_corrigido`,
  [id, d.entrega_endereco, d.redespacho_endereco, d.endereco_origem, d.endereco_conferir, d.endereco_conferir_motivo, require('./enderecoEntrega').VERSAO_LEITURA]);
async function completar(id) {
  const { rows: [f] } = await pool.query('SELECT id, xml_nfe_original FROM fretes WHERE id = $1', [id]);
  if (!f?.xml_nfe_original) return false;
  let d;
  try { d = dadosDaNota(f.xml_nfe_original); } catch { await pool.query('UPDATE fretes SET nf_dados_em = NOW(), endereco_lido_em = NOW() WHERE id = $1', [id]); return false; }
  await pool.query(`UPDATE fretes SET nf_serie = $2, emitente_nome = $3, emitente_cnpj = $4, valor_produtos = $5, peso_bruto = $6, peso_liquido = $7,
      data_saida = $8, nf_natureza = $9, nf_cfops = $10, nf_operacao = $11, nf_dados_em = NOW() WHERE id = $1`,
  [id, d.nf_serie, d.emitente_nome, d.emitente_cnpj, d.valor_produtos, d.peso_bruto, d.peso_liquido, d.data_saida, d.nf_natureza, d.nf_cfops, d.nf_operacao]);
  await gravarEnderecos(id, d);
  await completarRedespachoPeloCadastro({ id }).catch(() => {});
  await completarCidadePeloCep({ id }).catch(() => {});
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
  // Notas já completas antes de existir a operação (venda, bonificação, outra): lê a natureza e os CFOP do XML.
  let o = 0;
  try {
    for (;;) {
      const { rows } = await pool.query('SELECT id, xml_nfe_original FROM fretes WHERE xml_nfe_original IS NOT NULL AND nf_operacao IS NULL LIMIT 300');
      if (!rows.length) break;
      for (const r of rows) {
        let x = { nf_natureza: null, nf_cfops: [], nf_operacao: 'outra' };
        try { x = operacaoDoXml(lerXml(r.xml_nfe_original).inf); } catch { /* XML ilegível: fica como outra */ }
        await pool.query('UPDATE fretes SET nf_natureza = $2, nf_cfops = $3, nf_operacao = $4 WHERE id = $1', [r.id, x.nf_natureza, x.nf_cfops, x.nf_operacao]);
        o += 1;
      }
    }
  } catch (err) { console.error('[notas] operação:', err.message); }
  if (o) console.log(`[notas] ${o} nota(s) com a operação (venda, bonificação ou outra) lida do CFOP do XML.`);
  const soltas = await soltarNotasDentroDeOutroRegistro().catch((err) => { console.error('[notas] notas dentro de outro registro:', err.message); return []; });
  if (soltas.length) console.log(`[notas] ${soltas.length} NF-e que estavam guardadas como CT-e a mais de outro registro voltaram para a lista.`);
  // Notas já completas mas com o endereço lido na versão antiga: lê o redespacho e o local de entrega de novo.
  let e = 0;
  try {
    for (;;) {
      // Nunca lidas, ou marcadas "conferir" por uma versão anterior das regras de leitura.
      const { rows } = await pool.query(`SELECT id, xml_nfe_original FROM fretes WHERE xml_nfe_original IS NOT NULL AND NOT endereco_corrigido
          AND (endereco_lido_em IS NULL OR (endereco_conferir AND COALESCE(endereco_versao, 0) < $1)) LIMIT 300`, [require('./enderecoEntrega').VERSAO_LEITURA]);
      if (!rows.length) break;
      for (const r of rows) {
        try { await gravarEnderecos(r.id, dadosDaNota(r.xml_nfe_original)); } catch { await pool.query('UPDATE fretes SET endereco_lido_em = NOW(), endereco_versao = $2 WHERE id = $1', [r.id, require('./enderecoEntrega').VERSAO_LEITURA]); }
        e += 1;
      }
    }
  } catch (err) { console.error('[notas] endereços:', err.message); }
  if (e) console.log(`[notas] ${e} nota(s) com o endereço de entrega e o redespacho lidos de novo.`);
  const c = await completarRedespachoPeloCadastro().catch((err) => { console.error('[notas] redespacho pelo cadastro:', err.message); return 0; });
  if (c) console.log(`[notas] ${c} nota(s) com o endereço do redespacho completado pelo cadastro do CNPJ.`);
  const cc = await completarCidadePeloCep().catch((err) => { console.error('[notas] cidade pelo CEP:', err.message); return 0; });
  if (cc) console.log(`[notas] ${cc} nota(s) com a cidade do endereço achada pelo CEP.`);
  return n;
}

// Endereço sem a cidade, mas com CEP (fora das capitais, que o leitor já resolve): consulta o CEP (src/cepCidade.js).
async function completarCidadePeloCep(f = {}) {
  const { conferir, acharCidade } = require('./enderecoEntrega');
  const cep = require('./cepCidade');
  const params = []; let extra = '';
  if (f.id) { params.push(f.id); extra = ` AND f.id = $${params.length}`; }
  const { rows } = await pool.query(`SELECT f.id, f.entrega_endereco, f.redespacho_endereco, f.endereco_origem FROM fretes f
     WHERE NOT f.endereco_corrigido AND (
       (f.entrega_endereco IS NOT NULL AND NULLIF(f.entrega_endereco->>'cidade', '') IS NULL AND LENGTH(COALESCE(f.entrega_endereco->>'cep', '')) = 8 AND f.entrega_endereco->>'cep_consultado' IS NULL)
       OR (f.redespacho_endereco IS NOT NULL AND NULLIF(f.redespacho_endereco->>'cidade', '') IS NULL AND LENGTH(COALESCE(f.redespacho_endereco->>'cep', '')) = 8 AND f.redespacho_endereco->>'cep_consultado' IS NULL))${extra}
     LIMIT 300`, params);
  let n = 0;
  for (const r of rows) {
    const sets = []; const vals = [r.id];
    for (const campo of ['entrega_endereco', 'redespacho_endereco']) {
      const e = r[campo] ? (typeof r[campo] === 'string' ? JSON.parse(r[campo]) : { ...r[campo] }) : null;
      if (!e || e.cidade || !/^\d{8}$/.test(String(e.cep || ''))) continue;
      const v = await cep.buscar(e.cep);
      e.cep_consultado = true;
      if (v) {
        const c = acharCidade(v.cidade, v.uf) || { cidade: v.cidade, uf: v.uf, ibge: null };
        Object.assign(e, { cidade: c.cidade, uf: c.uf, ibge: c.ibge, cidade_pelo_cep: true, bairro: e.bairro || v.bairro || null, logradouro: e.logradouro || v.rua || null });
        const k = conferir(e); e.conferir = k.conferir; e.motivos = k.motivos;
        const origemDeste = campo === 'redespacho_endereco' ? 'redespacho' : null;
        if (r.endereco_origem === origemDeste || (campo === 'entrega_endereco' && r.endereco_origem !== 'redespacho')) {
          vals.push(k.conferir); sets.push(`endereco_conferir = $${vals.length}`);
          vals.push(k.motivos.join('; ') || null); sets.push(`endereco_conferir_motivo = $${vals.length}`);
        }
        n += 1;
      }
      vals.push(JSON.stringify(e)); sets.push(`${campo} = $${vals.length}`);
    }
    if (sets.length) await pool.query(`UPDATE fretes SET ${sets.join(', ')} WHERE id = $1 AND NOT endereco_corrigido`, vals);
  }
  return n;
}

// Redespacho que veio só com o nome e o CNPJ (sem rua/cidade no texto da nota): completa o endereço com o cadastro da
// transportadora, que o sistema busca sozinho pelo CNPJ (src/transportadorasRedespacho.js). Só preenche o que falta;
// nota com endereço corrigido à mão não muda. f: { id } (uma nota) ou { cnpj } (as notas desse CNPJ) ou nada (todas).
async function completarRedespachoPeloCadastro(f = {}) {
  const { conferir, acharCidade } = require('./enderecoEntrega');
  const params = []; let extra = '';
  if (f.id) { params.push(f.id); extra = ` AND f.id = $${params.length}`; }
  if (f.cnpj) { params.push(String(f.cnpj).replace(/\D/g, '')); extra += ` AND f.redespacho_endereco->>'cnpj' = $${params.length}`; }
  const { rows } = await pool.query(`SELECT f.id, f.redespacho_endereco, f.endereco_origem, t.endereco, t.bairro, t.municipio, t.uf, t.cep
      FROM fretes f JOIN transportadoras t ON REGEXP_REPLACE(COALESCE(t.cnpj, ''), '[^0-9]', '', 'g') = f.redespacho_endereco->>'cnpj'
     WHERE f.redespacho_endereco IS NOT NULL AND NOT f.endereco_corrigido AND NULLIF(t.municipio, '') IS NOT NULL
       AND (NULLIF(f.redespacho_endereco->>'cidade', '') IS NULL OR NULLIF(f.redespacho_endereco->>'logradouro', '') IS NULL
            OR NULLIF(f.redespacho_endereco->>'cep', '') IS NULL)
       AND COALESCE(f.redespacho_endereco->>'do_cadastro', '') <> 'true'${extra}
     LIMIT 5000`, params);
  let n = 0;
  for (const r of rows) {
    const e = typeof r.redespacho_endereco === 'string' ? JSON.parse(r.redespacho_endereco) : { ...r.redespacho_endereco };
    // "RUA X, 123 - SALA 2" (como o cadastro guarda) → rua, número e complemento.
    const m = String(r.endereco || '').match(/^(.*?)(?:,\s*([^-]+?))?(?:\s+-\s+(.*))?$/) || [];
    const cid = acharCidade(String(r.municipio), r.uf) || { cidade: r.municipio, uf: r.uf, ibge: null };
    // Nota que já tem a rua e a cidade e só falta o CEP: usa o do cadastro só se a cidade for a mesma.
    const semAcento = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    if (e.cidade && e.logradouro && semAcento(e.cidade) !== semAcento(cid.cidade)) continue;
    const novo = {
      ...e,
      logradouro: e.logradouro || (m[1] || '').trim() || null,
      numero: e.numero || (e.logradouro ? null : (m[2] || '').trim() || null),
      complemento: e.complemento || (e.logradouro ? null : (m[3] || '').trim() || null),
      bairro: e.bairro || r.bairro || null,
      cidade: e.cidade || cid.cidade, uf: e.uf || cid.uf, ibge: e.ibge || cid.ibge,
      cep: e.cep || String(r.cep || '').replace(/\D/g, '') || null,
      do_cadastro: true,
    };
    const c = conferir(novo);
    novo.conferir = c.conferir; novo.motivos = c.motivos;
    await pool.query(`UPDATE fretes SET redespacho_endereco = $2,
        endereco_conferir = CASE WHEN endereco_origem = 'redespacho' THEN $3 ELSE endereco_conferir END,
        endereco_conferir_motivo = CASE WHEN endereco_origem = 'redespacho' THEN $4 ELSE endereco_conferir_motivo END
      WHERE id = $1 AND NOT endereco_corrigido`, [r.id, JSON.stringify(novo), c.conferir, c.motivos.join('; ') || null]);
    n += 1;
  }
  return n;
}

// Correção à mão do endereço (local de entrega ou redespacho): cidade conferida no IBGE; a releitura não mexe mais.
// No redespacho, a cidade também vai para a "Cidade do Redespacho" (a que o cálculo do frete usa).
async function corrigirEndereco(req, id, b = {}) {
  const qual = b.qual === 'redespacho' ? 'redespacho' : 'entrega';
  const { rows: [f] } = await consultaCliente(req, 'SELECT f.id, f.numero_nf, f.entrega_endereco, f.redespacho_endereco, f.cidade_redespacho FROM fretes f WHERE f.id = $1', [id]);
  if (!f) throw falha('Nota não encontrada.', 404);
  const t = (v, max) => { const x = String(v ?? '').trim(); return x ? x.slice(0, max) : null; };
  const uf = t(b.uf, 2)?.toUpperCase() || null;
  const { municipio } = require('./roteirizacao/municipios');
  const m = b.cidade && uf ? municipio({ cidade: b.cidade, uf }) : null;
  if (!m) throw falha('Cidade não encontrada na lista do IBGE: confira o nome e a UF.');
  const cep = String(b.cep || '').replace(/\D/g, '');
  if (cep && cep.length !== 8) throw falha('CEP com 8 números.');
  const e = { nome: t(b.nome, 120), logradouro: t(b.logradouro, 120), numero: t(b.numero, 20), complemento: t(b.complemento, 60), bairro: t(b.bairro, 80),
    cidade: m.nome, uf: m.uf, ibge: m.ibge, cep: cep || null, cnpj: String(b.cnpj || '').replace(/\D/g, '') || null, origem: 'manual', conferir: false, motivos: [] };
  if (qual === 'redespacho') {
    await pool.query(`UPDATE fretes SET redespacho_endereco = $2, endereco_origem = 'manual', endereco_conferir = FALSE, endereco_conferir_motivo = NULL, endereco_corrigido = TRUE,
        cidade_redespacho = $3, atualizado_em = NOW() WHERE id = $1`, [id, JSON.stringify(e), m.nome.toUpperCase()]);
  } else {
    const ant = typeof f.entrega_endereco === 'string' ? JSON.parse(f.entrega_endereco || '{}') : (f.entrega_endereco || {});
    await pool.query(`UPDATE fretes SET entrega_endereco = $2, endereco_origem = CASE WHEN redespacho_endereco IS NULL THEN 'manual' ELSE endereco_origem END,
        endereco_conferir = CASE WHEN redespacho_endereco IS NULL THEN FALSE ELSE endereco_conferir END,
        endereco_conferir_motivo = CASE WHEN redespacho_endereco IS NULL THEN NULL ELSE endereco_conferir_motivo END, endereco_corrigido = TRUE, atualizado_em = NOW() WHERE id = $1`,
    [id, JSON.stringify({ ...e, local_diferente: true, texto: ant.texto || null })]);
  }
  return { qual, endereco: e, mudouCidadeRedespacho: qual === 'redespacho' && String(f.cidade_redespacho || '').toUpperCase() !== m.nome.toUpperCase() };
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
    else add(`(LTRIM(f.numero_nf, '0') = LTRIM(?, '0') OR f.cliente ILIKE '%' || ? || '%' OR f.emitente_nome ILIKE '%' || ? || '%' OR f.numero_pedido = ?
      OR LTRIM(COALESCE(f.numero_cte, ''), '0') = LTRIM(?, '0') OR COALESCE(f.transportadora_cte, f.transportadora) ILIKE '%' || ? || '%' OR f.redespacho ILIKE '%' || ? || '%')`, t);
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
  // Entrega: entregue, não entregue (ainda sem data), atrasada (passou da previsão sem entrega).
  const aberta = "f.data_entrega IS NULL AND f.nf_cancelada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE AND COALESCE(f.status, '') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado')";
  if (q.entrega === 'entregue') cond.push('f.data_entrega IS NOT NULL');
  if (q.entrega === 'pendente') cond.push(aberta);
  if (q.entrega === 'atrasada') cond.push(`${aberta} AND f.data_entrega_prevista < CURRENT_DATE`);
  if (String(q.transportadora || '').trim()) add("COALESCE(f.transportadora_cte, f.transportadora) ILIKE '%' || ? || '%'", String(q.transportadora).trim());
  if (q.operacao === 'faturamento') cond.push("f.nf_operacao IN ('venda', 'bonificacao')");
  if (['venda', 'bonificacao', 'outra'].includes(q.operacao)) add('f.nf_operacao = ?', q.operacao);
  if (q.operacao === 'sem_xml') cond.push('f.xml_nfe_original IS NULL AND f.nf_operacao IS NULL');
  if (q.endereco === 'conferir') cond.push('f.endereco_conferir');
  if (q.endereco === 'redespacho') cond.push('f.redespacho_endereco IS NOT NULL');
  if (q.endereco === 'local') cond.push("f.endereco_origem IN ('xml_entrega', 'dados_adicionais')");
  if (q.endereco === 'manual') cond.push('f.endereco_corrigido');
  return cond.join(' AND ');
}
const COLUNAS = `f.id, f.numero_nf, f.nf_serie, f.chave_nfe, f.data_emissao_nf, f.data_saida, f.emitente_nome, f.emitente_cnpj, f.cliente, f.cliente_documento,
  f.cidade, f.uf, f.entrega_endereco, f.redespacho_endereco, f.endereco_origem, f.endereco_conferir, f.endereco_conferir_motivo, f.endereco_corrigido, f.redespacho, f.cidade_redespacho,
  f.valor_produtos::float, f.valor_faturado::float, f.peso_bruto::float, f.peso_liquido::float, f.peso_kg::float, f.qtd_volumes,
  f.numero_pedido, f.numero_cte, f.transportadora_nfe, f.status, f.data_entrega, (f.xml_nfe_original IS NOT NULL) AS tem_xml, ${SITUACAO} AS situacao,
  COALESCE(f.transportadora_cte, f.transportadora) AS transportadora, f.chave_cte, f.data_emissao_cte, f.valor_total_cte::float, f.data_entrega_prevista,
  f.data_entrega_origem, f.canhoto_recebido_por, f.rastreio_ultima_ocorrencia, f.rastreio_ultima_em, f.rastreio_problema, f.nf_devolvida,
  f.status_aprovacao, f.nf_natureza, f.nf_cfops, f.nf_operacao, (SELECT COUNT(*)::int FROM ocorrencias_rastreio o WHERE o.frete_id = f.id) AS qtd_ocorrencias`;
async function listar(req, q = {}) {
  const params = [];
  const where = filtros(q, params);
  // Ordem: as mais recentes (padrão antigo) ou a sequência das notas (emitente, série e número).
  const NUM = "NULLIF(regexp_replace(COALESCE(f.numero_nf, ''), '\\D', '', 'g'), '')::numeric";
  const ORDENS = {
    recentes: 'f.data_emissao_nf DESC NULLS LAST, f.id DESC',
    numero: `f.emitente_cnpj NULLS LAST, COALESCE(f.nf_serie, '') , ${NUM} ASC NULLS LAST, f.id`,
    numero_desc: `f.emitente_cnpj NULLS LAST, COALESCE(f.nf_serie, ''), ${NUM} DESC NULLS LAST, f.id DESC`,
  };
  const ordem = ORDENS[q.ordem] ? q.ordem : 'recentes';
  // Consulta rápida (campo da Visão geral): só as primeiras notas, sem os totais.
  const rapida = q.rapida === '1' || q.rapida === true;
  const lim = rapida ? Math.min(Math.max(parseInt(q.limite, 10) || 8, 1), 30) : 2000;
  const { rows } = await consultaCliente(req, `SELECT ${COLUNAS} FROM fretes f WHERE ${where} ORDER BY ${ORDENS[ordem]} LIMIT ${lim}`, params);
  if (rapida) return { notas: rows, mais: rows.length >= lim };
  const { rows: [t] } = await consultaCliente(req,
    `SELECT COUNT(*)::int AS notas, COALESCE(SUM(f.valor_faturado), 0)::float AS valor, COALESCE(SUM(f.valor_produtos), 0)::float AS produtos,
            COALESCE(SUM(COALESCE(f.peso_bruto, f.peso_kg)), 0)::float AS peso, COALESCE(SUM(f.qtd_volumes), 0)::int AS volumes,
            COUNT(*) FILTER (WHERE f.nf_cancelada AND NOT f.nf_denegada)::int AS canceladas, COUNT(*) FILTER (WHERE f.nf_denegada)::int AS denegadas,
            COUNT(*) FILTER (WHERE f.endereco_conferir)::int AS conferir_endereco,
            COUNT(*) FILTER (WHERE f.data_entrega IS NOT NULL)::int AS entregues,
            COUNT(*) FILTER (WHERE f.data_entrega IS NULL AND f.nf_cancelada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE AND COALESCE(f.status, '') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado'))::int AS nao_entregues,
            COUNT(*) FILTER (WHERE f.data_entrega IS NULL AND f.nf_cancelada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE AND COALESCE(f.status, '') NOT IN ('Cancelado', 'Não cobrado', 'Arquivado') AND f.data_entrega_prevista < CURRENT_DATE)::int AS atrasadas
       FROM fretes f WHERE ${where}`, params);
  let semFrete = [];
  if (ordem !== 'recentes' && rows.length) {
    const cnpjs = [...new Set(rows.map((r) => dig(r.emitente_cnpj)).filter(Boolean))];
    if (cnpjs.length) semFrete = (await pool.query('SELECT emitente_cnpj, nf_serie, numero_nf, motivo, natureza FROM notas_sem_frete WHERE emitente_cnpj = ANY($1)', [cnpjs]).catch(() => ({ rows: [] }))).rows;
  }
  return { totais: t, notas: rows, limite: rows.length >= 2000, ordem, faltando: ordem === 'recentes' ? null : faltandoNaSequencia(rows, semFrete) };
}

// ---------- Conferir o faturamento do dia com a lista do ERP ----------
// b: { data, numeros: ['195799', ...] } (os números colados do ERP). Devolve as notas do sistema naquele dia (todas,
// também as que não entram na soma, com o motivo), as dos números colados que estão no sistema com OUTRA data de
// emissão e as notas sem frete (puladas de propósito) desses números ou desse dia. A comparação é feita na tela.
async function conferirDia(req, b = {}) {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(b.data || '')) ? String(b.data) : hojeSaoPaulo();
  const numeros = [...new Set((Array.isArray(b.numeros) ? b.numeros : []).map((n) => String(n).replace(/\D/g, '').replace(/^0+/, '')).filter(Boolean))].slice(0, 3000);
  const COL = `f.id, f.numero_nf, f.cliente, COALESCE(f.valor_faturado, f.valor_produtos)::float AS valor, f.nf_operacao, f.nf_natureza,
    f.nf_cancelada, f.nf_denegada, f.frete_principal_id, (f.xml_nfe_original IS NULL) AS sem_xml, to_char(f.data_emissao_nf, 'YYYY-MM-DD') AS data`;
  const LINHA_DA_NOTA = "f.numero_nf IS NOT NULL AND f.numero_nf <> '' AND (f.frete_principal_id IS NULL OR f.chave_nfe IS NOT NULL)";
  const [{ rows: doDia }, { rows: outrasDatas }, { rows: semFrete }] = await Promise.all([
    consultaCliente(req, `SELECT ${COL} FROM fretes f WHERE ${LINHA_DA_NOTA} AND f.data_emissao_nf = $1::date ORDER BY f.numero_nf`, [data]),
    numeros.length ? consultaCliente(req, `SELECT ${COL} FROM fretes f WHERE ${LINHA_DA_NOTA} AND LTRIM(f.numero_nf, '0') = ANY($1)
        AND f.data_emissao_nf IS DISTINCT FROM $2::date`, [numeros, data]) : { rows: [] },
    pool.query(`SELECT numero_nf, motivo, natureza, to_char(data_emissao_nf, 'YYYY-MM-DD') AS data FROM notas_sem_frete
       WHERE LTRIM(COALESCE(numero_nf, ''), '0') = ANY($1) OR data_emissao_nf = $2::date`, [numeros, data]).catch(() => ({ rows: [] })),
  ]);
  return { data, sistema: doDia, outras_datas: outrasDatas, sem_frete: semFrete };
}

// ---------- NF-e guardada dentro de outro registro ----------
// Até a 1.73.0, a NF-e que chegava podia ser gravada na linha de um "CT-e a mais" (que fica dentro de outro registro)
// com o mesmo número de NF e sem chave, e sumia da lista. A linha de CT-e a mais copia a NF do registro principal; então:
//  - NF-e com OUTRO número que a do principal (ou principal que já tem a sua NF-e): volta a ser um registro próprio,
//    com o CT-e que estava nela (o CT-e é dela), e o alerta do principal é recalculado;
//  - mesma NF e o principal sem a NF-e: a NF-e (chave e XML) passa para o registro principal.
// f: { id } (uma linha) ou nada (todas). Devolve [{ id, principal, acao }].
async function soltarNotasDentroDeOutroRegistro(f = {}) {
  const params = []; let extra = '';
  if (f.id) { params.push(f.id); extra = ` AND c.id = $${params.length}`; }
  const { rows } = await pool.query(`SELECT c.id, c.numero_nf, c.chave_nfe, c.chave_cte, c.frete_principal_id, p.numero_nf AS nf_principal, p.chave_nfe AS chave_principal
      FROM fretes c JOIN fretes p ON p.id = c.frete_principal_id
     WHERE c.chave_nfe IS NOT NULL${extra} ORDER BY c.id LIMIT 500`, params);
  const feitos = [];
  const hoje = new Date().toLocaleDateString('pt-BR');
  for (const r of rows) {
    const mesmaNf = String(r.numero_nf || '').replace(/^0+/, '') === String(r.nf_principal || '').replace(/^0+/, '');
    if (!mesmaNf || r.chave_principal) {
      await pool.query(`UPDATE fretes SET frete_principal_id = NULL, vinculo_cte = NULL, alerta_transportadora_diferente = FALSE, valor_total_calculado = NULL,
          status = CASE WHEN status IN ('Faturado', 'Cancelado', 'Não cobrado') THEN status ELSE 'Pendente' END,
          observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), $2::text), atualizado_em = NOW() WHERE id = $1`,
      [r.id, `NF-e ${r.numero_nf} estava guardada como CT-e a mais do registro #${r.frete_principal_id} (NF ${r.nf_principal || '?'}); voltou a ser um registro próprio em ${hoje}.`]);
      await completar(r.id).catch(() => {});
      if (r.chave_cte) await require('./calculoFrete').calcularEGravar(r.id, 'correcao-nota').catch(() => {});
      await require('./ctesVinculados').atualizarAlertaNota(pool, r.frete_principal_id).catch(() => {});
      feitos.push({ id: r.id, principal: r.frete_principal_id, acao: 'soltou' });
    } else {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const { rows: [x] } = await c.query('SELECT chave_nfe, xml_nfe_original FROM fretes WHERE id = $1 FOR UPDATE', [r.id]);
        await c.query('UPDATE fretes SET chave_nfe = NULL, xml_nfe_original = NULL WHERE id = $1', [r.id]);
        await c.query(`UPDATE fretes SET chave_nfe = $2, xml_nfe_original = COALESCE($3, xml_nfe_original),
            observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), $4::text), atualizado_em = NOW() WHERE id = $1`,
        [r.frete_principal_id, x.chave_nfe, x.xml_nfe_original, `NF-e ${r.numero_nf} estava gravada na linha de um CT-e a mais (#${r.id}); passou para este registro em ${hoje}.`]);
        await c.query('COMMIT');
      } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
      await completar(r.frete_principal_id).catch(() => {});
      feitos.push({ id: r.frete_principal_id, principal: r.frete_principal_id, acao: 'principal' });
    }
  }
  return feitos;
}

// ---------- Notas substituídas pelo mesmo pedido ----------
// Até a versão 1.73.0, a NF-e que chegava com o número de pedido de um registro que já tinha outra NF-e era escrita
// POR CIMA dele (pedido faturado em duas notas: a segunda apagava a primeira). Pelo registro de auditoria acha as
// notas que sumiram assim e ainda não voltaram (a nota que está no lugar, o pedido e o CT-e que ficou no registro).
async function notasSubstituidas(req) {
  if (req.usuario?.perfil === 'cliente') return [];
  const { rows } = await pool.query(`WITH imp AS (
        SELECT registro_id, criado_em, substring(detalhes from 'Importou NF-e ([0-9]+)') AS nf, detalhes LIKE '%e vinculou ao registro #%' AS vinculou
          FROM auditoria WHERE acao = 'importar_nfe' AND registro_id IS NOT NULL AND detalhes LIKE 'Importou NF-e %')
      SELECT DISTINCT ON (LTRIM(a.nf, '0')) a.nf AS nf_sumiu, b.nf AS nf_no_lugar, b.registro_id, b.criado_em AS quando,
             f.numero_pedido, f.numero_cte, f.numero_nf AS nf_atual
        FROM imp a JOIN imp b ON b.registro_id = a.registro_id AND b.vinculou AND b.criado_em > a.criado_em AND LTRIM(b.nf, '0') <> LTRIM(a.nf, '0')
        LEFT JOIN fretes f ON f.id = b.registro_id
       WHERE a.nf IS NOT NULL AND b.nf IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM fretes x WHERE LTRIM(x.numero_nf, '0') = LTRIM(a.nf, '0') AND x.chave_nfe IS NOT NULL)
       ORDER BY LTRIM(a.nf, '0'), b.criado_em DESC
       LIMIT 500`);
  return rows;
}

// ---------- Faturamento do dia (Visão geral) ----------
// As NF-e de VENDA e de BONIFICAÇÃO emitidas num dia (pela data de emissão; operação pelo CFOP, ver
// classificarOperacao): soma do valor total das notas, quantidade, clientes, peso, os estados (UF do destinatário)
// que mais compraram e os 14 dias até ele, para comparar. Não contam notas canceladas nem denegadas, nem as de outras
// operações (remessa, transferência, devolução...) e as sem XML (sem CFOP), que só aparecem contadas em "fora".
// A mesma nota em dois registros conta uma vez só (pela chave).
const hojeSaoPaulo = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
async function faturamentoDia(req, q = {}) {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(q.data || '')) && !Number.isNaN(Date.parse(q.data)) ? String(q.data) : hojeSaoPaulo();
  const NOTAS = `n AS (SELECT DISTINCT ON (COALESCE(NULLIF(f.chave_nfe, ''), COALESCE(f.emitente_cnpj, '') || '-' || COALESCE(f.nf_serie, '') || '-' || f.numero_nf))
        f.data_emissao_nf AS dia, COALESCE(f.valor_faturado, f.valor_produtos, 0)::float AS valor, COALESCE(f.peso_bruto, f.peso_kg, 0)::float AS peso,
        COALESCE(f.qtd_volumes, 0)::int AS volumes, f.nf_operacao AS operacao, UPPER(NULLIF(TRIM(f.uf), '')) AS uf, COALESCE(NULLIF(regexp_replace(COALESCE(f.cliente_documento, ''), '\\D', '', 'g'), ''), f.cliente) AS cliente
      FROM fretes f
     WHERE f.frete_principal_id IS NULL AND f.numero_nf IS NOT NULL AND f.numero_nf <> '' AND f.nf_cancelada IS NOT TRUE AND f.nf_denegada IS NOT TRUE
       AND f.nf_operacao IN ('venda', 'bonificacao') AND f.data_emissao_nf BETWEEN $1::date - 13 AND $1::date
     ORDER BY COALESCE(NULLIF(f.chave_nfe, ''), COALESCE(f.emitente_cnpj, '') || '-' || COALESCE(f.nf_serie, '') || '-' || f.numero_nf), f.id)`;
  const [{ rows: [dia] }, { rows: ufs }, { rows: dias }, { rows: [fora] }] = await Promise.all([
    consultaCliente(req, `WITH ${NOTAS} SELECT COUNT(*)::int AS notas, COALESCE(SUM(valor), 0)::float AS valor, COALESCE(SUM(peso), 0)::float AS peso,
        COALESCE(SUM(valor) FILTER (WHERE operacao = 'venda'), 0)::float AS valor_venda, COUNT(*) FILTER (WHERE operacao = 'venda')::int AS notas_venda,
        COALESCE(SUM(valor) FILTER (WHERE operacao = 'bonificacao'), 0)::float AS valor_bonificacao, COUNT(*) FILTER (WHERE operacao = 'bonificacao')::int AS notas_bonificacao,
        COALESCE(SUM(volumes), 0)::int AS volumes, COUNT(DISTINCT cliente)::int AS clientes, COUNT(DISTINCT uf)::int AS estados FROM n WHERE dia = $1::date`, [data]),
    consultaCliente(req, `WITH ${NOTAS} SELECT COALESCE(uf, '?') AS uf, COUNT(*)::int AS notas, COALESCE(SUM(valor), 0)::float AS valor
        FROM n WHERE dia = $1::date GROUP BY 1 ORDER BY 3 DESC, 2 DESC`, [data]),
    consultaCliente(req, `WITH ${NOTAS} SELECT to_char(d, 'YYYY-MM-DD') AS dia, COALESCE(COUNT(n.dia), 0)::int AS notas, COALESCE(SUM(n.valor), 0)::float AS valor
        FROM generate_series($1::date - 13, $1::date, INTERVAL '1 day') d LEFT JOIN n ON n.dia = d::date GROUP BY d ORDER BY d`, [data]),
    // As notas do dia que ficaram fora: outras operações e sem XML (sem CFOP para saber a operação).
    consultaCliente(req, `SELECT COUNT(*) FILTER (WHERE f.nf_operacao = 'outra')::int AS outras,
        COUNT(*) FILTER (WHERE f.xml_nfe_original IS NULL AND f.nf_operacao IS NULL)::int AS sem_xml,
        COUNT(*) FILTER (WHERE f.xml_nfe_original IS NOT NULL AND f.nf_operacao IS NULL)::int AS lendo
      FROM fretes f WHERE f.frete_principal_id IS NULL AND f.numero_nf IS NOT NULL AND f.numero_nf <> '' AND f.nf_cancelada IS NOT TRUE AND f.nf_denegada IS NOT TRUE
        AND f.data_emissao_nf = $1::date`, [data]),
  ]);
  const semanaPassada = dias[dias.length - 8] || null;   // o mesmo dia da semana anterior
  const top = ufs.slice(0, 5);
  const resto = ufs.slice(5);
  return {
    data, hoje: hojeSaoPaulo(), ...dia,
    ticket_medio: dia.notas ? dia.valor / dia.notas : 0,
    estados: top.map((u) => ({ ...u, pct: dia.valor ? u.valor / dia.valor : 0 })),
    outros: resto.length ? { estados: resto.length, notas: resto.reduce((s, u) => s + u.notas, 0), valor: resto.reduce((s, u) => s + u.valor, 0) } : null,
    dias,
    semana_passada: semanaPassada,
    fora,
  };
}

// Números pulados na sequência (mesmo emitente e série), entre a menor e a maior nota do filtro:
// notas que não entraram no sistema (ou foram inutilizadas). Saltos de mais de 500 números não contam (outra faixa).
function faltandoNaSequencia(rows, semFrete = []) {
  const serieDe = (v) => String(v || '').replace(/^0+(?=\d)/, '');
  const grupos = new Map();
  for (const r of rows) {
    const n = Number(String(r.numero_nf || '').replace(/\D/g, ''));
    if (!n) continue;
    // Série "001" é a mesma que "1" (planilha do ERP x XML).
    const serie = serieDe(r.nf_serie);
    const k = `${dig(r.emitente_cnpj)}|${serie}`;
    if (!grupos.has(k)) grupos.set(k, { emitente: r.emitente_nome, emitente_cnpj: r.emitente_cnpj, serie: serie || null, numeros: new Set() });
    grupos.get(k).numeros.add(n);
  }
  // Notas puladas de propósito (sem frete): contam na sequência, com o motivo.
  const pulos = new Map();
  for (const x of semFrete) {
    const k = `${dig(x.emitente_cnpj)}|${serieDe(x.nf_serie)}`;
    const n = Number(String(x.numero_nf || '').replace(/\D/g, ''));
    if (!n) continue;
    if (!pulos.has(k)) pulos.set(k, new Map());
    pulos.get(k).set(n, x);
  }
  const faixas = []; const semFreteNaSeq = []; let total = 0;
  for (const [k, g] of grupos) {
    const nums = [...g.numeros].sort((a, b) => a - b);
    const pg = pulos.get(k) || new Map();
    for (let i = 1; i < nums.length; i += 1) {
      const anterior = nums[i - 1]; const proxima = nums[i];
      const qtdGap = proxima - anterior - 1;
      if (qtdGap < 1 || qtdGap > 500) continue;
      const base = { emitente: g.emitente, emitente_cnpj: g.emitente_cnpj, serie: g.serie, anterior, proxima, depois_de: anterior };
      let de = null;
      const fechar = (ate) => { if (de != null) { faixas.push({ ...base, de, ate, qtd: ate - de + 1 }); total += ate - de + 1; de = null; } };
      for (let n = anterior + 1; n < proxima; n += 1) {
        const pulo = pg.get(n);
        if (pulo) { fechar(n - 1); semFreteNaSeq.push({ ...base, numero: n, motivo: pulo.motivo, natureza: pulo.natureza }); } else if (de == null) de = n;
      }
      fechar(proxima - 1);
    }
  }
  return { total, faixas: faixas.slice(0, 200), sem_frete: semFreteNaSeq.slice(0, 300) };
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
  const danfe = require('./danfe');
  return { quantidade: rows.length, html: danfe.danfeLote(rows.map((r) => ({ xml: r.xml_nfe_original, numero: r.numero_nf, marca: r.nf_cancelada && !r.nf_denegada ? 'CANCELADA' : null })), { empresa: await danfe.empresaDanfe() }) };
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

module.exports = { conferirDia, soltarNotasDentroDeOutroRegistro, notasSubstituidas, classificarOperacao, faturamentoDia, completarCidadePeloCep, completarRedespachoPeloCadastro, corrigirEndereco, danfesEmLote, eventosDaNota, xmlDoEvento, dadosDaNota, completar, completarTodos, marcarDenegada, listar, xmlDaNota, zipDasNotas, lerXml, CSTAT_DENEGADA };
