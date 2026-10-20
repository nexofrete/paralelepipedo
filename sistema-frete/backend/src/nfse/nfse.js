// Emissão de NFS-e (Padrão Nacional) para o frete municipal: rascunho,
// numeração da DPS, assinatura, envio à Sefin Nacional, cancelamento.
const pool = require('../db');
const Doc = require('../utils/documento');
const { assinar } = require('../cte/assinatura');
const { montarDps, montarCancelamento, lerNfse, idDps, so, limpo, TRIB_NAC_PADRAO } = require('./montarNfse');
const sefin = require('./sefinNacional');

const STATUS = { rascunho: 'Rascunho', enviando: 'Enviando', autorizada: 'Autorizada', rejeitada: 'Rejeitada', erro: 'Sem resposta', cancelada: 'Cancelada' };
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const numero = (v) => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

const CONFIG_PADRAO = { cTribNac: TRIB_NAC_PADRAO, cTribMun: '', cNBS: '', aliquota: null, informar_aliquota: false, regApTribSN: '1', regEspTrib: '0', pTotTribSN: null,
  descricao_padrao: 'Serviço de transporte rodoviário de cargas dentro do município (frete municipal).' };

async function empresa() {
  const { rows } = await pool.query('SELECT * FROM empresa WHERE id = 1');
  const e = rows[0] || {};
  return { ...e, cfg: { ...CONFIG_PADRAO, ...(e.nfse_config || {}) } };
}

async function config() {
  const e = await empresa();
  return { ...e.cfg, ambiente: Number(e.nfse_ambiente) || 2, serie: Number(e.nfse_serie) || 1, proximo_dps: Number(e.nfse_proximo_dps) || 1,
    inscricao_municipal: e.inscricao_municipal || '', municipio: e.municipio || '', uf: e.uf || '', codigo_municipio: e.codigo_municipio || '',
    crt: e.crt || null, demonstracao: !!e.cte_demonstracao };
}

async function salvarConfig(b = {}) {
  const cfg = {
    cTribNac: so(b.cTribNac).slice(0, 6) || TRIB_NAC_PADRAO, cTribMun: so(b.cTribMun).slice(0, 3), cNBS: so(b.cNBS).slice(0, 9),
    aliquota: numero(b.aliquota), informar_aliquota: !!b.informar_aliquota,
    regApTribSN: ['1', '2', '3'].includes(String(b.regApTribSN)) ? String(b.regApTribSN) : '1',
    regEspTrib: ['0', '1', '2', '3', '4', '5', '6', '9'].includes(String(b.regEspTrib)) ? String(b.regEspTrib) : '0',
    pTotTribSN: numero(b.pTotTribSN), descricao_padrao: limpo(b.descricao_padrao, 2000) || CONFIG_PADRAO.descricao_padrao,
  };
  if (cfg.cTribNac.length !== 6) throw falha('Código de tributação nacional: 6 dígitos (ex.: 160201).');
  if (cfg.aliquota != null && (cfg.aliquota < 2 || cfg.aliquota > 5)) throw falha('Alíquota do ISS entre 2% e 5%.');
  const serie = Math.min(Math.max(parseInt(b.serie, 10) || 1, 1), 99999);
  const proximo = Math.max(parseInt(b.proximo_dps, 10) || 1, 1);
  const { rows: maior } = await pool.query('SELECT COALESCE(MAX(numero_dps), 0) AS n FROM nfse_emitidas WHERE serie = $1 AND ambiente = $2', [serie, Number(b.ambiente) === 1 ? 1 : 2]);
  await pool.query(`UPDATE empresa SET nfse_config = $1, nfse_ambiente = $2, nfse_serie = $3, nfse_proximo_dps = $4, inscricao_municipal = $5 WHERE id = 1`,
    [JSON.stringify(cfg), Number(b.ambiente) === 1 ? 1 : 2, serie, Math.max(proximo, Number(maior[0].n) + 1), limpo(b.inscricao_municipal, 15) || null]);
  return config();
}

// ---------- Rascunho ----------
function lerDados(b = {}, cfg = CONFIG_PADRAO) {
  const t = b.tomador || {}; const end = t.end || {}; const s = b.servico || {}; const v = b.valores || {};
  const d = {
    competencia: /^\d{4}-\d{2}-\d{2}$/.test(String(b.competencia || '')) ? b.competencia : hoje(),
    tomador: {
      doc: Doc.limpar(t.doc) || '', nome: limpo(t.nome, 200), im: limpo(t.im, 15) || null, email: limpo(t.email, 80) || null, fone: so(t.fone).slice(0, 20) || null,
      end: { cep: so(end.cep).slice(0, 8), xLgr: limpo(end.xLgr, 255), nro: limpo(end.nro, 60), xCpl: limpo(end.xCpl, 156) || null, xBairro: limpo(end.xBairro, 60),
        cMun: so(end.cMun).slice(0, 7), xMun: limpo(end.xMun, 120), uf: limpo(end.uf, 2).toUpperCase() },
    },
    servico: {
      descricao: limpo(s.descricao, 2000) || cfg.descricao_padrao, informacoes: limpo(s.informacoes, 2000) || null, docRef: limpo(s.docRef, 255) || null,
      cLocPrestacao: so(s.cLocPrestacao).slice(0, 7) || null, cTribNac: so(s.cTribNac).slice(0, 6) || null, cTribMun: so(s.cTribMun).slice(0, 3) || null,
      notas: (Array.isArray(s.notas) ? s.notas : String(s.notas || '').split(/[\s,;]+/)).map(so).filter((k) => k.length === 44).slice(0, 200),
    },
    valores: { vServ: centavos(numero(v.vServ)), descontoIncond: centavos(numero(v.descontoIncond)), issRetido: !!v.issRetido, pAliq: numero(v.pAliq) },
    cte_origem: Number(b.cte_origem) || null,
  };
  if (![11, 14].includes(d.tomador.doc.length)) throw falha('Informe o CNPJ/CPF do tomador (quem paga o frete).');
  if (!d.tomador.nome) throw falha('Informe o nome do tomador.');
  // Valor zerado pode ficar no rascunho (vindo do CT-e sem frete calculado); a transmissão exige.
  if (d.valores.vServ > 0 && d.valores.descontoIncond >= d.valores.vServ) throw falha('O desconto tem que ser menor que o valor do serviço.');
  return d;
}

function colunas(d, cfg) {
  const valor = centavos(d.valores.vServ - (d.valores.descontoIncond || 0));
  const aliq = d.valores.pAliq ?? cfg.aliquota;
  const iss = aliq ? centavos((valor * aliq) / 100) : null;
  return { valor, iss_aliquota: aliq || null, iss_valor: iss, iss_retido: d.valores.issRetido, valor_liquido: centavos(valor - (d.valores.issRetido && iss ? iss : 0)),
    tomador_doc: d.tomador.doc, tomador_nome: d.tomador.nome };
}

async function criar(b, usuarioNome) {
  const e = await empresa();
  const d = lerDados(b, e.cfg);
  const c = colunas(d, e.cfg);
  const { rows } = await pool.query(
    `INSERT INTO nfse_emitidas (ambiente, dados, valor, iss_aliquota, iss_valor, iss_retido, valor_liquido, tomador_doc, tomador_nome, coleta_id, criado_por_nome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [Number(e.nfse_ambiente) || 2, JSON.stringify(d), c.valor, c.iss_aliquota, c.iss_valor, c.iss_retido, c.valor_liquido, c.tomador_doc, c.tomador_nome,
      Number(b.coleta_id) || null, usuarioNome || null]);
  return rows[0];
}

async function alterar(id, b) {
  const e = await empresa();
  const d = lerDados(b, e.cfg);
  const c = colunas(d, e.cfg);
  const { rows } = await pool.query(
    `UPDATE nfse_emitidas SET dados = $2, valor = $3, iss_aliquota = $4, iss_valor = $5, iss_retido = $6, valor_liquido = $7, tomador_doc = $8, tomador_nome = $9,
            status = CASE WHEN status = 'rejeitada' THEN 'rascunho' ELSE status END, atualizado_em = NOW()
      WHERE id = $1 AND status IN ('rascunho', 'rejeitada') RETURNING *`,
    [id, JSON.stringify(d), c.valor, c.iss_aliquota, c.iss_valor, c.iss_retido, c.valor_liquido, c.tomador_doc, c.tomador_nome]);
  if (!rows[0]) throw falha('Só dá para alterar NFS-e em rascunho ou rejeitada.', 409);
  return rows[0];
}

async function excluir(id) {
  // Rascunho nunca transmitido; ou, na demonstração, a recusada (o número é só de teste).
  const { rowCount } = await pool.query(`DELETE FROM nfse_emitidas WHERE id = $1 AND chave IS NULL
      AND ((status = 'rascunho' AND numero_dps IS NULL) OR (demonstracao AND status IN ('rascunho', 'erro', 'rejeitada')))`, [id]);
  if (!rowCount) throw falha('Só dá para excluir rascunho que nunca foi transmitido (ou, na demonstração, a NFS-e recusada).', 409);
}

// Rascunho de NFS-e a partir do rascunho de CT-e (frete que começa e termina no mesmo município).
async function doCte(cteId, usuarioNome) {
  const { rows } = await pool.query('SELECT id, status, dados, numero FROM ctes_emitidos WHERE id = $1', [cteId]);
  const c = rows[0];
  if (!c) throw falha('CT-e não encontrado.', 404);
  if (c.status !== 'rascunho') throw falha('Só um rascunho de CT-e pode virar NFS-e.', 409);
  const d = c.dados || {};
  const papel = { 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')] || {};
  const en = papel.endereco || {};
  const e = await empresa();
  const notas = (d.nfes || []).map(so).filter((k) => k.length === 44);
  const nfs = notas.map((k) => Number(k.slice(25, 34)));
  const trajeto = [d.inicio?.xMun || d.remetente?.endereco?.xMun, d.fim?.xMun || d.destinatario?.endereco?.xMun].filter(Boolean);
  const dados = {
    tomador: { doc: papel.cnpj || papel.cpf, nome: papel.xNome, email: papel.email, fone: papel.fone,
      end: { cep: en.CEP, xLgr: en.xLgr, nro: en.nro, xCpl: en.xCpl, xBairro: en.xBairro, cMun: en.cMun, xMun: en.xMun, uf: en.UF } },
    servico: {
      descricao: `${e.cfg.descricao_padrao}${trajeto.length ? ` Coleta em ${d.remetente?.xNome || trajeto[0]} e entrega em ${d.destinatario?.xNome || trajeto[1] || trajeto[0]}.` : ''}`,
      informacoes: [nfs.length ? `NF-e transportada(s): ${nfs.join(', ')}` : '', d.observacoes].filter(Boolean).join(' · ') || null, notas,
    },
    valores: { vServ: Number(d.valores?.vTPrest) || 0 },
    cte_origem: c.id,
  };
  const coleta = d.origem?.tipo === 'coleta' ? Number(d.origem.coleta_id) || null : null;
  const n = await criar({ ...dados, coleta_id: coleta }, usuarioNome).catch((err) => { throw falha(`Não deu para montar a NFS-e a partir do CT-e: ${err.message}`); });
  return n;
}

// ---------- Transmissão ----------
async function reservarNumero(id) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [r] } = await cliente.query('SELECT numero_dps, demonstracao FROM nfse_emitidas WHERE id = $1 FOR UPDATE', [id]);
    if (!r.numero_dps) {
      const { rows: [e] } = await cliente.query('SELECT nfse_serie, nfse_proximo_dps, nfse_ambiente FROM empresa WHERE id = 1 FOR UPDATE');
      // Demonstração numera à parte (ambiente de testes), sem gastar a numeração de produção.
      const serie = Number(e.nfse_serie) || 1; const amb = r.demonstracao ? 2 : Number(e.nfse_ambiente) || 2;
      const { rows: [m] } = await cliente.query('SELECT COALESCE(MAX(numero_dps), 0) AS n FROM nfse_emitidas WHERE serie = $1 AND ambiente = $2', [serie, amb]);
      const n = r.demonstracao ? Number(m.n) + 1 : Math.max(Number(e.nfse_proximo_dps) || 1, Number(m.n) + 1);
      await cliente.query('UPDATE nfse_emitidas SET serie = $2, numero_dps = $3, ambiente = $4 WHERE id = $1', [id, serie, n, amb]);
      if (!r.demonstracao) await cliente.query('UPDATE empresa SET nfse_proximo_dps = $1 WHERE id = 1', [n + 1]);
    }
    await cliente.query('COMMIT');
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

async function certificado(e, demo) {
  const { certificadoDoEmitente } = require('../cte/certificado');
  const cert = await certificadoDoEmitente(pool);
  if (cert.demonstracao && !demo) throw falha('O certificado cadastrado é o de DEMONSTRAÇÃO. Envie o certificado A1 da empresa na Configuração fiscal, ou ligue o modo demonstração.');
  if (cert.cnpj && so(cert.cnpj).slice(0, 8) !== so(e.cnpj).slice(0, 8)) throw falha(`O certificado digital é do CNPJ ${cert.cnpj}, diferente do CNPJ da empresa.`);
  return cert;
}

async function registrarAutorizada(id, xmlDps, chave, xmlNfse) {
  const n = lerNfse(xmlNfse);
  const { rows: [r] } = await pool.query('SELECT valor, iss_retido FROM nfse_emitidas WHERE id = $1', [id]);
  const liquido = n.vLiq != null ? n.vLiq : Number(r.valor);
  await pool.query(
    `UPDATE nfse_emitidas SET status = 'autorizada', chave = $2, numero_nfse = $3, xml_dps = $4, xml_nfse = $5, iss_aliquota = COALESCE($6, iss_aliquota),
            iss_valor = COALESCE($7, iss_valor), valor_liquido = $8, erros = NULL, motivo = NULL, autorizada_em = COALESCE($9::timestamptz, NOW()), atualizado_em = NOW()
      WHERE id = $1`,
    // A chave do XML da NFS-e (assinado pelo Sistema Nacional) vale mais que a do JSON da resposta.
    [id, sefin.chaveOk(n.chave) || sefin.chaveOk(chave), n.numero, xmlDps, xmlNfse, n.pAliq, n.vISS, liquido, n.dhProc]);
  // O rascunho de CT-e que originou a NFS-e não serve mais (frete municipal não tem CT-e).
  const { rows: [x] } = await pool.query('SELECT dados FROM nfse_emitidas WHERE id = $1', [id]);
  const cteId = Number(x?.dados?.cte_origem) || null;
  if (cteId) {
    await pool.query(`UPDATE coletas SET cte_id = NULL WHERE cte_id = $1`, [cteId]).catch(() => {});
    await pool.query(`DELETE FROM ctes_emitidos WHERE id = $1 AND status = 'rascunho' AND chave IS NULL`, [cteId]).catch(() => {});
  }
}

async function transmitir(id) {
  let reg = await carregar(id);
  if (!reg) throw falha('NFS-e não encontrada.', 404);
  if (['autorizada', 'cancelada'].includes(reg.status)) throw falha(`Essa NFS-e já está ${reg.status}.`, 409);
  const e = await empresa();
  require('../licenca').conferirEmpresa(e.cnpj);
  const demo = reg.demonstracao || (!reg.numero_dps && !!e.cte_demonstracao);
  if (!demo && reg.demonstracao) throw falha('Essa NFS-e foi feita no modo demonstração.');
  if (demo && !reg.demonstracao) await pool.query('UPDATE nfse_emitidas SET demonstracao = TRUE WHERE id = $1', [id]);
  const cert = await certificado(e, demo);
  const opcoes = { cert, verificarServidor: !!e.cte_verificar_servidor, simulado: demo ? { aliquota: e.cfg.aliquota, municipio: e.municipio } : null };

  // Tentativa anterior sem resposta: a DPS pode ter virado NFS-e.
  if (['enviando', 'erro'].includes(reg.status) && reg.id_dps && reg.xml_dps) {
    const chave = await sefin.consultarDps({ ...opcoes, tpAmb: reg.ambiente, idDps: reg.id_dps }).catch(() => null);
    if (chave) {
      const xml = await sefin.baixarNfse({ ...opcoes, tpAmb: reg.ambiente, chave });
      if (xml) { await registrarAutorizada(id, reg.xml_dps, chave, xml); return carregar(id); }
    }
  }

  // Confere os dados antes de gastar um número de DPS.
  montarDps(reg.dados, e, e.cfg, { serie: reg.serie || 1, numero: reg.numero_dps || 1, tpAmb: reg.ambiente });
  await reservarNumero(id);
  reg = await carregar(id);
  if (!demo && Number(reg.ambiente) !== (Number(e.nfse_ambiente) || 2)) throw falha('O ambiente da NFS-e mudou depois que ela recebeu número. Faça uma nova.');
  const { xml, id: idd } = montarDps(reg.dados, e, e.cfg, { serie: reg.serie, numero: reg.numero_dps, tpAmb: reg.ambiente });
  const assinado = assinar(xml, 'infDPS', cert, { algoritmo: 'sha256' });
  await pool.query(`UPDATE nfse_emitidas SET status = 'enviando', id_dps = $2, xml_dps = $3, erros = NULL, motivo = NULL, atualizado_em = NOW() WHERE id = $1`, [id, idd, assinado]);
  let r;
  try {
    r = await sefin.enviarDps({ ...opcoes, tpAmb: reg.ambiente, xmlAssinado: assinado });
  } catch (err) {
    await pool.query(`UPDATE nfse_emitidas SET status = 'erro', motivo = $2, atualizado_em = NOW() WHERE id = $1`, [id, err.message]);
    throw err;
  }
  if (r.ok) {
    await registrarAutorizada(id, assinado, r.chave, r.xmlNfse);
  } else {
    // Duplicidade (resposta anterior perdida): busca a NFS-e que já existe.
    const dup = r.erros.some((x) => /duplic|já convertida|ja convertida/i.test(`${x.descricao}`));
    const chave = dup ? await sefin.consultarDps({ ...opcoes, tpAmb: reg.ambiente, idDps: idd }).catch(() => null) : null;
    const xmlN = chave ? await sefin.baixarNfse({ ...opcoes, tpAmb: reg.ambiente, chave }).catch(() => null) : null;
    if (xmlN) await registrarAutorizada(id, assinado, chave, xmlN);
    else {
      await pool.query(`UPDATE nfse_emitidas SET status = 'rejeitada', erros = $2, motivo = $3, atualizado_em = NOW() WHERE id = $1`,
        [id, JSON.stringify(r.erros), r.erros.map((x) => `${x.codigo} ${x.descricao}${x.complemento ? ` (${x.complemento})` : ''}`).join(' · ').slice(0, 2000)]);
    }
  }
  return carregar(id);
}

const MOTIVOS = { 1: 'Erro na emissão', 2: 'Serviço não prestado', 9: 'Outros' };
async function cancelar(id, { cMotivo, xMotivo }) {
  const reg = await carregar(id);
  if (!reg) throw falha('NFS-e não encontrada.', 404);
  if (reg.status !== 'autorizada') throw falha('Só NFS-e autorizada pode ser cancelada.', 409);
  if (reg.fatura_id) {
    const { rows } = await pool.query('SELECT numero, status FROM faturas_transporte WHERE id = $1', [reg.fatura_id]);
    if (rows[0] && rows[0].status !== 'cancelada') throw falha(`Essa NFS-e está na fatura ${rows[0].numero}. Cancele a fatura antes.`, 409);
  }
  const e = await empresa();
  const cert = await certificado(e, reg.demonstracao);
  const { xml } = montarCancelamento({ chave: reg.chave, cnpj: e.cnpj, tpAmb: reg.ambiente, cMotivo, xMotivo });
  const assinado = assinar(xml, 'infPedReg', cert, { algoritmo: 'sha256' });
  const r = await sefin.enviarEvento({ tpAmb: reg.ambiente, cert, chave: reg.chave, xmlAssinado: assinado, verificarServidor: !!e.cte_verificar_servidor, simulado: reg.demonstracao ? {} : null });
  if (!r.ok) throw falha(`Cancelamento recusado: ${r.erros.map((x) => `${x.codigo} ${x.descricao}`).join(' · ')}`, 422);
  await pool.query(`UPDATE nfse_emitidas SET status = 'cancelada', cancelada_em = NOW(), xml_cancelamento = $2, motivo = $3, fatura_id = NULL, atualizado_em = NOW() WHERE id = $1`,
    [id, r.xmlEvento, `${MOTIVOS[cMotivo] || 'Outros'}: ${limpo(xMotivo, 255)}`]);
  return carregar(id);
}

async function carregar(id) {
  const { rows } = await pool.query('SELECT n.*, f.numero AS fatura_numero FROM nfse_emitidas n LEFT JOIN faturas_transporte f ON f.id = n.fatura_id WHERE n.id = $1', [id]);
  return rows[0] || null;
}

const FILTROS = {
  abertas: `n.status IN ('rascunho', 'rejeitada', 'erro', 'enviando')`, autorizadas: `n.status = 'autorizada'`, canceladas: `n.status = 'cancelada'`, todas: 'TRUE',
};
async function listar({ filtro = 'todas', busca = '', de, ate } = {}) {
  const f = FILTROS[filtro] ? filtro : 'todas';
  const val = []; const onde = [FILTROS[f]];
  if (/^\d{4}-\d{2}-\d{2}$/.test(de || '')) { val.push(de); onde.push(`COALESCE(n.autorizada_em, n.criado_em) >= $${val.length}::date`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(ate || '')) { val.push(ate); onde.push(`COALESCE(n.autorizada_em, n.criado_em) < $${val.length}::date + 1`); }
  const b = String(busca || '').trim();
  if (b) { val.push(`%${b}%`, so(b) || '__nada__'); onde.push(`(n.tomador_nome ILIKE $${val.length - 1} OR n.tomador_doc LIKE $${val.length} || '%' OR n.numero_nfse::text = $${val.length} OR n.chave = $${val.length})`); }
  const { rows } = await pool.query(
    `SELECT n.id, n.ambiente, n.serie, n.numero_dps, n.numero_nfse, n.chave, n.status, n.valor, n.iss_aliquota, n.iss_valor, n.iss_retido, n.valor_liquido, n.tomador_doc,
            n.tomador_nome, n.motivo, n.autorizada_em, n.cancelada_em, n.demonstracao, n.fatura_id, f.numero AS fatura_numero, n.criado_em, n.criado_por_nome
       FROM nfse_emitidas n LEFT JOIN faturas_transporte f ON f.id = n.fatura_id WHERE ${onde.join(' AND ')}
      ORDER BY (n.status IN ('rascunho', 'rejeitada', 'erro', 'enviando')) DESC, COALESCE(n.autorizada_em, n.criado_em) DESC LIMIT 500`, val);
  const { rows: [r] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'autorizada' AND autorizada_em >= date_trunc('month', NOW()))::int AS mes_qtd,
            COALESCE(SUM(valor) FILTER (WHERE status = 'autorizada' AND autorizada_em >= date_trunc('month', NOW())), 0)::float AS mes_valor,
            COALESCE(SUM(iss_valor) FILTER (WHERE status = 'autorizada' AND autorizada_em >= date_trunc('month', NOW()) AND NOT iss_retido), 0)::float AS mes_iss_recolher,
            COALESCE(SUM(iss_valor) FILTER (WHERE status = 'autorizada' AND autorizada_em >= date_trunc('month', NOW()) AND iss_retido), 0)::float AS mes_iss_retido,
            COUNT(*) FILTER (WHERE status IN ('rascunho', 'rejeitada', 'erro', 'enviando'))::int AS pendentes
       FROM nfse_emitidas`);
  return { notas: rows, resumo: r };
}

module.exports = { STATUS, CONFIG_PADRAO, config, salvarConfig, lerDados, criar, alterar, excluir, doCte, transmitir, cancelar, carregar, listar, empresa, idDps };
