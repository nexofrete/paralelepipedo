// Regras da emissão do MDF-e: monta a partir dos CT-e (ou do romaneio),
// reserva o número, assina, transmite e cuida dos eventos (cancelamento,
// encerramento e inclusão de motorista). Usa o mesmo certificado, a mesma
// configuração fiscal e o mesmo modo demonstração do CT-e.
const pool = require('../db');
const { assinar } = require('../cte/assinatura');
const { CODIGO_UF } = require('../cte/ufs');
const { carregarEmitente, emitenteDoCadastro, certificadoParaUsar } = require('../cte/emissao');
const { soDigitos } = require('../cte/montarCte');
const m = require('./montarMdfe');
const sefaz = require('./sefazMdfe');

const DUPLICIDADE = ['204', '539'];

// Fronteiras entre UFs (para sugerir o percurso; o usuário pode mudar).
const VIZINHOS = {
  AC: ['AM', 'RO'], AL: ['PE', 'SE', 'BA'], AP: ['PA'], AM: ['AC', 'RO', 'MT', 'PA', 'RR'], BA: ['SE', 'AL', 'PE', 'PI', 'TO', 'GO', 'MG', 'ES'],
  CE: ['RN', 'PB', 'PE', 'PI'], DF: ['GO', 'MG'], ES: ['BA', 'MG', 'RJ'], GO: ['TO', 'BA', 'MG', 'MS', 'MT', 'DF'], MA: ['PI', 'TO', 'PA'],
  MT: ['RO', 'AM', 'PA', 'TO', 'GO', 'MS'], MS: ['MT', 'GO', 'MG', 'SP', 'PR'], MG: ['BA', 'ES', 'RJ', 'SP', 'GO', 'MS', 'DF'],
  PA: ['AP', 'AM', 'RR', 'MT', 'TO', 'MA'], PB: ['RN', 'CE', 'PE'], PR: ['SP', 'MS', 'SC'], PE: ['PB', 'CE', 'PI', 'BA', 'AL'],
  PI: ['MA', 'CE', 'PE', 'BA', 'TO'], RJ: ['ES', 'MG', 'SP'], RN: ['CE', 'PB'], RS: ['SC'], RO: ['AC', 'AM', 'MT'], RR: ['AM', 'PA'],
  SC: ['PR', 'RS'], SP: ['MG', 'RJ', 'PR', 'MS'], SE: ['AL', 'BA'], TO: ['MA', 'PI', 'BA', 'GO', 'MT', 'PA'],
};
// UFs no caminho (sem a de início e a de fim), pelo menor número de divisas.
function percursoSugerido(ini, fim) {
  if (!VIZINHOS[ini] || !VIZINHOS[fim] || ini === fim) return [];
  const anterior = { [ini]: null }; const fila = [ini];
  while (fila.length) {
    const u = fila.shift();
    if (u === fim) break;
    for (const v of VIZINHOS[u]) if (!(v in anterior)) { anterior[v] = u; fila.push(v); }
  }
  const caminho = []; for (let u = anterior[fim]; u && u !== ini; u = anterior[u]) caminho.unshift(u);
  return caminho;
}

// ---------- Rascunhos a partir dos CT-e ----------
const pesoKg = (d) => (d.carga?.quantidades || []).filter((q) => /PESO/i.test(q.tpMed || '') || ['01', '02'].includes(String(q.cUnid).padStart(2, '0')))
  .reduce((s, q) => s + (Number(q.qCarga) || 0) * (String(q.cUnid).padStart(2, '0') === '02' ? 1000 : 1), 0);

async function veiculoDoCadastro(placa) {
  const p = String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!p) return { placa: '' };
  const { rows } = await pool.query('SELECT * FROM veiculos WHERE placa = $1', [p]);
  const v = rows[0];
  return v ? { placa: v.placa, renavam: v.renavam, tara: v.tara, capKG: v.cap_kg, capM3: v.cap_m3, tpRod: v.tp_rod, tpCar: v.tp_car, uf: v.uf, prop: v.proprietario || null }
    : { placa: p };
}
async function motoristaDoCadastro({ cpf, nome }) {
  const c = soDigitos(cpf);
  const { rows } = c.length === 11
    ? await pool.query('SELECT nome, cpf FROM motoristas WHERE cpf = $1', [c])
    : await pool.query('SELECT nome, cpf FROM motoristas WHERE UPPER(nome) = UPPER($1) AND ativo LIMIT 1', [String(nome || '').trim()]);
  return rows[0] ? { xNome: rows[0].nome, cpf: rows[0].cpf } : (nome ? { xNome: nome, cpf: c } : null);
}

// Um MDF-e por UF de descarregamento (regra da SEFAZ). Devolve [dados...].
async function dadosDosCtes(cteIds, { romaneio } = {}) {
  const { rows } = await pool.query(`SELECT id, numero, chave, dados FROM ctes_emitidos WHERE id = ANY($1::int[]) AND status = 'autorizado' ORDER BY numero`, [cteIds]);
  if (!rows.length) throw new Error('Escolha CT-e autorizados.');
  const e = await carregarEmitente();
  const porUf = new Map();
  rows.forEach((c) => { const uf = c.dados?.fim?.UF; if (!porUf.has(uf)) porUf.set(uf, []); porUf.get(uf).push(c); });
  const veiculo = await veiculoDoCadastro(romaneio?.placa);
  const condutor = romaneio ? await motoristaDoCadastro({ cpf: romaneio.motorista_documento, nome: romaneio.motorista_nome }) : null;
  return [...porUf.entries()].map(([ufFim, ctes]) => {
    const carregamento = []; const descargas = new Map(); const produtos = {};
    ctes.forEach((c) => {
      const d = c.dados || {};
      if (d.inicio?.cMun && !carregamento.some((x) => x.cMun === d.inicio.cMun)) carregamento.push({ cMun: d.inicio.cMun, xMun: d.inicio.xMun, UF: d.inicio.UF });
      const k = d.fim?.cMun;
      if (!descargas.has(k)) descargas.set(k, { cMun: k, xMun: d.fim?.xMun, ctes: [] });
      descargas.get(k).ctes.push(c.chave);
      const pr = d.carga?.proPred || 'DIVERSOS'; produtos[pr] = (produtos[pr] || 0) + 1;
    });
    const ufIni = carregamento[0]?.UF || e.uf;
    return {
      tpEmit: 1, ufIni, ufFim, percurso: percursoSugerido(ufIni, ufFim),
      carregamento: carregamento.filter((x) => x.UF === ufIni).map(({ cMun, xMun }) => ({ cMun, xMun })),
      descargas: [...descargas.values()],
      veiculo: { tpRod: '01', tpCar: '02', uf: e.uf, ...veiculo }, reboques: [], condutores: condutor ? [condutor] : [],
      ciot: [], valePedagio: [], contratantes: [],
      seguros: [{ respSeg: '1', xSeg: '', cnpjSeg: '', nApol: '', nAver: [] }],
      prodPred: { tpCarga: '05', xProd: Object.entries(produtos).sort((a, b) => b[1] - a[1])[0][0] },
      tot: { vCarga: Math.round(ctes.reduce((s, c) => s + (Number(c.dados?.carga?.vCarga) || 0), 0) * 100) / 100, cUnid: '01',
        qCarga: Math.round(ctes.reduce((s, c) => s + pesoKg(c.dados || {}), 0) * 10000) / 10000 },
      lacres: [], infCpl: romaneio ? `Romaneio ${romaneio.id}` : '',
      cteIds: ctes.map((c) => c.id),
    };
  });
}

// Colunas de resumo para a lista.
function resumo(d) {
  return { placa: String(d.veiculo?.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null, uf_ini: d.ufIni || null, uf_fim: d.ufFim || null,
    qtd_documentos: (d.descargas || []).reduce((s, x) => s + (x.ctes || []).length + (x.nfes || []).length, 0), valor_carga: Number(d.tot?.vCarga) || null };
}

// ---------- Transmissão ----------
function dadosParaXml(reg, e) {
  return {
    ...reg.dados, ambiente: reg.ambiente, serie: reg.serie, numero: reg.numero, cMDF: reg.codigo_numerico,
    emitente: { ...emitenteDoCadastro(e), email: e.email },
    respTec: e.resp_tec_cnpj ? { cnpj: e.resp_tec_cnpj, xContato: e.resp_tec_contato, email: e.resp_tec_email, fone: e.resp_tec_fone } : null,
  };
}

async function reservarNumero(id) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT numero, serie FROM mdfes WHERE id = $1 FOR UPDATE', [id]);
    if (rows[0]?.numero) { await cliente.query('COMMIT'); return; }
    const { rows: emp } = await cliente.query('SELECT mdfe_serie, mdfe_proximo_numero, cte_ambiente FROM empresa WHERE id = 1 FOR UPDATE');
    const serie = Number(emp[0].mdfe_serie) || 1; const ambiente = emp[0].cte_ambiente;
    const { rows: maior } = await cliente.query('SELECT COALESCE(MAX(numero), 0) AS n FROM mdfes WHERE serie = $1 AND ambiente = $2', [serie, ambiente]);
    const numero = Math.max(Number(emp[0].mdfe_proximo_numero) || 1, Number(maior[0].n) + 1);
    const cMDF = String(require('crypto').randomInt(0, 100000000)).padStart(8, '0');
    await cliente.query('UPDATE mdfes SET serie = $2, numero = $3, ambiente = $4, codigo_numerico = $5 WHERE id = $1', [id, serie, numero, ambiente, cMDF]);
    await cliente.query('UPDATE empresa SET mdfe_proximo_numero = $1 WHERE id = 1', [numero + 1]);
    await cliente.query('COMMIT');
  } catch (err) { await cliente.query('ROLLBACK').catch(() => {}); throw err; } finally { cliente.release(); }
}

const carregar = async (id) => (await pool.query('SELECT * FROM mdfes WHERE id = $1', [id])).rows[0] || null;
const mdfeProc = (xml, prot) => `<mdfeProc xmlns="${m.NS}" versao="${m.VERSAO}">${xml.replace(/^<\?xml[^>]*\?>/, '')}${prot}</mdfeProc>`;
async function registrarAutorizado(id, xml, r) {
  await pool.query(`UPDATE mdfes SET status = 'autorizado', xml_autorizado = $2, protocolo = $3, autorizado_em = COALESCE($4::timestamptz, NOW()), cstat = $5, motivo = $6, atualizado_em = NOW() WHERE id = $1`,
    [id, mdfeProc(xml, r.protMDFe), r.nProt, r.dhRecbto || null, r.cStat, r.xMotivo]);
}
const simulacao = (reg) => (reg.demonstracao ? { conhecido: reg.chave && reg.protocolo
  ? { chave: reg.chave, nProt: reg.protocolo, encerrado: reg.status === 'encerrado', cancelado: reg.status === 'cancelado', placa: reg.placa } : null } : null);

async function transmitir(id) {
  let reg = await carregar(id);
  if (!reg) throw new Error('MDF-e não encontrado.');
  if (['autorizado', 'encerrado', 'cancelado'].includes(reg.status)) throw new Error(`Esse MDF-e já está ${reg.status}.`);
  const e = await carregarEmitente();
  const demo = reg.demonstracao || (!reg.chave && !!e.cte_demonstracao);
  if (demo && !reg.demonstracao) await pool.query('UPDATE mdfes SET demonstracao = TRUE WHERE id = $1', [id]);
  if (!demo && reg.demonstracao) throw new Error('Esse MDF-e foi feito no modo demonstração. Monte outro para emitir de verdade.');
  const cert = await certificadoParaUsar(e, demo);
  const opcoes = { ufEmit: e.uf, cert, verificarServidor: e.cte_verificar_servidor, simulado: demo ? { conhecido: null } : null };

  // Tentativa anterior sem resposta: consulta antes de reenviar.
  if (['enviando', 'erro'].includes(reg.status) && reg.chave && reg.xml_assinado) {
    const c = await sefaz.consultar({ ...opcoes, tpAmb: reg.ambiente, chave: reg.chave }).catch(() => null);
    if (c && ['100', '132'].includes(c.cStat) && c.protMDFe) { await registrarAutorizado(id, reg.xml_assinado, { ...c, cStat: '100', xMotivo: 'Autorizado o uso do MDF-e (confirmado pela consulta)' }); return carregar(id); }
  }
  await reservarNumero(id);
  reg = await carregar(id);
  if (Number(reg.ambiente) !== Number(e.cte_ambiente)) throw new Error('O ambiente (homologação/produção) mudou depois que esse MDF-e recebeu número. Monte outro.');
  const { xml, chave, tpAmb } = m.montarMdfe(dadosParaXml(reg, e));
  const assinado = m.incluirQrCode(assinar(xml, 'infMDFe', cert), chave, tpAmb);
  await pool.query(`UPDATE mdfes SET status = 'enviando', chave = $2, xml_assinado = $3, cstat = NULL, motivo = NULL, atualizado_em = NOW() WHERE id = $1`, [id, chave, assinado]);
  let r;
  try { r = await sefaz.autorizar({ ...opcoes, tpAmb, xmlAssinado: assinado }); } catch (err) {
    await pool.query(`UPDATE mdfes SET status = 'erro', motivo = $2, atualizado_em = NOW() WHERE id = $1`, [id, err.message]);
    throw err;
  }
  if (r.cStat === '100' && r.protMDFe) await registrarAutorizado(id, assinado, r);
  else if (DUPLICIDADE.includes(r.cStat)) {
    const c = await sefaz.consultar({ ...opcoes, tpAmb, chave });
    if (c.protMDFe && ['100', '132'].includes(c.cStat)) await registrarAutorizado(id, assinado, { ...c, cStat: '100' });
    else await pool.query(`UPDATE mdfes SET status = 'rejeitado', cstat = $2, motivo = $3, atualizado_em = NOW() WHERE id = $1`, [id, r.cStat, r.xMotivo]);
  } else {
    await pool.query(`UPDATE mdfes SET status = 'rejeitado', cstat = $2, motivo = $3, atualizado_em = NOW() WHERE id = $1`, [id, r.cStat, r.xMotivo]);
  }
  return carregar(id);
}

async function consultar(id) {
  const reg = await carregar(id);
  if (!reg?.chave) throw new Error('Esse MDF-e ainda não foi transmitido.');
  const e = await carregarEmitente();
  const cert = await certificadoParaUsar(e, reg.demonstracao);
  const c = await sefaz.consultar({ ufEmit: e.uf, cert, verificarServidor: e.cte_verificar_servidor, tpAmb: reg.ambiente, chave: reg.chave, simulado: simulacao(reg) });
  if (['100', '132'].includes(c.cStat) && c.protMDFe && !['autorizado', 'encerrado', 'cancelado'].includes(reg.status) && reg.xml_assinado) await registrarAutorizado(id, reg.xml_assinado, { ...c, cStat: '100' });
  if (c.cStat === '132' && reg.status !== 'encerrado') await pool.query(`UPDATE mdfes SET status = 'encerrado', encerrado_em = COALESCE(encerrado_em, NOW()) WHERE id = $1`, [id]);
  if (c.cStat === '101' && reg.status !== 'cancelado') await pool.query(`UPDATE mdfes SET status = 'cancelado' WHERE id = $1`, [id]);
  return { consulta: { cStat: c.cStat, xMotivo: c.xMotivo, nProt: c.nProt }, mdfe: await carregar(id) };
}

async function enviarEvento(reg, montar, tipo) {
  const e = await carregarEmitente();
  const cert = await certificadoParaUsar(e, reg.demonstracao);
  const xml = montar({ chave: reg.chave, cnpj: e.cnpj, ufEmit: e.uf, tpAmb: reg.ambiente, nProt: reg.protocolo });
  const assinado = assinar(xml, 'infEvento', cert);
  const r = await sefaz.enviarEvento({ ufEmit: e.uf, cert, verificarServidor: e.cte_verificar_servidor, tpAmb: reg.ambiente, xmlEventoAssinado: assinado, simulado: simulacao(reg) });
  const ok = ['134', '135', '136'].includes(r.cStat);
  const evento = { tipo, cStat: r.cStat, xMotivo: r.xMotivo, protocolo: r.nProt, em: r.dhRegEvento || new Date().toISOString(), ok,
    xml: ok ? `<procEventoMDFe xmlns="${m.NS}" versao="${m.VERSAO}">${assinado}${r.retorno}</procEventoMDFe>` : null };
  await pool.query('UPDATE mdfes SET eventos = eventos || $2::jsonb, atualizado_em = NOW() WHERE id = $1', [reg.id, JSON.stringify([evento])]);
  if (!ok) throw new Error(`A SEFAZ rejeitou o evento: ${r.cStat} - ${r.xMotivo}`);
  return evento;
}

async function cancelar(id, justificativa) {
  const reg = await carregar(id);
  if (reg?.status !== 'autorizado') throw new Error('Só dá para cancelar MDF-e autorizado e ainda não encerrado.');
  const ev = await enviarEvento(reg, (b) => m.cancelamento({ ...b, justificativa }), 'cancelamento');
  await pool.query(`UPDATE mdfes SET status = 'cancelado', motivo = $2, atualizado_em = NOW() WHERE id = $1`, [id, `Cancelado: ${justificativa}`]);
  return ev;
}

// Encerramento: padrão = hoje, no último município de descarregamento.
async function encerrar(id, { dtEnc, cMun, uf } = {}) {
  const reg = await carregar(id);
  if (reg?.status !== 'autorizado') throw new Error('Só dá para encerrar MDF-e autorizado.');
  const ultima = (reg.dados?.descargas || []).slice(-1)[0] || {};
  const dt = dtEnc || new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const mun = soDigitos(cMun || ultima.cMun);
  const ufEnc = String(uf || reg.dados?.ufFim || '').toUpperCase();
  if (!CODIGO_UF[ufEnc] || mun.length !== 7 || String(CODIGO_UF[ufEnc]) !== mun.slice(0, 2)) throw new Error('O município de encerramento não é da UF informada.');
  const ev = await enviarEvento(reg, (b) => m.encerramento({ ...b, dtEnc: dt, ufEnc, cMun: mun }), 'encerramento');
  await pool.query(`UPDATE mdfes SET status = 'encerrado', encerrado_em = NOW(), atualizado_em = NOW() WHERE id = $1`, [id]);
  return ev;
}

async function incluirCondutor(id, { xNome, cpf }) {
  const reg = await carregar(id);
  if (reg?.status !== 'autorizado') throw new Error('Só dá para incluir motorista em MDF-e autorizado e não encerrado.');
  const nSeq = Number(reg.seq_condutor || 1);
  const ev = await enviarEvento(reg, (b) => m.inclusaoCondutor({ ...b, nSeq, xNome, cpf }), 'inclusao_condutor');
  await pool.query(`UPDATE mdfes SET seq_condutor = $2, dados = jsonb_set(dados, '{condutores}', COALESCE(dados->'condutores', '[]'::jsonb) || $3::jsonb) WHERE id = $1`,
    [id, nSeq + 1, JSON.stringify([{ xNome, cpf: soDigitos(cpf) }])]);
  return ev;
}

async function naoEncerrados() {
  const e = await carregarEmitente();
  const cert = await certificadoParaUsar(e);
  return sefaz.naoEncerrados({ ufEmit: e.uf, tpAmb: e.cte_ambiente, cert, cnpj: e.cnpj, verificarServidor: e.cte_verificar_servidor, simulado: e.cte_demonstracao ? {} : null });
}

async function testarConexao() {
  const e = await carregarEmitente();
  const cert = await certificadoParaUsar(e);
  return sefaz.statusServico({ ufEmit: e.uf, tpAmb: e.cte_ambiente, cert, verificarServidor: e.cte_verificar_servidor, simulado: e.cte_demonstracao ? {} : null });
}

module.exports = { dadosDosCtes, percursoSugerido, resumo, transmitir, consultar, cancelar, encerrar, incluirCondutor, naoEncerrados, testarConexao, carregar, dadosParaXml };
