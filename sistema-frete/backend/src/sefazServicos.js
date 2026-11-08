// Serviços da SEFAZ além da emissão:
//  1. CT-e na SEFAZ (CTeDistribuicaoDFe do Ambiente Nacional): os CT-e em que a empresa aparece
//     (tomadora, remetente, destinatária, expedidora, recebedora ou autorizada a baixar o XML) entram
//     sozinhos em "CT-e recebidos", pelo mesmo caminho do XML enviado à mão. Usa o certificado A1 da
//     emissão. Regra da SEFAZ: sem documento novo (137) só pode consultar de novo depois de 1 hora.
//  2. Consulta de cadastro de contribuinte (CadConsultaCadastro4): a situação da IE de um CNPJ/CPF numa UF
//     (habilitada, não habilitada, não cadastrada). Fica guardada por 24 h (tabela sefaz_cadastros).
//     Nem toda UF oferece o serviço: quando não oferece, o sistema diz isso e segue.
//  3. Situação da SEFAZ: a cada 15 min consulta o status do serviço de CT-e da UF da empresa (e da SVC).
//     Duas falhas seguidas = fora do ar → aviso na tela Hoje com a sugestão de ligar a contingência.
// No modo demonstração tudo é simulado aqui mesmo (nada vai à SEFAZ).
const zlib = require('zlib');
const pool = require('./db');
const Doc = require('./utils/documento');
const { postar, tag } = require('./cte/sefaz');
const { CODIGO_UF } = require('./cte/ufs');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const UMA_HORA = 61 * 60 * 1000;
const NS_CTE = 'http://www.portalfiscal.inf.br/cte';
const NS_NFE = 'http://www.portalfiscal.inf.br/nfe';
const SOAP12 = (corpo) => '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
  + `<soap12:Body>${corpo}</soap12:Body></soap12:Envelope>`;

async function empresa() {
  const { rows: [e] } = await pool.query(`SELECT cnpj, uf, cte_ambiente, cte_demonstracao, cte_verificar_servidor, cte_contingencia, cte_dist_config, cte_dist_estado FROM empresa WHERE id = 1`);
  if (!e) throw falha('Cadastre a empresa primeiro.');
  return e;
}
async function contexto({ semCertificado = false } = {}) {
  const e = await empresa();
  const cnpj = Doc.limpar(e.cnpj);
  if (!cnpj) throw falha('Informe o CNPJ da empresa em Configuração fiscal.');
  if (!CODIGO_UF[e.uf]) throw falha('Informe a UF da empresa em Configuração fiscal.');
  const demo = !!e.cte_demonstracao;
  const cert = !semCertificado && !demo ? await require('./cte/certificado').certificadoDoEmitente(pool) : null;
  return { cnpj, uf: e.uf, tpAmb: Number(e.cte_ambiente) === 1 ? 1 : 2, demo, cert, verificar: !!e.cte_verificar_servidor, contingencia: !!e.cte_contingencia,
    config: { ativo: false, ...(e.cte_dist_config || {}) }, estado: e.cte_dist_estado || {} };
}

// =====================================================================
// 1. CT-e na SEFAZ (distribuição)
// =====================================================================
const URL_DIST = { 1: 'https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx', 2: 'https://hom1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx' };
const nsu15 = (n) => String(Number(n) || 0).padStart(15, '0');
const corpoDist = (ctx, ult) => `<distDFeInt xmlns="${NS_CTE}" versao="1.00"><tpAmb>${ctx.tpAmb}</tpAmb><cUFAutor>${CODIGO_UF[ctx.uf]}</cUFAutor>`
  + `${ctx.cnpj.length === 11 ? `<CPF>${ctx.cnpj}</CPF>` : `<CNPJ>${ctx.cnpj}</CNPJ>`}<distNSU><ultNSU>${nsu15(ult)}</ultNSU></distNSU></distDFeInt>`;

function lerRetornoDist(resposta) {
  const docs = [];
  const re = /<docZip[^>]*NSU="(\d+)"[^>]*schema="([^"]+)"[^>]*>([^<]+)<\/docZip>|<docZip[^>]*schema="([^"]+)"[^>]*NSU="(\d+)"[^>]*>([^<]+)<\/docZip>/g;
  let m;
  while ((m = re.exec(resposta))) {
    const [nsu, schema, b64] = m[1] ? [m[1], m[2], m[3]] : [m[5], m[4], m[6]];
    docs.push({ nsu: Number(nsu), schema, xml: zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8') });
  }
  return { cStat: tag(resposta, 'cStat'), xMotivo: tag(resposta, 'xMotivo'), ultNSU: Number(tag(resposta, 'ultNSU') || 0), maxNSU: Number(tag(resposta, 'maxNSU') || 0), docs };
}

async function distribuicao(ctx, ult) {
  if (ctx.demo) return simulador.distribuicao(ctx, ult);
  const ns = 'http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe';
  const envelope = SOAP12(`<cteDistDFeInteresse xmlns="${ns}"><cteDadosMsg>${corpoDist(ctx, ult)}</cteDadosMsg></cteDistDFeInteresse>`);
  const resposta = await postar(URL_DIST[ctx.tpAmb], envelope, `${ns}/cteDistDFeInteresse`, ctx.cert, { verificarServidor: ctx.verificar });
  const r = lerRetornoDist(resposta);
  if (!r.cStat) throw falha(`Resposta inesperada da SEFAZ: ${tag(resposta, 'Text') || tag(resposta, 'faultstring') || 'sem cStat'}`);
  return r;
}

const USUARIO_SEFAZ = { id: null, nome: 'SEFAZ (busca automática de CT-e)', perfil: 'admin', pode_ver_todos: true };
async function registrarDoc(d, campos) {
  await pool.query(`INSERT INTO cte_dist_docs (nsu, schema, chave, emitente_nome, emitente_doc, resultado, mensagem) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (nsu) DO UPDATE SET resultado = EXCLUDED.resultado, mensagem = EXCLUDED.mensagem, criado_em = NOW()`,
  [d.nsu, String(d.schema).slice(0, 40), campos.chave || null, (campos.emitente_nome || '').slice(0, 200) || null, campos.emitente_doc || null, campos.resultado, (campos.mensagem || '').slice(0, 500) || null]);
}

// Um documento da distribuição: CT-e completo → importa; evento → aplica (cancelamento, CC-e...); resumo → só registra.
async function processarDoc(d, ctx) {
  const t = (n) => tag(d.xml, n);
  const chave = t('chCTe') || (/Id="CTe(\d{44})"/.exec(d.xml) || [])[1] || null;
  const emitBloco = (/<emit>([\s\S]*?)<\/emit>/.exec(d.xml) || [])[1] || '';
  const emitente = { emitente_nome: tag(emitBloco, 'xNome'), emitente_doc: Doc.limpar(tag(emitBloco, 'CNPJ') || tag(emitBloco, 'CPF')) };
  const { importarXmlInterno } = require('./routes/upload');
  if (/^procCTe|^procCTeOS/i.test(d.schema)) {
    if (emitente.emitente_doc && emitente.emitente_doc === ctx.cnpj) {
      await registrarDoc(d, { chave, ...emitente, resultado: 'proprio', mensagem: 'CT-e emitido pela própria empresa (já está em CT-e emitidos).' });
      return 'proprio';
    }
    const r = await importarXmlInterno(Buffer.from(d.xml, 'utf8'), `SEFAZ NSU ${d.nsu}.xml`, USUARIO_SEFAZ);
    const resultado = r.ok ? 'importado' : r.status === 409 ? 'ja_existia' : 'erro';
    await registrarDoc(d, { chave, ...emitente, resultado, mensagem: r.mensagem });
    return resultado;
  }
  if (/^procEvento/i.test(d.schema)) {
    const r = await importarXmlInterno(Buffer.from(d.xml, 'utf8'), `SEFAZ NSU ${d.nsu} evento.xml`, USUARIO_SEFAZ);
    const resultado = r.ok ? 'evento' : r.status === 409 ? 'ja_existia' : 'erro';
    await registrarDoc(d, { chave, resultado, mensagem: `${t('descEvento') || 'Evento'}: ${r.mensagem}` });
    return resultado;
  }
  await registrarDoc(d, { chave, ...emitente, resultado: 'ignorado', mensagem: `Documento ${d.schema} (só resumo).` });
  return 'ignorado';
}

async function salvarEstado(m) {
  await pool.query(`UPDATE empresa SET cte_dist_estado = COALESCE(cte_dist_estado, '{}'::jsonb) || $1::jsonb WHERE id = 1`, [JSON.stringify(m)]);
}
async function salvarConfigCtes(b = {}) {
  const c = { ativo: !!b.ativo };
  await pool.query('UPDATE empresa SET cte_dist_config = $1 WHERE id = 1', [JSON.stringify(c)]);
  return c;
}

async function consultarCtes({ automatico = false } = {}) {
  const ctx = await contexto();
  const agora = Date.now();
  const proxima = ctx.estado.proxima_consulta ? Date.parse(ctx.estado.proxima_consulta) : 0;
  if (!ctx.demo && proxima > agora) {
    const quando = new Date(proxima).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    throw falha(`A SEFAZ só aceita uma nova consulta depois de 1 hora quando não há documentos novos. Próxima consulta liberada às ${quando}.`, 429);
  }
  let ult = Number(ctx.estado.ult_nsu) || 0; let max = Number(ctx.estado.max_nsu) || 0;
  const cont = { documentos: 0, importados: 0, ja_existiam: 0, proprios: 0, eventos: 0, erros: 0 };
  let r = null;
  for (let i = 0; i < 20; i += 1) {
    r = await distribuicao(ctx, ult);
    if (r.cStat === '656') {
      await salvarEstado({ proxima_consulta: new Date(agora + UMA_HORA).toISOString(), ultima_consulta: new Date().toISOString(), ultimo_cstat: r.cStat, ultimo_motivo: r.xMotivo });
      throw falha(`A SEFAZ bloqueou por consumo indevido (656): ${r.xMotivo}. Tente de novo em 1 hora.`, 429);
    }
    if (!['137', '138'].includes(r.cStat)) {
      await salvarEstado({ ultima_consulta: new Date().toISOString(), ultimo_cstat: r.cStat, ultimo_motivo: r.xMotivo });
      throw falha(`A SEFAZ recusou a consulta: ${r.cStat} — ${r.xMotivo}`);
    }
    // Primeiro os CT-e, depois os eventos (o evento precisa achar o CT-e).
    const ordenados = [...r.docs].sort((a, b) => (/^procEvento/i.test(a.schema) ? 1 : 0) - (/^procEvento/i.test(b.schema) ? 1 : 0) || a.nsu - b.nsu);
    for (const d of ordenados) {
      cont.documentos += 1;
      const x = await processarDoc(d, ctx).catch(async (e) => {
        console.error('[cte-dist] documento', d.nsu, e.message);
        await registrarDoc(d, { resultado: 'erro', mensagem: e.message }).catch(() => {});
        return 'erro';
      });
      const k = { importado: 'importados', ja_existia: 'ja_existiam', proprio: 'proprios', evento: 'eventos', erro: 'erros' }[x];
      if (k) cont[k] += 1;
    }
    if (r.ultNSU) ult = r.ultNSU;
    if (r.maxNSU) max = r.maxNSU;
    await salvarEstado({ ult_nsu: ult, max_nsu: max });
    if (r.cStat === '137' || ult >= max) break;
  }
  const fim = r.cStat === '137' || ult >= max;
  await salvarEstado({ ultima_consulta: new Date().toISOString(), ultimo_cstat: r.cStat, ultimo_motivo: r.xMotivo, proxima_consulta: fim && !ctx.demo ? new Date(Date.now() + UMA_HORA).toISOString() : null,
    ultimo_resultado: cont });
  return { ...cont, ult_nsu: ult, max_nsu: max, cStat: r.cStat, xMotivo: r.xMotivo, automatico };
}

async function estadoCtes() {
  const e = await empresa();
  const { rows: docs } = await pool.query(`SELECT d.id, d.nsu, d.chave, d.emitente_nome, d.emitente_doc, d.resultado, d.mensagem, d.criado_em,
      (SELECT f.id FROM fretes f WHERE f.chave_cte = d.chave LIMIT 1) AS frete_id
    FROM cte_dist_docs d ORDER BY d.criado_em DESC, d.nsu DESC LIMIT 50`);
  return { config: { ativo: false, ...(e.cte_dist_config || {}) }, estado: e.cte_dist_estado || {}, demo: !!e.cte_demonstracao, ambiente: Number(e.cte_ambiente) === 1 ? 1 : 2, docs };
}

// =====================================================================
// 2. Consulta de cadastro de contribuinte (IE)
// =====================================================================
// Endereços de produção do CadConsultaCadastro4 (NF-e 4.00). As UFs fora da lista usam a SVRS; se a UF
// não oferecer o serviço, a SEFAZ responde com erro e o sistema avisa.
const SVRS_CAD = 'https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx';
const URL_CAD = {
  BA: 'https://nfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx',
  GO: 'https://nfe.sefaz.go.gov.br/nfe/services/CadConsultaCadastro4',
  MG: 'https://nfe.fazenda.mg.gov.br/nfe2/services/CadConsultaCadastro4',
  MS: 'https://nfe.sefaz.ms.gov.br/ws/CadConsultaCadastro4',
  MT: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/CadConsultaCadastro4',
  PE: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/CadConsultaCadastro4',
  PR: 'https://nfe.sefa.pr.gov.br/nfe/CadConsultaCadastro4',
  RS: 'https://cad.sefazrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx',
  SP: 'https://nfe.fazenda.sp.gov.br/ws/cadconsultacadastro4.asmx',
};
const urlCadastro = (uf) => URL_CAD[uf] || SVRS_CAD;
const SITUACOES_IE = { habilitada: 'Habilitada', nao_habilitada: 'Não habilitada (baixada, suspensa ou inapta)', nao_cadastrado: 'Sem inscrição estadual nesta UF', indisponivel: 'Consulta indisponível' };
const VALIDADE_CACHE_H = 24;

const corpoCad = ({ uf, doc, ie }) => `<ConsCad xmlns="${NS_NFE}" versao="2.00"><infCons><xServ>CONS-CAD</xServ><UF>${uf}</UF>`
  + `${ie ? `<IE>${ie}</IE>` : doc.length === 11 ? `<CPF>${doc}</CPF>` : `<CNPJ>${doc}</CNPJ>`}</infCons></ConsCad>`;

// Lê o retConsCad: cStat 111 (uma inscrição) / 112 (várias) / 259 (não cadastrado) / outros (erro).
function lerRetornoCad(resposta) {
  const inf = (/<infCons>([\s\S]*?)<\/infCons>/.exec(resposta) || [])[1] || resposta;
  const cStat = tag(inf, 'cStat'); const xMotivo = tag(inf, 'xMotivo');
  const cads = [];
  const re = /<infCad>([\s\S]*?)<\/infCad>/g;
  let m;
  while ((m = re.exec(resposta))) {
    const c = m[1];
    const ender = (/<ender>([\s\S]*?)<\/ender>/.exec(c) || [])[1] || '';
    cads.push({ ie: tag(c, 'IE'), doc: Doc.limpar(tag(c, 'CNPJ') || tag(c, 'CPF')), uf: tag(c, 'UF'), habilitada: tag(c, 'cSit') === '1', nome: tag(c, 'xNome'), fantasia: tag(c, 'xFant'),
      regime: tag(c, 'xRegApur'), cnae: tag(c, 'CNAE'), inicio: tag(c, 'dIniAtiv'), ultima_situacao: tag(c, 'dUltSit'), baixa: tag(c, 'dBaixa'), cred_cte: tag(c, 'indCredCTe'),
      municipio: tag(ender, 'xMun'), cep: tag(ender, 'CEP'), logradouro: tag(ender, 'xLgr'), numero: tag(ender, 'nro'), bairro: tag(ender, 'xBairro') });
  }
  let situacao;
  if (['111', '112'].includes(cStat)) situacao = cads.some((c) => c.habilitada) ? 'habilitada' : 'nao_habilitada';
  else if (cStat === '259') situacao = 'nao_cadastrado';
  else situacao = 'indisponivel';
  return { cStat, xMotivo, situacao, cadastros: cads };
}

async function chamarCadastro(ctx, { uf, doc, ie }) {
  if (ctx.demo) return simulador.cadastro({ uf, doc, ie });
  const ns = 'http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4';
  const envelope = SOAP12(`<nfeDadosMsg xmlns="${ns}">${corpoCad({ uf, doc, ie })}</nfeDadosMsg>`);
  const resposta = await postar(urlCadastro(uf), envelope, `${ns}/consultaCadastro`, ctx.cert, { verificarServidor: ctx.verificar, timeout: 30000 });
  const r = lerRetornoCad(resposta);
  if (!r.cStat) throw falha(`A SEFAZ ${uf} não respondeu à consulta de cadastro: ${tag(resposta, 'Text') || tag(resposta, 'faultstring') || 'resposta sem cStat'}`);
  return r;
}

// Consulta (ou devolve a guardada há menos de 24 h). semRede: só o que está guardado (para avisos rápidos).
async function consultarCadastro({ doc, uf, ie, forcar = false, semRede = false } = {}) {
  const d = Doc.limpar(doc);
  const u = String(uf || '').toUpperCase();
  if (!CODIGO_UF[u]) throw falha('Informe a UF da inscrição.');
  if (!d || ![11, 14].includes(d.length)) throw falha('Informe o CNPJ ou o CPF.');
  const ieLimpa = String(ie || '').replace(/\W/g, '').toUpperCase();
  if (!forcar) {
    const { rows: [c] } = await pool.query(`SELECT * FROM sefaz_cadastros WHERE doc = $1 AND uf = $2 AND consultado_em > NOW() - ($3 || ' hours')::interval`, [d, u, String(VALIDADE_CACHE_H)]);
    if (c) return { ...c.resposta, guardada: true, consultado_em: c.consultado_em };
  }
  if (semRede) return null;
  const ctx = await contexto();
  let r;
  try { r = await chamarCadastro(ctx, { uf: u, doc: d, ie: null }); } catch (e) {
    return { situacao: 'indisponivel', xMotivo: e.message, cadastros: [], uf: u, doc: d, rotulo: SITUACOES_IE.indisponivel, consultado_em: new Date().toISOString() };
  }
  // A IE informada no cadastro confere com a da SEFAZ?
  const informada = ieLimpa && !/^ISENTO$/.test(ieLimpa) ? ieLimpa : null;
  const daIe = informada ? r.cadastros.find((c) => String(c.ie || '').replace(/\W/g, '') === informada) : null;
  const res = { ...r, uf: u, doc: d, ie_informada: informada, ie_confere: informada ? !!daIe : null,
    situacao_ie_informada: daIe ? (daIe.habilitada ? 'habilitada' : 'nao_habilitada') : null,
    rotulo: SITUACOES_IE[r.situacao], demonstracao: ctx.demo || undefined, consultado_em: new Date().toISOString() };
  if (r.situacao !== 'indisponivel') {
    await pool.query(`INSERT INTO sefaz_cadastros (doc, uf, situacao, cstat, motivo, resposta, consultado_em) VALUES ($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (doc, uf) DO UPDATE SET situacao = EXCLUDED.situacao, cstat = EXCLUDED.cstat, motivo = EXCLUDED.motivo, resposta = EXCLUDED.resposta, consultado_em = NOW()`,
    [d, u, r.situacao, r.cStat, (r.xMotivo || '').slice(0, 300), JSON.stringify(res)]);
  }
  return res;
}

// Aviso para a emissão do CT-e: só o que importa (IE não habilitada ou que não confere).
function avisoDoCadastro(r, papel = 'tomador') {
  if (!r) return null;
  if (r.situacao === 'nao_habilitada') return `A IE do ${papel} está NÃO HABILITADA na SEFAZ ${r.uf} (baixada, suspensa ou inapta).`;
  if (r.ie_confere === false) return `A IE do ${papel} (${r.ie_informada}) não aparece na SEFAZ ${r.uf} para este CNPJ${r.cadastros?.length ? `: lá constam ${r.cadastros.map((c) => c.ie).filter(Boolean).join(', ')}` : ''}.`;
  if (r.situacao_ie_informada === 'nao_habilitada') return `A IE ${r.ie_informada} do ${papel} está NÃO HABILITADA na SEFAZ ${r.uf}.`;
  return null;
}

// =====================================================================
// 3. Situação da SEFAZ (status do serviço de CT-e)
// =====================================================================
const OK_STATUS = ['107'];
async function verificarStatus() {
  const e = await empresa();
  if (!CODIGO_UF[e.uf]) return null;
  const emissao = require('./cte/emissao');
  const sefaz = require('./cte/sefaz');
  const demo = !!e.cte_demonstracao;
  let cert = null;
  if (!demo) {
    try { cert = await require('./cte/certificado').certificadoDoEmitente(pool); } catch { return null; }   // sem certificado: não dá para verificar
  }
  const tpAmb = Number(e.cte_ambiente) === 1 ? 1 : 2;
  const svc = emissao.contingenciaDaUf(e.uf);
  const alvos = [{ contingencia: false, nome: `SEFAZ ${e.uf}` }, { contingencia: true, nome: svc.sigla }];
  const resultados = [];
  for (const a of alvos) {
    const ini = Date.now();
    let r;
    try {
      const s = await sefaz.statusServico({ uf: e.uf, tpAmb, cert, verificarServidor: e.cte_verificar_servidor, simulado: demo ? {} : null, contingencia: a.contingencia });
      r = { ok: OK_STATUS.includes(s.cStat), cstat: s.cStat, motivo: s.xMotivo, tmed: Number(s.tMed) || null, autorizador: a.nome };
    } catch (err) {
      r = { ok: false, cstat: null, motivo: err.message, tmed: null, autorizador: a.nome };
    }
    r.ms = Date.now() - ini;
    await pool.query('INSERT INTO sefaz_status (servico, autorizador, contingencia, ok, cstat, motivo, tmed, ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      ['cte', r.autorizador, a.contingencia, r.ok, r.cstat, (r.motivo || '').slice(0, 300), r.tmed, r.ms]);
    resultados.push({ ...r, contingencia: a.contingencia });
  }
  await pool.query(`DELETE FROM sefaz_status WHERE verificado_em < NOW() - INTERVAL '7 days'`);
  return resultados;
}

// Situação atual: as últimas verificações de cada autorizador. Fora do ar = as 2 últimas falharam.
async function situacao() {
  const { rows } = await pool.query(`SELECT * FROM (SELECT s.*, ROW_NUMBER() OVER (PARTITION BY contingencia ORDER BY verificado_em DESC) AS n FROM sefaz_status s WHERE servico = 'cte') x
    WHERE n <= 12 ORDER BY contingencia, verificado_em DESC`);
  const e = await empresa();
  const montar = (cont) => {
    const l = rows.filter((r) => r.contingencia === cont);
    if (!l.length) return null;
    const fora = l.length >= 2 && !l[0].ok && !l[1].ok;
    // Desde quando: a primeira falha da sequência atual.
    let desde = null;
    if (!l[0].ok) { for (const r of l) { if (r.ok) break; desde = r.verificado_em; } }
    return { autorizador: l[0].autorizador, ok: l[0].ok, fora_do_ar: fora, instavel: !l[0].ok && !fora, cstat: l[0].cstat, motivo: l[0].motivo, tmed: l[0].tmed, ms: l[0].ms,
      verificado_em: l[0].verificado_em, desde, historico: l.map((r) => ({ ok: r.ok, cstat: r.cstat, motivo: r.motivo, ms: r.ms, verificado_em: r.verificado_em })) };
  };
  return { normal: montar(false), contingencia: montar(true), contingencia_ligada: !!e.cte_contingencia, demonstracao: !!e.cte_demonstracao, uf: e.uf };
}

// Para a tela Hoje: o que fazer.
async function avisoHoje() {
  const s = await situacao();
  if (!s.normal) return null;
  if (s.normal.fora_do_ar && !s.contingencia_ligada) {
    const svcOk = s.contingencia?.ok;
    return { nivel: 'perigo', titulo: `${s.normal.autorizador} fora do ar`, detalhe: `${s.normal.motivo || 'sem resposta'}${svcOk ? ` · a ${s.contingencia.autorizador} está no ar: ligue a contingência` : ''}` };
  }
  if (s.contingencia_ligada && s.normal.ok) {
    return { nivel: 'atencao', titulo: `${s.normal.autorizador} voltou`, detalhe: 'a contingência ainda está ligada: desligue na Configuração fiscal' };
  }
  return null;
}

// =====================================================================
// Agendador
// =====================================================================
let agendado = null;
function agendar() {
  if (agendado) return;
  const status = async () => { try { await verificarStatus(); } catch (err) { console.error('[sefaz-status]', err.message); } };
  const ctes = async () => {
    try {
      const e = await empresa().catch(() => null);
      if (!e?.cte_dist_config?.ativo) return;
      const prox = e.cte_dist_estado?.proxima_consulta ? Date.parse(e.cte_dist_estado.proxima_consulta) : 0;
      if (prox > Date.now()) return;
      const r = await consultarCtes({ automatico: true });
      if (r.importados) console.log(`[cte-dist] ${r.importados} CT-e novo(s) da SEFAZ`);
    } catch (err) { console.error('[cte-dist]', err.message); }
  };
  agendado = setInterval(() => { status(); ctes(); }, 15 * 60 * 1000);
  setTimeout(() => { status(); ctes(); }, 90 * 1000);
}

// =====================================================================
// Simulador (modo demonstração)
// =====================================================================
const simulador = (() => {
  const gz = (xml) => zlib.gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
  const { digitoVerificador } = require('./cte/montarCte');
  const chave = (ctx, cnpjEmit, numero) => {
    const d = new Date(Date.now() - 3 * 3600000).toISOString();
    const base = `${CODIGO_UF[ctx.uf]}${d.slice(2, 4)}${d.slice(5, 7)}${cnpjEmit}57001${String(numero).padStart(9, '0')}1${String(numero * 7919).padStart(8, '0').slice(-8)}`;
    return base + digitoVerificador(base);
  };
  const TRANSPORTADORAS = [
    { cnpj: '61222333000140', nome: 'RODOVIARIO DEMONSTRACAO LTDA', numero: 9101, valor: 1850, origem: ['CAMPINAS', 'SP'], destino: ['CURITIBA', 'PR'] },
    { cnpj: '72333444000150', nome: 'EXPRESSO EXEMPLO TRANSPORTES SA', numero: 9102, valor: 640.5, origem: ['SAO PAULO', 'SP'], destino: ['SANTOS', 'SP'] },
  ];
  const procCte = (ctx, t, proprio = false) => {
    const emit = proprio ? ctx.cnpj : t.cnpj;
    const ch = chave(ctx, emit, t.numero);
    const dh = new Date(Date.now() - 3 * 3600000 - 86400000).toISOString().slice(0, 19);
    const icms = Math.round(t.valor * 12) / 100;
    return `<?xml version="1.0" encoding="UTF-8"?><cteProc xmlns="${NS_CTE}" versao="4.00"><CTe><infCte Id="CTe${ch}" versao="4.00">`
      + `<ide><cUF>${CODIGO_UF[ctx.uf]}</cUF><CFOP>${t.origem[1] === t.destino[1] ? '5353' : '6353'}</CFOP><natOp>PRESTACAO DE SERVICO DE TRANSPORTE</natOp><mod>57</mod><serie>1</serie><nCT>${t.numero}</nCT><dhEmi>${dh}-03:00</dhEmi><tpAmb>2</tpAmb><tpCTe>0</tpCTe><modal>01</modal><tpServ>0</tpServ>`
      + `<xMunIni>${t.origem[0]}</xMunIni><UFIni>${t.origem[1]}</UFIni><xMunFim>${t.destino[0]}</xMunFim><UFFim>${t.destino[1]}</UFFim><toma3><toma>0</toma></toma3></ide>`
      + `<emit><CNPJ>${emit}</CNPJ><IE>111222333</IE><xNome>${proprio ? 'SUA EMPRESA' : t.nome}</xNome><enderEmit><xMun>${t.origem[0]}</xMun><UF>${t.origem[1]}</UF></enderEmit></emit>`
      + `<rem><CNPJ>${ctx.cnpj}</CNPJ><xNome>SUA EMPRESA</xNome><enderReme><xMun>${t.origem[0]}</xMun><UF>${t.origem[1]}</UF></enderReme></rem>`
      + `<dest><CNPJ>55666777000188</CNPJ><xNome>CLIENTE DESTINO DEMONSTRACAO</xNome><enderDest><xMun>${t.destino[0]}</xMun><UF>${t.destino[1]}</UF></enderDest></dest>`
      + `<vPrest><vTPrest>${t.valor.toFixed(2)}</vTPrest><vRec>${t.valor.toFixed(2)}</vRec></vPrest>`
      + `<imp><ICMS><ICMS00><CST>00</CST><vBC>${t.valor.toFixed(2)}</vBC><pICMS>12.00</pICMS><vICMS>${icms.toFixed(2)}</vICMS></ICMS00></ICMS></imp>`
      + `<infCTeNorm><infCarga><vCarga>${(t.valor * 40).toFixed(2)}</vCarga><proPred>MERCADORIAS DIVERSAS</proPred></infCarga><infModal versaoModal="4.00"><rodo><RNTRC>12345678</RNTRC></rodo></infModal></infCTeNorm>`
      + `</infCte></CTe><protCTe versao="4.00"><infProt><tpAmb>2</tpAmb><chCTe>${ch}</chCTe><dhRecbto>${dh}-03:00</dhRecbto><nProt>135${String(t.numero).padStart(12, '0')}</nProt><cStat>100</cStat><xMotivo>Autorizado o uso do CT-e</xMotivo></infProt></protCTe></cteProc>`;
  };
  return {
    // Dois CT-e de transportadoras em que a empresa é a remetente (tomadora) e um emitido pela própria empresa.
    async distribuicao(ctx, ult) {
      const todos = [
        { nsu: 1, schema: 'procCTe_v4.00.xsd', xml: procCte(ctx, TRANSPORTADORAS[0]) },
        { nsu: 2, schema: 'procCTe_v4.00.xsd', xml: procCte(ctx, TRANSPORTADORAS[1]) },
        { nsu: 3, schema: 'procCTe_v4.00.xsd', xml: procCte(ctx, { ...TRANSPORTADORAS[0], numero: 9103 }, true) },
      ];
      const novos = todos.filter((d) => d.nsu > Number(ult));
      if (!novos.length) return { cStat: '137', xMotivo: 'Nenhum documento localizado (demonstração)', ultNSU: Number(ult), maxNSU: todos.length, docs: [] };
      return { cStat: '138', xMotivo: 'Documento(s) localizado(s) (demonstração)', ultNSU: todos.length, maxNSU: todos.length, docs: novos };
    },
    // Habilitada, com a IE do cadastro. O CNPJ de exemplo 11.444.777/0001-61 volta "não habilitada", para ver o aviso.
    async cadastro({ uf, doc }) {
      const { rows: [c] } = await pool.query(`SELECT razao_social, ie FROM clientes WHERE documento = $1 LIMIT 1`, [doc]).catch(() => ({ rows: [] }));
      const ie = String(c?.ie || '').replace(/\W/g, '') || '123456789';
      const baixada = doc === '11444777000161';
      const xml = `<retConsCad><infCons><cStat>111</cStat><xMotivo>Consulta cadastro com uma ocorrência (demonstração)</xMotivo><UF>${uf}</UF><infCad><IE>${ie}</IE>`
        + `${doc.length === 11 ? `<CPF>${doc}</CPF>` : `<CNPJ>${doc}</CNPJ>`}<UF>${uf}</UF><cSit>${baixada ? 0 : 1}</cSit><indCredCTe>${baixada ? 0 : 1}</indCredCTe><xNome>${c?.razao_social || 'CONTRIBUINTE DEMONSTRACAO LTDA'}</xNome>`
        + `<xRegApur>NORMAL - REGIME PERIODICO DE APURACAO</xRegApur><CNAE>4930202</CNAE><dIniAtiv>2015-03-02</dIniAtiv><dUltSit>2024-01-15</dUltSit>${baixada ? '<dBaixa>2025-06-30</dBaixa>' : ''}`
        + `<ender><xLgr>RUA DEMONSTRACAO</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><xMun>CAMPINAS</xMun><CEP>13010000</CEP></ender></infCad></infCons></retConsCad>`;
      return lerRetornoCad(xml);
    },
    gz,
  };
})();

module.exports = {
  // CT-e na SEFAZ
  consultarCtes, estadoCtes, salvarConfigCtes, lerRetornoDist, corpoDist, processarDoc, URL_DIST,
  // Cadastro de contribuinte
  consultarCadastro, lerRetornoCad, corpoCad, avisoDoCadastro, urlCadastro, SITUACOES_IE,
  // Situação
  verificarStatus, situacao, avisoHoje,
  agendar, simulador,
};
