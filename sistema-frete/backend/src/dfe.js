// NF-e emitidas contra o CNPJ da empresa, buscadas na SEFAZ (NFeDistribuicaoDFe
// do Ambiente Nacional, NT 2014.002) com o certificado A1 que já emite o CT-e,
// e a manifestação do destinatário (ciência, confirmação, desconhecimento,
// operação não realizada). Com a ciência, o XML completo fica disponível e a
// nota é lançada em Notas de entrada (src/entradas.js).
// Regra da SEFAZ: quando não há mais nada (cStat 137 ou ultNSU = maxNSU), só
// pode consultar de novo depois de 1 hora; antes disso ela bloqueia (656).
const zlib = require('zlib');
const pool = require('./db');
const Doc = require('./utils/documento');
const { postar, tag } = require('./cte/sefaz');
const { CODIGO_UF } = require('./cte/ufs');
const { dataHoraBrasilia, digitoVerificador, esc } = require('./cte/montarCte');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const UMA_HORA = 61 * 60 * 1000;   // um minuto de folga sobre a hora da SEFAZ
const NS = 'http://www.portalfiscal.inf.br/nfe';
const URLS = {
  dist: { 1: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx', 2: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx' },
  evento: { 1: 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx', 2: 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx' },
};
const MANIFESTACOES = {
  ciencia: { tp: '210210', desc: 'Ciencia da Operacao', rotulo: 'Ciência da operação' },
  confirmada: { tp: '210200', desc: 'Confirmacao da Operacao', rotulo: 'Confirmação da operação', conclusiva: true },
  desconhecida: { tp: '210220', desc: 'Desconhecimento da Operacao', rotulo: 'Desconhecimento da operação', conclusiva: true },
  nao_realizada: { tp: '210240', desc: 'Operacao nao Realizada', rotulo: 'Operação não realizada', conclusiva: true, justificativa: true },
};
const SITUACOES_NFE = { 1: 'Autorizada', 2: 'Denegada', 3: 'Cancelada' };

// ---------- Contexto: empresa, ambiente, certificado ----------
async function contexto({ semCertificado = false } = {}) {
  const { rows: [e] } = await pool.query('SELECT cnpj, uf, cte_ambiente, cte_demonstracao, cte_verificar_servidor, dfe_config, dfe_estado FROM empresa WHERE id = 1');
  if (!e) throw falha('Cadastre a empresa primeiro.');
  const cnpj = Doc.limpar(e.cnpj);
  if (!cnpj) throw falha('Informe o CNPJ da empresa em Cadastros » Empresa.');
  if (!CODIGO_UF[e.uf]) throw falha('Informe a UF da empresa em Cadastros » Empresa.');
  const demo = !!e.cte_demonstracao;
  let cert = null;
  if (!semCertificado && !demo) cert = await require('./cte/certificado').certificadoDoEmitente(pool);
  return { cnpj, uf: e.uf, tpAmb: Number(e.cte_ambiente) === 1 ? 1 : 2, demo, cert, verificar: !!e.cte_verificar_servidor, config: { ativo: false, ciencia_automatica: false, cte_automatico: false, ...(e.dfe_config || {}) }, estado: e.dfe_estado || {} };
}
async function salvarEstado(mudancas) {
  await pool.query(`UPDATE empresa SET dfe_estado = COALESCE(dfe_estado, '{}'::jsonb) || $1::jsonb WHERE id = 1`, [JSON.stringify(mudancas)]);
}
async function salvarConfig(b = {}) {
  const c = { ativo: !!b.ativo, ciencia_automatica: !!b.ciencia_automatica, cte_automatico: !!b.cte_automatico };
  await pool.query('UPDATE empresa SET dfe_config = $1 WHERE id = 1', [JSON.stringify(c)]);
  return c;
}

// ---------- Distribuição DF-e ----------
const corpoDist = (ctx, interno) => `<distDFeInt xmlns="${NS}" versao="1.01"><tpAmb>${ctx.tpAmb}</tpAmb><cUFAutor>${CODIGO_UF[ctx.uf]}</cUFAutor>`
  + `${ctx.cnpj.length === 11 ? `<CPF>${ctx.cnpj}</CPF>` : `<CNPJ>${ctx.cnpj}</CNPJ>`}${interno}</distDFeInt>`;
const nsu15 = (n) => String(Number(n) || 0).padStart(15, '0');

function lerRetornoDist(resposta) {
  const docs = [];
  const re = /<docZip[^>]*NSU="(\d+)"[^>]*schema="([^"]+)"[^>]*>([^<]+)<\/docZip>/g;
  let m;
  while ((m = re.exec(resposta))) docs.push({ nsu: Number(m[1]), schema: m[2], xml: zlib.gunzipSync(Buffer.from(m[3], 'base64')).toString('utf8') });
  return { cStat: tag(resposta, 'cStat'), xMotivo: tag(resposta, 'xMotivo'), ultNSU: Number(tag(resposta, 'ultNSU') || 0), maxNSU: Number(tag(resposta, 'maxNSU') || 0), docs };
}

async function distribuicao(ctx, interno) {
  if (ctx.demo) return simulador.distribuicao(ctx, interno);
  const corpo = corpoDist(ctx, interno);
  const acao = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse';
  const envelope = '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
    + `<soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>${corpo}</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
  const resposta = await postar(URLS.dist[ctx.tpAmb], envelope, acao, ctx.cert, { verificarServidor: ctx.verificar });
  const r = lerRetornoDist(resposta);
  if (!r.cStat) throw falha(`Resposta inesperada da SEFAZ: ${tag(resposta, 'Text') || tag(resposta, 'faultstring') || 'sem cStat'}`);
  return r;
}

// Grava (ou completa) o que veio num docZip. Devolve 'novo', 'atualizado' ou null.
async function processarDoc(d, ctx) {
  const t = (n) => tag(d.xml, n);
  if (/^resNFe/.test(d.schema)) {
    const chave = t('chNFe');
    if (!chave) return null;
    const { rows: [r] } = await pool.query(
      `INSERT INTO dfe_recebidos (chave, nsu, papel, emitente_doc, emitente_nome, emitente_ie, emissao, valor, tp_nf, situacao_nfe, protocolo)
       VALUES ($1, $2, 'destinatario', $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (chave) DO UPDATE SET nsu = GREATEST(dfe_recebidos.nsu, EXCLUDED.nsu), situacao_nfe = GREATEST(dfe_recebidos.situacao_nfe, EXCLUDED.situacao_nfe), atualizado_em = NOW()
       RETURNING (xmax = 0) AS novo`,
      [chave, d.nsu, Doc.limpar(t('CNPJ') || t('CPF')), t('xNome'), t('IE'), t('dhEmi'), centavos(t('vNF')), Number(t('tpNF')) || null, Number(t('cSitNFe')) || 1, t('nProt')]);
    return r.novo ? 'novo' : 'atualizado';
  }
  if (/^procNFe/.test(d.schema)) {
    const n = require('./entradas').lerXml(d.xml);
    const papel = n.destinatario_doc === ctx.cnpj ? 'destinatario' : 'terceiro';
    const { rows: [r] } = await pool.query(
      `INSERT INTO dfe_recebidos (chave, nsu, papel, emitente_doc, emitente_nome, emitente_ie, emissao, valor, tp_nf, protocolo, xml)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (chave) DO UPDATE SET xml = EXCLUDED.xml, nsu = GREATEST(dfe_recebidos.nsu, EXCLUDED.nsu), papel = EXCLUDED.papel, protocolo = COALESCE(EXCLUDED.protocolo, dfe_recebidos.protocolo), atualizado_em = NOW()
       RETURNING (xmax = 0) AS novo`,
      [n.chave, d.nsu, papel, n.emitente.doc, n.emitente.nome, n.emitente.ie, t('dhEmi'), centavos(n.valor_total), n.saida ? 1 : 0, t('nProt'), d.xml]);
    return r.novo ? 'novo' : 'atualizado';
  }
  if (/^(resEvento|procEventoNFe)/.test(d.schema)) {
    // Cancelamento pelo emitente: a nota deixa de valer.
    if (t('tpEvento') === '110111') {
      const { rowCount } = await pool.query(`UPDATE dfe_recebidos SET situacao_nfe = 3, atualizado_em = NOW() WHERE chave = $1`, [t('chNFe')]);
      return rowCount ? 'atualizado' : null;
    }
  }
  return null;
}

// Busca o que há de novo (distNSU). forcar: ignora só o intervalo do agendador, nunca o bloqueio de 1 hora da SEFAZ.
async function consultar({ automatico = false } = {}) {
  const ctx = await contexto();
  const agora = Date.now();
  const proxima = ctx.estado.proxima_consulta ? Date.parse(ctx.estado.proxima_consulta) : 0;
  if (!ctx.demo && proxima > agora) {
    const quando = new Date(proxima).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    throw falha(`A SEFAZ só aceita uma nova consulta depois de 1 hora quando não há documentos novos. Próxima consulta liberada às ${quando}.`, 429);
  }
  let ult = Number(ctx.estado.ult_nsu) || 0; let max = Number(ctx.estado.max_nsu) || 0;
  const cont = { novos: 0, atualizados: 0, documentos: 0 };
  let r = null;
  for (let i = 0; i < 20; i += 1) {
    r = await distribuicao(ctx, `<distNSU><ultNSU>${nsu15(ult)}</ultNSU></distNSU>`);
    if (r.cStat === '656') {
      await salvarEstado({ proxima_consulta: new Date(agora + UMA_HORA).toISOString(), ultima_consulta: new Date().toISOString(), ultimo_cstat: r.cStat, ultimo_motivo: r.xMotivo });
      throw falha(`A SEFAZ bloqueou por consumo indevido (656): ${r.xMotivo}. Tente de novo em 1 hora.`, 429);
    }
    if (!['137', '138'].includes(r.cStat)) {
      await salvarEstado({ ultima_consulta: new Date().toISOString(), ultimo_cstat: r.cStat, ultimo_motivo: r.xMotivo });
      throw falha(`A SEFAZ recusou a consulta: ${r.cStat} — ${r.xMotivo}`);
    }
    for (const d of r.docs) {
      cont.documentos += 1;
      const x = await processarDoc(d, ctx).catch((e) => { console.error('[dfe] documento', d.nsu, e.message); return null; });
      if (x === 'novo') cont.novos += 1; else if (x === 'atualizado') cont.atualizados += 1;
    }
    if (r.ultNSU) ult = r.ultNSU;
    if (r.maxNSU) max = r.maxNSU;
    await salvarEstado({ ult_nsu: ult, max_nsu: max });
    if (r.cStat === '137' || ult >= max) break;
  }
  const fim = r.cStat === '137' || ult >= max;
  await salvarEstado({ ultima_consulta: new Date().toISOString(), ultimo_cstat: r.cStat, ultimo_motivo: r.xMotivo, proxima_consulta: fim ? new Date(Date.now() + UMA_HORA).toISOString() : null });
  let ciencias = 0;
  if (ctx.config.ciencia_automatica) ciencias = await cienciaAutomatica(ctx);
  // NF-e de carga nova vira rascunho de CT-e sozinha (como as que chegam por e-mail).
  let rascunhos = 0;
  if (ctx.config.cte_automatico) {
    const { rows } = await pool.query(`SELECT d.id FROM dfe_recebidos d WHERE ${SEM_CTE} AND d.cte_motivo IS NULL LIMIT 200`);
    if (rows.length) rascunhos = (await rascunhosCte(rows.map((x) => x.id), 'SEFAZ (automático)').catch((e) => { console.error('[dfe] rascunhos', e.message); return { criados: [] }; })).criados.length;
  }
  return { ...cont, ult_nsu: ult, max_nsu: max, cStat: r.cStat, xMotivo: r.xMotivo, ciencias, rascunhos, automatico };
}

// XML completo de uma nota (consChNFe): só vem depois da ciência (ou para o transportador/autorizado).
async function baixarXml(id) {
  const { rows: [d] } = await pool.query('SELECT id, chave, xml FROM dfe_recebidos WHERE id = $1', [id]);
  if (!d) throw falha('Nota não encontrada.', 404);
  if (d.xml) return { ok: true, ja: true };
  const ctx = await contexto();
  const r = await distribuicao(ctx, `<consChNFe><chNFe>${d.chave}</chNFe></consChNFe>`);
  if (r.cStat === '656') {
    await salvarEstado({ proxima_consulta: new Date(Date.now() + UMA_HORA).toISOString(), ultimo_cstat: r.cStat, ultimo_motivo: r.xMotivo });
    throw falha(`A SEFAZ bloqueou por consumo indevido (656): ${r.xMotivo}. Tente de novo em 1 hora.`, 429);
  }
  const proc = r.docs.find((x) => /^procNFe/.test(x.schema));
  for (const x of r.docs) await processarDoc(x, ctx);
  if (!proc) throw falha(r.cStat === '138' ? 'A SEFAZ ainda não liberou o XML completo (só o resumo). Ele costuma chegar alguns minutos depois da ciência.' : `A SEFAZ não devolveu o XML: ${r.cStat} — ${r.xMotivo}`);
  return { ok: true };
}

// ---------- Manifestação do destinatário ----------
function montarEvento(ctx, { chave, tipo, justificativa }) {
  const m = MANIFESTACOES[tipo];
  const id = `ID${m.tp}${chave}01`;
  const det = `<detEvento versao="1.00"><descEvento>${m.desc}</descEvento>${m.justificativa ? `<xJust>${esc(justificativa)}</xJust>` : ''}</detEvento>`;
  return `<evento xmlns="${NS}" versao="1.00"><infEvento Id="${id}"><cOrgao>91</cOrgao><tpAmb>${ctx.tpAmb}</tpAmb>`
    + `${ctx.cnpj.length === 11 ? `<CPF>${ctx.cnpj}</CPF>` : `<CNPJ>${ctx.cnpj}</CNPJ>`}<chNFe>${chave}</chNFe><dhEvento>${dataHoraBrasilia()}</dhEvento>`
    + `<tpEvento>${m.tp}</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>${det}</infEvento></evento>`;
}

async function enviarEvento(ctx, eventoXml) {
  if (ctx.demo) return simulador.evento(eventoXml);
  const assinado = require('./cte/assinatura').assinar(eventoXml, 'infEvento', ctx.cert);
  const corpo = `<envEvento xmlns="${NS}" versao="1.00"><idLote>${String(Date.now()).slice(-15)}</idLote>${assinado.replace(/^<\?xml[^>]*\?>/, '')}</envEvento>`;
  const acao = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento';
  const envelope = '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
    + `<soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">${corpo}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
  const resposta = await postar(URLS.evento[ctx.tpAmb], envelope, acao, ctx.cert, { verificarServidor: ctx.verificar });
  const ret = (/<retEvento[\s\S]*?<\/retEvento>/.exec(resposta) || [])[0] || '';
  return { cStatLote: tag(resposta, 'cStat'), cStat: tag(ret, 'cStat'), xMotivo: tag(ret, 'xMotivo') || tag(resposta, 'xMotivo'), nProt: tag(ret, 'nProt') };
}

async function manifestar(id, tipo, { justificativa, ctx } = {}) {
  const m = MANIFESTACOES[tipo];
  if (!m) throw falha('Manifestação inválida.');
  const { rows: [d] } = await pool.query('SELECT * FROM dfe_recebidos WHERE id = $1', [id]);
  if (!d) throw falha('Nota não encontrada.', 404);
  if (d.papel !== 'destinatario') throw falha('A manifestação é só para as notas em que a sua empresa é a destinatária.');
  if (Number(d.situacao_nfe) === 3) throw falha('Esta NF-e foi cancelada pelo emitente: não precisa manifestar.');
  if (tipo === 'ciencia' && d.manifestacao !== 'pendente') throw falha('A ciência só vale para a nota ainda sem manifestação.');
  if (m.conclusiva && MANIFESTACOES[d.manifestacao]?.conclusiva) throw falha(`Esta nota já tem a manifestação "${MANIFESTACOES[d.manifestacao].rotulo}".`, 409);
  const just = String(justificativa || '').trim();
  if (m.justificativa && (just.length < 15 || just.length > 255)) throw falha('Escreva a justificativa (de 15 a 255 caracteres).');
  const c = ctx || await contexto();
  const r = await enviarEvento(c, montarEvento(c, { chave: d.chave, tipo, justificativa: just }));
  // 135/136: registrado · 573: o mesmo evento já estava registrado.
  if (!['135', '136', '573'].includes(r.cStat)) {
    await pool.query('UPDATE dfe_recebidos SET manifestacao_erro = $2, atualizado_em = NOW() WHERE id = $1', [id, `${r.cStat || r.cStatLote}: ${r.xMotivo || ''}`.slice(0, 300)]);
    throw falha(`A SEFAZ recusou a manifestação: ${r.cStat || r.cStatLote} — ${r.xMotivo || ''}`);
  }
  await pool.query(`UPDATE dfe_recebidos SET manifestacao = $2, manifestada_em = NOW(), manifestacao_protocolo = $3, manifestacao_erro = NULL, justificativa = $4, atualizado_em = NOW() WHERE id = $1`,
    [id, tipo, r.nProt || null, just || null]);
  // Com a ciência (ou a confirmação), o XML completo fica disponível: tenta baixar já.
  if (['ciencia', 'confirmada'].includes(tipo) && !d.xml) await baixarXml(id).catch(() => null);
  return { ok: true, rotulo: m.rotulo, protocolo: r.nProt, chave: d.chave };
}

async function cienciaAutomatica(ctx) {
  const { rows } = await pool.query(`SELECT id FROM dfe_recebidos WHERE manifestacao = 'pendente' AND papel = 'destinatario' AND situacao_nfe = 1 AND NOT ignorada AND xml IS NULL ORDER BY id LIMIT 20`);
  let n = 0;
  for (const r of rows) { try { await manifestar(r.id, 'ciencia', { ctx }); n += 1; } catch (e) { console.error('[dfe] ciência', r.id, e.message); } }
  return n;
}

// ---------- Lista e estado ----------
// NF-e de carga (a empresa é a transportadora) ainda sem CT-e.
const SEM_CTE = `d.papel = 'terceiro' AND d.situacao_nfe = 1 AND d.xml IS NOT NULL AND NOT d.ignorada
  AND NOT EXISTS (SELECT 1 FROM ctes_emitidos c WHERE c.dados->'nfes' ? d.chave AND c.status NOT IN ('cancelado', 'substituido'))`;
const CTE_DA_NOTA = `(SELECT json_build_object('id', c.id, 'serie', c.serie, 'numero', c.numero, 'status', c.status) FROM ctes_emitidos c
  WHERE c.dados->'nfes' ? d.chave AND c.status NOT IN ('cancelado', 'substituido') ORDER BY c.id DESC LIMIT 1)`;
const FILTROS = {
  lancar: `d.papel = 'destinatario' AND d.situacao_nfe = 1 AND NOT d.ignorada AND n.id IS NULL AND d.manifestacao NOT IN ('desconhecida', 'nao_realizada')`,
  manifestar: `d.papel = 'destinatario' AND d.situacao_nfe = 1 AND NOT d.ignorada AND d.manifestacao IN ('pendente', 'ciencia')`,
  lancadas: 'n.id IS NOT NULL',
  terceiros: `d.papel = 'terceiro'`,
  sem_cte: SEM_CTE,
  todas: 'TRUE',
};
async function listar({ filtro = 'lancar', busca = '' } = {}) {
  const f = FILTROS[filtro] ? filtro : 'lancar';
  const val = [];
  const cond = [FILTROS[f]];
  const b = String(busca || '').trim();
  if (b) { val.push(`%${b}%`, b.replace(/\D/g, '') || '-'); cond.push(`(d.emitente_nome ILIKE $1 OR d.chave LIKE '%' || $2 || '%' OR d.emitente_doc LIKE $2 || '%')`); }
  const base = `FROM dfe_recebidos d LEFT JOIN notas_entrada n ON n.chave = d.chave AND n.status = 'lancada'`;
  const { rows } = await pool.query(
    `SELECT d.id, d.chave, d.nsu, d.papel, d.emitente_doc, d.emitente_nome, d.emissao, d.valor::float, d.situacao_nfe, d.manifestacao, d.manifestada_em, d.manifestacao_erro,
            d.ignorada, (d.xml IS NOT NULL) AS tem_xml, n.id AS nota_entrada_id, n.entrada::text AS lancada_em, d.cte_motivo, ${CTE_DA_NOTA} AS cte,
            SUBSTRING(d.chave FROM 26 FOR 9)::bigint AS numero
       ${base} WHERE ${cond.join(' AND ')} ORDER BY d.emissao DESC NULLS LAST, d.id DESC LIMIT 500`, val);
  const { rows: [c] } = await pool.query(`SELECT ${Object.entries(FILTROS).map(([k, w]) => `COUNT(*) FILTER (WHERE ${w})::int AS ${k}`).join(', ')} ${base}`);
  return { filtro: f, notas: rows, contagens: c };
}

async function estado() {
  const ctx = await contexto({ semCertificado: true });
  return { config: ctx.config, estado: ctx.estado, demo: ctx.demo, ambiente: ctx.tpAmb, manifestacoes: Object.fromEntries(Object.entries(MANIFESTACOES).map(([k, v]) => [k, v.rotulo])), situacoes: SITUACOES_NFE };
}

async function ignorar(id, sim = true) {
  const { rowCount } = await pool.query('UPDATE dfe_recebidos SET ignorada = $2, atualizado_em = NOW() WHERE id = $1', [id, !!sim]);
  if (!rowCount) throw falha('Nota não encontrada.', 404);
}

async function xmlDa(id) {
  const { rows: [d] } = await pool.query('SELECT chave, xml FROM dfe_recebidos WHERE id = $1', [id]);
  if (!d) throw falha('Nota não encontrada.', 404);
  if (!d.xml) throw falha('O XML completo ainda não chegou: dê ciência da operação e aguarde.', 404);
  return d;
}

// ---------- NF-e de carga → rascunho de CT-e ----------
// As NF-e em que a empresa é a transportadora, ainda sem CT-e (para a tela de CT-e).
async function cargasSemCte() {
  const { rows } = await pool.query(`SELECT d.id, d.chave, d.emissao, d.valor::float, d.emitente_nome, d.emitente_doc, d.cte_motivo, d.xml FROM dfe_recebidos d WHERE ${SEM_CTE} ORDER BY d.emissao DESC LIMIT 300`);
  const { lerNfe } = require('./cte/lerNfe');
  return rows.map(({ xml, ...r }) => {
    let n = {}; try { n = lerNfe(xml); } catch { /* fica sem os detalhes */ }
    const fim = n.entrega?.xMun ? n.entrega : n.destinatario?.endereco || {};
    return { ...r, numero: n.numero, destinatario: n.destinatario?.xNome || '', destino: fim.xMun ? `${fim.xMun}/${fim.UF}` : '', volumes: n.volumes || null, peso: n.pesoBruto || null, frete: { 0: 'CIF', 1: 'FOB' }[String(n.modFrete)] || '' };
  });
}

// Monta os rascunhos de CT-e (o mesmo caminho das NF-e que chegam por e-mail: agrupa por remetente e destino,
// calcula o frete pela tabela). O que não pode virar CT-e fica com o motivo e sai da busca automática.
async function rascunhosCte(ids, usuario) {
  const lista = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (!lista.length) throw falha('Escolha pelo menos uma NF-e.');
  const { rows } = await pool.query(`SELECT d.id, d.chave, d.xml FROM dfe_recebidos d WHERE d.id = ANY($1::int[]) AND ${SEM_CTE}`, [lista]);
  if (!rows.length) throw falha('Estas NF-e já têm CT-e (ou não são de carga sua).', 409);
  const xmls = rows.map((r) => ({ nome: `NF-e ${r.chave}`, buffer: Buffer.from(r.xml, 'utf8') }));
  const r = await require('./cte/rascunhoDaNfe').rascunhosDosXml(xmls, { tipo: 'sefaz', usuario });
  for (const i of r.ignoradas || []) {
    const chave = String(i.arquivo || '').replace(/^NF-e /, '');
    if (/^\d{44}$/.test(chave) && !/já está no CT-e/.test(i.motivo)) await pool.query('UPDATE dfe_recebidos SET cte_motivo = $2 WHERE chave = $1', [chave, String(i.motivo).slice(0, 200)]);
  }
  return r;
}

// Para a tela Hoje.
async function pendencias() {
  const { rows: [c] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE ${SEM_CTE} AND d.cte_motivo IS NULL)::int AS sem_cte,
            COUNT(*) FILTER (WHERE ${FILTROS.lancar} AND d.xml IS NOT NULL)::int AS lancar,
            COUNT(*) FILTER (WHERE d.papel = 'destinatario' AND d.situacao_nfe = 1 AND NOT d.ignorada AND d.manifestacao = 'pendente')::int AS sem_manifestacao
       FROM dfe_recebidos d LEFT JOIN notas_entrada n ON n.chave = d.chave AND n.status = 'lancada'`);
  return c;
}

// ---------- Automático ----------
let agendado = null;
function agendar() {
  if (agendado) return;
  const rodar = async () => {
    try {
      const { rows: [e] } = await pool.query('SELECT dfe_config, dfe_estado FROM empresa WHERE id = 1');
      if (!e?.dfe_config?.ativo) return;
      const prox = e.dfe_estado?.proxima_consulta ? Date.parse(e.dfe_estado.proxima_consulta) : 0;
      if (prox > Date.now()) return;
      const r = await consultar({ automatico: true });
      if (r.novos || r.ciencias) console.log(`[dfe] ${r.novos} NF-e nova(s), ${r.ciencias} ciência(s)`);
    } catch (err) { console.error('[dfe]', err.message); }
  };
  agendado = setInterval(rodar, 15 * 60 * 1000);   // confere a cada 15 min; a SEFAZ só é chamada quando o bloqueio de 1 h já passou
  setTimeout(rodar, 2 * 60 * 1000);
}

// ---------- Simulador (modo demonstração) ----------
// Três notas de mentira contra o CNPJ da empresa: resumo primeiro; o XML completo vem depois da ciência.
const simulador = (() => {
  const gz = (xml) => zlib.gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
  const chave = (ctx, cnpjEmit, numero) => {
    const aamm = dataHoraBrasilia().slice(2, 4) + dataHoraBrasilia().slice(5, 7);
    const base = `${CODIGO_UF[ctx.uf]}${aamm}${cnpjEmit}55001${String(numero).padStart(9, '0')}1${String(numero * 7919).padStart(8, '0').slice(-8)}`;
    return base + digitoVerificador(base);
  };
  const NOTAS = [
    { cnpj: '44555666000177', nome: 'AUTO POSTO DEMONSTRACAO LTDA', numero: 7001, itens: [{ x: 'OLEO DIESEL B S10', ncm: '27101921', cfop: '5656', q: 1500, v: 6.05, mono: 1.12 }], dias: 2 },
    { cnpj: '77888111000122', nome: 'PNEUS E PECAS DEMONSTRACAO SA', numero: 7002, itens: [{ x: 'PNEU 295/80 R22.5', ncm: '40112090', cfop: '5102', q: 2, v: 2050, icms: 18 }, { x: 'FILTRO DE OLEO', ncm: '84212300', cfop: '5102', q: 4, v: 85, icms: 18 }], dias: 4 },
    { cnpj: '33222111000144', nome: 'INDUSTRIA CLIENTE DEMONSTRACAO', numero: 7003, terceiro: true, itens: [{ x: 'CAIXAS DE PAPELAO', ncm: '48191000', cfop: '5101', q: 300, v: 12, icms: 18 }], dias: 1 },
  ];
  const valor = (n) => centavos(n.itens.reduce((s, i) => s + i.q * i.v, 0));
  const emissao = (n) => dataHoraBrasilia(new Date(Date.now() - n.dias * 86400000));
  function procNFe(ctx, n) {
    const ch = chave(ctx, n.cnpj, n.numero); const total = valor(n);
    let vBC = 0; let vICMS = 0; let mono = 0;
    const det = n.itens.map((i, k) => {
      const vp = centavos(i.q * i.v);
      let imp;
      if (i.mono) { const m = centavos(i.q * i.mono); mono += m; imp = `<ICMS61><orig>0</orig><CST>61</CST><qBCMonoRet>${i.q}</qBCMonoRet><adRemICMSRet>${i.mono.toFixed(4)}</adRemICMSRet><vICMSMonoRet>${m.toFixed(2)}</vICMSMonoRet></ICMS61>`; } else {
        const v = centavos(vp * i.icms / 100); vBC += vp; vICMS += v;
        imp = `<ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${vp.toFixed(2)}</vBC><pICMS>${i.icms.toFixed(2)}</pICMS><vICMS>${v.toFixed(2)}</vICMS></ICMS00>`;
      }
      return `<det nItem="${k + 1}"><prod><cProd>${k + 1}</cProd><xProd>${i.x}</xProd><NCM>${i.ncm}</NCM><CFOP>${i.cfop}</CFOP><uCom>UN</uCom><qCom>${i.q}</qCom><vUnCom>${i.v.toFixed(2)}</vUnCom><vProd>${vp.toFixed(2)}</vProd></prod><imposto><ICMS>${imp}</ICMS></imposto></det>`;
    }).join('');
    const dest = n.terceiro
      ? '<dest><CNPJ>55666777000188</CNPJ><xNome>LOJA DESTINO DEMONSTRACAO</xNome><enderDest><xLgr>RUA DAS FLORES</xLgr><nro>200</nro><xBairro>CENTRO</xBairro><cMun>3550308</cMun><xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01310100</CEP></enderDest><indIEDest>1</indIEDest><IE>633000000111</IE></dest>'
      : `<dest><CNPJ>${ctx.cnpj}</CNPJ><xNome>SUA EMPRESA</xNome></dest>`;
    const transp = n.terceiro ? `<transp><modFrete>0</modFrete><transporta><CNPJ>${ctx.cnpj}</CNPJ></transporta><vol><qVol>30</qVol><esp>CAIXA</esp><pesoL>420.000</pesoL><pesoB>450.000</pesoB></vol></transp>` : '';
    const ender = n.terceiro ? '<enderEmit><xLgr>AV INDUSTRIAL</xLgr><nro>1000</nro><xBairro>DISTRITO</xBairro><cMun>3509502</cMun><xMun>CAMPINAS</xMun><UF>SP</UF><CEP>13050000</CEP></enderEmit>' : `<enderEmit><xMun>CAMPINAS</xMun><UF>${ctx.uf}</UF></enderEmit>`;
    const venc = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);
    return `<nfeProc xmlns="${NS}" versao="4.00"><NFe><infNFe Id="NFe${ch}" versao="4.00"><ide><cUF>${CODIGO_UF[ctx.uf]}</cUF><natOp>VENDA</natOp><mod>55</mod><serie>1</serie><nNF>${n.numero}</nNF><dhEmi>${emissao(n)}</dhEmi><tpNF>1</tpNF><tpAmb>2</tpAmb></ide>`
      + `<emit><CNPJ>${n.cnpj}</CNPJ><xNome>${n.nome}</xNome>${ender}<IE>123456789</IE></emit>${dest}${det}`
      + `<total><ICMSTot><vBC>${vBC.toFixed(2)}</vBC><vICMS>${vICMS.toFixed(2)}</vICMS><vST>0.00</vST><vProd>${total.toFixed(2)}</vProd><vIPI>0.00</vIPI><vNF>${total.toFixed(2)}</vNF>${mono ? `<vICMSMonoRet>${mono.toFixed(2)}</vICMSMonoRet>` : ''}</ICMSTot></total>${transp}`
      + `${n.terceiro ? '' : `<cobr><dup><nDup>001</nDup><dVenc>${venc}</dVenc><vDup>${total.toFixed(2)}</vDup></dup></cobr>`}</infNFe></NFe>`
      + `<protNFe versao="4.00"><infProt><chNFe>${ch}</chNFe><nProt>1350000${n.numero}0000</nProt><cStat>100</cStat></infProt></protNFe></nfeProc>`;
  }
  const resNFe = (ctx, n) => `<resNFe xmlns="${NS}" versao="1.01"><chNFe>${chave(ctx, n.cnpj, n.numero)}</chNFe><CNPJ>${n.cnpj}</CNPJ><xNome>${n.nome}</xNome><IE>123456789</IE>`
    + `<dhEmi>${emissao(n)}</dhEmi><tpNF>1</tpNF><vNF>${valor(n).toFixed(2)}</vNF><digVal>x</digVal><dhRecbto>${emissao(n)}</dhRecbto><nProt>1350000${n.numero}0000</nProt><cSitNFe>1</cSitNFe></resNFe>`;
  const doc = (nsu, schema, xml) => ({ nsu, schema, xml });
  return {
    async distribuicao(ctx, interno) {
      const consCh = /<chNFe>(\d{44})<\/chNFe>/.exec(interno);
      if (consCh) {
        const n = NOTAS.find((x) => chave(ctx, x.cnpj, x.numero) === consCh[1]);
        if (!n) return { cStat: '137', xMotivo: 'Nenhum documento localizado', ultNSU: 0, maxNSU: 0, docs: [] };
        return { cStat: '138', xMotivo: 'Documento localizado', ultNSU: 0, maxNSU: 0, docs: [doc(0, 'procNFe_v4.00.xsd', procNFe(ctx, n))] };
      }
      const ult = Number((/<ultNSU>(\d+)<\/ultNSU>/.exec(interno) || [])[1] || 0);
      const todos = NOTAS.map((n, k) => doc(k + 1, n.terceiro ? 'procNFe_v4.00.xsd' : 'resNFe_v1.01.xsd', n.terceiro ? procNFe(ctx, n) : resNFe(ctx, n)));
      const novos = todos.filter((d) => d.nsu > ult);
      if (!novos.length) return { cStat: '137', xMotivo: 'Nenhum documento localizado', ultNSU: ult, maxNSU: todos.length, docs: [] };
      return { cStat: '138', xMotivo: 'Documento(s) localizado(s)', ultNSU: todos.length, maxNSU: todos.length, docs: novos };
    },
    async evento() { return { cStatLote: '128', cStat: '135', xMotivo: 'Evento registrado e vinculado a NF-e (demonstração)', nProt: `891${String(Date.now()).slice(-12)}` }; },
    gz,
  };
})();

module.exports = { MANIFESTACOES, SITUACOES_NFE, contexto, salvarConfig, consultar, baixarXml, manifestar, listar, estado, ignorar, xmlDa, pendencias, agendar, cargasSemCte, rascunhosCte, lerRetornoDist, processarDoc, montarEvento, corpoDist };
