// Regras da emissão de CT-e: junta os dados da tela com o cadastro fiscal do
// emitente, reserva o número, assina, transmite e guarda o resultado.
const pool = require('../db');
const { montarCte, incluirQrCode, NS, VERSAO, soDigitos } = require('./montarCte');
const { assinar } = require('./assinatura');
const { certificadoDoEmitente } = require('./certificado');
const { webservicesDaUf } = require('./ufs');
const sefaz = require('./sefaz');
const eventos = require('./eventos');

// Rejeições em que a SEFAZ diz que esse CT-e (chave) já existe autorizado.
const DUPLICIDADE = ['204', '539'];

async function carregarEmitente() {
  const { rows } = await pool.query('SELECT * FROM empresa WHERE id = 1');
  const e = rows[0];
  if (!e?.cnpj || !e?.razao_social) throw new Error('Preencha os dados da empresa em Emissão de CT-e → Configuração fiscal.');
  if (!e.uf || !e.codigo_municipio) throw new Error('Informe a UF e o código IBGE do município da empresa na Configuração fiscal.');
  return e;
}

function emitenteDoCadastro(e) {
  return {
    cnpj: e.cnpj, ie: e.ie, xNome: e.razao_social, xFant: e.nome_fantasia, crt: e.crt, rntrc: e.rntrc, fone: e.telefone,
    endereco: { xLgr: e.endereco, nro: e.numero, xCpl: e.complemento, xBairro: e.bairro, cMun: e.codigo_municipio, xMun: e.municipio, CEP: e.cep, UF: e.uf, fone: e.telefone },
  };
}

// Dados completos para montar o XML (o que veio da tela + o cadastro fiscal).
function dadosParaXml(registro, e) {
  const d = registro.dados || {};
  return {
    ...d,
    ambiente: registro.ambiente, serie: registro.serie, numero: registro.numero, cCT: registro.codigo_numerico,
    emitente: emitenteDoCadastro(e),
    respTec: e.resp_tec_cnpj ? { cnpj: e.resp_tec_cnpj, xContato: e.resp_tec_contato, email: e.resp_tec_email, fone: e.resp_tec_fone } : null,
  };
}

// Colunas de resumo (lista da tela) tiradas dos dados.
function resumo(d) {
  const toma = { 0: d.remetente, 1: d.expedidor, 2: d.recebedor, 3: d.destinatario, 4: d.outroTomador }[String(d.tomador ?? '0')];
  return {
    valor_total: Number(d.valores?.vTPrest) || null,
    tomador_nome: toma?.xNome || null, remetente_nome: d.remetente?.xNome || null, destinatario_nome: d.destinatario?.xNome || null,
    cidade_fim: d.fim?.xMun || null, uf_fim: d.fim?.UF || null,
  };
}

// Reserva série/número (uma vez por CT-e) sem repetir, mesmo com duas pessoas transmitindo juntas.
async function reservarNumero(id) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: atual } = await cliente.query('SELECT numero FROM ctes_emitidos WHERE id = $1 FOR UPDATE', [id]);
    if (atual[0]?.numero) { await cliente.query('COMMIT'); return; }
    const { rows: emp } = await cliente.query('SELECT cte_serie, cte_proximo_numero, cte_ambiente FROM empresa WHERE id = 1 FOR UPDATE');
    const serie = emp[0].cte_serie;
    const ambiente = emp[0].cte_ambiente;
    // Pula número já usado (ex.: próximo número configurado para trás por engano).
    const { rows: maior } = await cliente.query('SELECT COALESCE(MAX(numero), 0) AS n FROM ctes_emitidos WHERE serie = $1 AND ambiente = $2', [serie, ambiente]);
    const numero = Math.max(Number(emp[0].cte_proximo_numero) || 1, Number(maior[0].n) + 1);
    const cCT = String(require('crypto').randomInt(0, 100000000)).padStart(8, '0');
    await cliente.query('UPDATE ctes_emitidos SET serie = $2, numero = $3, ambiente = $4, codigo_numerico = $5 WHERE id = $1', [id, serie, numero, ambiente, cCT]);
    await cliente.query('UPDATE empresa SET cte_proximo_numero = $1 WHERE id = 1', [numero + 1]);
    await cliente.query('COMMIT');
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

const cteProc = (xmlAssinado, protCTe) => `<?xml version="1.0" encoding="UTF-8"?><cteProc xmlns="${NS}" versao="${VERSAO}">${xmlAssinado.replace(/^<\?xml[^>]*\?>/, '')}${protCTe}</cteProc>`;

async function registrarAutorizado(id, xmlAssinado, r) {
  await pool.query(
    `UPDATE ctes_emitidos SET status = 'autorizado', xml_autorizado = $2, protocolo = $3, autorizado_em = COALESCE($4::timestamptz, NOW()),
            cstat = $5, motivo = $6, atualizado_em = NOW() WHERE id = $1`,
    [id, cteProc(xmlAssinado, r.protCTe), r.nProt, r.dhRecbto || null, r.cStat, r.xMotivo]);
  // Previsão de entrega (prazo da tabela ou o padrão), para o acompanhamento das entregas.
  await require('./ocorrencias').definirPrevisao(id).catch((e) => console.error('[cte] previsão de entrega:', e.message));
}

// Transmite o CT-e. Se uma tentativa anterior ficou sem resposta, consulta a
// chave antes de reenviar (a SEFAZ pode ter autorizado e a resposta se perdido).
async function transmitir(id) {
  const { rows } = await pool.query('SELECT * FROM ctes_emitidos WHERE id = $1', [id]);
  let reg = rows[0];
  if (!reg) throw new Error('CT-e não encontrado.');
  if (['autorizado', 'cancelado'].includes(reg.status)) throw new Error(`Esse CT-e já está ${reg.status}.`);
  const e = await carregarEmitente();
  const cert = await certificadoParaUsar(e);
  // Demonstração: o que for transmitido agora fica marcado e nunca vai à SEFAZ.
  const demo = reg.demonstracao || (!reg.chave && !!e.cte_demonstracao);
  if (demo && !reg.demonstracao) await pool.query('UPDATE ctes_emitidos SET demonstracao = TRUE WHERE id = $1', [id]);
  if (!demo && reg.demonstracao) throw new Error('Esse CT-e foi feito no modo demonstração. Duplique para emitir de verdade.');
  const opcoes = { uf: e.uf, cert, verificarServidor: e.cte_verificar_servidor, simulado: demo ? { conhecido: null } : null };

  if (reg.status === 'enviando' || reg.status === 'erro') {
    if (reg.chave && reg.xml_assinado) {
      const c = await sefaz.consultar({ ...opcoes, tpAmb: reg.ambiente, chave: reg.chave }).catch(() => null);
      if (c && (c.cStat === '100' || c.cStat === '150') && c.protCTe) {
        await registrarAutorizado(id, reg.xml_assinado, { ...c, cStat: '100', xMotivo: 'Autorizado o uso do CT-e (confirmado pela consulta)' });
        return carregar(id);
      }
    }
  }

  await reservarNumero(id);
  reg = (await pool.query('SELECT * FROM ctes_emitidos WHERE id = $1', [id])).rows[0];
  if (Number(reg.ambiente) !== Number(e.cte_ambiente)) {
    throw new Error('O ambiente (homologação/produção) mudou depois que esse CT-e recebeu número. Duplique o CT-e para emitir no ambiente atual.');
  }
  const certCnpj = soDigitos(cert.cnpj);
  if (certCnpj && certCnpj.slice(0, 8) !== soDigitos(e.cnpj).slice(0, 8)) {
    throw new Error(`O certificado digital é do CNPJ ${cert.cnpj}, diferente do CNPJ da empresa (${e.cnpj}).`);
  }

  const { xml, chave, tpAmb } = montarCte(dadosParaXml(reg, e));
  const ws = webservicesDaUf(e.uf, tpAmb);
  const assinado = incluirQrCode(assinar(xml, 'infCte', cert), ws.qrCode, chave, tpAmb);
  await pool.query(`UPDATE ctes_emitidos SET status = 'enviando', chave = $2, xml_assinado = $3, cstat = NULL, motivo = NULL, atualizado_em = NOW() WHERE id = $1`,
    [id, chave, assinado]);

  let r;
  try {
    r = await sefaz.autorizar({ ...opcoes, tpAmb, xmlAssinado: assinado });
  } catch (err) {
    await pool.query(`UPDATE ctes_emitidos SET status = 'erro', motivo = $2, atualizado_em = NOW() WHERE id = $1`, [id, err.message]);
    throw err;
  }
  if (r.cStat === '100' && r.protCTe) {
    await registrarAutorizado(id, assinado, r);
  } else if (DUPLICIDADE.includes(r.cStat)) {
    // Já autorizado antes (resposta perdida): busca o protocolo pela consulta.
    const c = await sefaz.consultar({ ...opcoes, tpAmb, chave });
    if (c.protCTe && ['100', '150'].includes(c.cStat)) await registrarAutorizado(id, assinado, { ...c, cStat: '100' });
    else await pool.query(`UPDATE ctes_emitidos SET status = 'rejeitado', cstat = $2, motivo = $3, atualizado_em = NOW() WHERE id = $1`, [id, r.cStat, r.xMotivo]);
  } else {
    // Rejeitado: o número continua reservado para esse CT-e (corrige e transmite de novo).
    await pool.query(`UPDATE ctes_emitidos SET status = 'rejeitado', cstat = $2, motivo = $3, atualizado_em = NOW() WHERE id = $1`, [id, r.cStat, r.xMotivo]);
  }
  return carregar(id);
}

// O certificado de demonstração só serve no modo demonstração (e vice-versa não há problema:
// no modo demonstração pode-se usar o certificado verdadeiro, nada é enviado).
async function certificadoParaUsar(e, demonstracao = !!e.cte_demonstracao) {
  const cert = await certificadoDoEmitente(pool);
  if (cert.demonstracao && !demonstracao) {
    throw new Error('O certificado cadastrado é o de DEMONSTRAÇÃO e não vale na SEFAZ. Envie o certificado A1 da empresa (.pfx) na Configuração fiscal, ou ligue o modo demonstração.');
  }
  return cert;
}
const simulacao = (reg) => (reg.demonstracao
  ? { conhecido: reg.chave && reg.protocolo ? { chave: reg.chave, nProt: reg.protocolo, cancelado: reg.status === 'cancelado' } : null } : null);

async function carregar(id) {
  const { rows } = await pool.query('SELECT * FROM ctes_emitidos WHERE id = $1', [id]);
  return rows[0] || null;
}

async function consultar(id) {
  const reg = await carregar(id);
  if (!reg?.chave) throw new Error('Esse CT-e ainda não foi transmitido.');
  const e = await carregarEmitente();
  const cert = await certificadoParaUsar(e, reg.demonstracao);
  const c = await sefaz.consultar({ uf: e.uf, cert, verificarServidor: e.cte_verificar_servidor, tpAmb: reg.ambiente, chave: reg.chave, simulado: simulacao(reg) });
  if (['100', '150'].includes(c.cStat) && c.protCTe && reg.status !== 'autorizado' && reg.status !== 'cancelado' && reg.xml_assinado) {
    await registrarAutorizado(id, reg.xml_assinado, { ...c, cStat: '100' });
  }
  if (['101', '151'].includes(c.cStat) && reg.status !== 'cancelado') {
    await pool.query(`UPDATE ctes_emitidos SET status = 'cancelado', atualizado_em = NOW() WHERE id = $1`, [id]);
  }
  return { consulta: { cStat: c.cStat, xMotivo: c.xMotivo, nProt: c.nProt }, cte: await carregar(id) };
}

async function enviarEvento(reg, montar, tipo) {
  const e = await carregarEmitente();
  const cert = await certificadoParaUsar(e, reg.demonstracao);
  const xml = montar({ chave: reg.chave, cnpj: e.cnpj, uf: e.uf, tpAmb: reg.ambiente });
  const assinado = assinar(xml, 'infEvento', cert);
  const r = await sefaz.enviarEvento({ uf: e.uf, cert, verificarServidor: e.cte_verificar_servidor, tpAmb: reg.ambiente, xmlEventoAssinado: assinado, simulado: simulacao(reg) });
  // 134/135/136: evento registrado.
  const ok = ['134', '135', '136'].includes(r.cStat);
  const evento = { tipo, cStat: r.cStat, xMotivo: r.xMotivo, protocolo: r.nProt, em: r.dhRegEvento || new Date().toISOString(), ok,
    xml: ok ? `<procEventoCTe xmlns="${NS}" versao="${VERSAO}">${assinado}${r.retorno}</procEventoCTe>` : null };
  await pool.query('UPDATE ctes_emitidos SET eventos = eventos || $2::jsonb, atualizado_em = NOW() WHERE id = $1', [reg.id, JSON.stringify([evento])]);
  if (!ok) throw new Error(`A SEFAZ rejeitou o evento: ${r.cStat} - ${r.xMotivo}`);
  return evento;
}

async function cancelar(id, justificativa) {
  const reg = await carregar(id);
  if (reg?.status !== 'autorizado') throw new Error('Só dá para cancelar CT-e autorizado.');
  const evento = await enviarEvento(reg, (base) => eventos.cancelamento({ ...base, nProt: reg.protocolo, justificativa }), 'cancelamento');
  await pool.query(`UPDATE ctes_emitidos SET status = 'cancelado', motivo = $2, atualizado_em = NOW() WHERE id = $1`, [id, `Cancelado: ${justificativa}`]);
  return evento;
}

async function cartaCorrecao(id, correcoes) {
  const reg = await carregar(id);
  if (reg?.status !== 'autorizado') throw new Error('Carta de correção só vale para CT-e autorizado.');
  const nSeq = Number(reg.cce_sequencia || 0) + 1;
  const evento = await enviarEvento(reg, (base) => eventos.cartaCorrecao({ ...base, nSeq, correcoes }), 'carta_correcao');
  await pool.query('UPDATE ctes_emitidos SET cce_sequencia = $2 WHERE id = $1', [id, nSeq]);
  return evento;
}

async function testarConexao() {
  const e = await carregarEmitente();
  const cert = await certificadoParaUsar(e);
  return sefaz.statusServico({ uf: e.uf, tpAmb: e.cte_ambiente, cert, verificarServidor: e.cte_verificar_servidor, simulado: e.cte_demonstracao ? {} : null });
}

module.exports = { carregarEmitente, emitenteDoCadastro, dadosParaXml, resumo, transmitir, consultar, cancelar, cartaCorrecao, testarConexao, carregar };
