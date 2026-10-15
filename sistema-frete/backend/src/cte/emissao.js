// Regras da emissão de CT-e: junta os dados da tela com o cadastro fiscal do
// emitente, reserva o número, assina, transmite e guarda o resultado.
const pool = require('../db');
const { montarCte, incluirQrCode, NS, VERSAO, soDigitos } = require('./montarCte');
const { assinar } = require('./assinatura');
const { certificadoDoEmitente } = require('./certificado');
const { webservicesDaUf, contingenciaDaUf } = require('./ufs');
const sefaz = require('./sefaz');
const eventos = require('./eventos');
const averbacao = require('../averbacao/averbacao');

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

// ICMS tributado sem base (rascunho que veio sem frete e teve o valor lançado
// depois): a base é o valor da prestação (com a redução, se houver) e o ICMS
// sai da alíquota. Sem isso o XML iria sem vBC/vICMS (obrigatórios) e o livro
// fiscal ficaria com ICMS zero.
function completarIcms(d) {
  const i = d?.icms || {};
  const vazio = (v) => v == null || v === '';
  if (!['00', '20', '90', 'OUTRAUF'].includes(String(i.cst || '')) || !(Number(i.pICMS) > 0) || !(vazio(i.vBC) || vazio(i.vICMS))) return null;
  const c = (v) => Math.round(v * 100) / 100;
  const base = vazio(i.vBC) ? c((Number(d.valores?.vTPrest) || 0) * (1 - (Number(i.pRedBC) || 0) / 100)) : Number(i.vBC);
  return { ...d, icms: { ...i, vBC: base, vICMS: c((base * Number(i.pICMS)) / 100) } };
}

// Contingência (SVC): ligada na Configuração fiscal quando a SEFAZ da UF está fora.
// A autorização vai para a SVC; consulta e eventos de CT-e autorizado na SVC
// também, enquanto a contingência estiver ligada (depois a SEFAZ de origem
// recebe esses CT-e da SVC e passa a responder por eles).
const contingenciaLigada = (e) => !!e.cte_contingencia;
const naSvc = (e, chave) => contingenciaLigada(e) && !!chave && chave[34] !== '1';

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
  const { rows } = await pool.query(
    `UPDATE ctes_emitidos SET status = 'autorizado', xml_autorizado = $2, protocolo = $3, autorizado_em = COALESCE($4::timestamptz, NOW()),
            cstat = $5, motivo = $6, atualizado_em = NOW() WHERE id = $1 RETURNING dados`,
    [id, cteProc(xmlAssinado, r.protCTe), r.nProt, r.dhRecbto || null, r.cStat, r.xMotivo]);
  const d = rows[0]?.dados || {};
  if (String(d.tpCTe) === '3') await concluirSubstituicao(id, d.substituido?.chave);
  // Previsão de entrega (prazo da tabela ou o padrão), para o acompanhamento das entregas.
  // O complementar só cobra um valor a mais: a entrega é acompanhada pelo CT-e original.
  if (String(d.tpCTe) !== '1') await require('./ocorrencias').definirPrevisao(id).catch((e) => console.error('[cte] previsão de entrega:', e.message));
  // Filiais: onde a mercadoria está e qual unidade entrega.
  await require('../unidades').aoAutorizar(id).catch((e) => console.error('[cte] unidade:', e.message));
  // Seguro da carga: averba na hora (se a averbação automática estiver ligada).
  await averbacao.semFalhar(averbacao.averbar('cte', id));
}

// CT-e substituto autorizado: o original fica "substituído" e o acompanhamento
// da entrega (ocorrências, romaneio, situação) passa para o substituto.
async function concluirSubstituicao(novoId, chaveOriginal) {
  if (!chaveOriginal) return;
  const { rows } = await pool.query(`UPDATE ctes_emitidos SET status = 'substituido', substituido_por = $2, atualizado_em = NOW()
     WHERE chave = $1 AND status = 'autorizado' RETURNING id, situacao_entrega, data_entrega, recebedor_nome, recebedor_documento, previsao_entrega, previsao_original,
               unidade_origem_id, unidade_atual_id, unidade_destino_id, em_transferencia_id`, [chaveOriginal, novoId]);
  const o = rows[0];
  if (!o) return;
  await pool.query(`UPDATE ctes_emitidos SET situacao_entrega = $2, data_entrega = $3, recebedor_nome = $4, recebedor_documento = $5,
     previsao_entrega = COALESCE($6, previsao_entrega), previsao_original = COALESCE($7, previsao_original) WHERE id = $1`,
  [novoId, o.situacao_entrega, o.data_entrega, o.recebedor_nome, o.recebedor_documento, o.previsao_entrega, o.previsao_original]);
  await pool.query('UPDATE cte_ocorrencias SET cte_id = $2 WHERE cte_id = $1', [o.id, novoId]);
  await pool.query('UPDATE romaneio_itens SET cte_id = $2 WHERE cte_id = $1 AND NOT EXISTS (SELECT 1 FROM romaneio_itens x WHERE x.romaneio_id = romaneio_itens.romaneio_id AND x.cte_id = $2)', [o.id, novoId]);
  // Filiais: a mercadoria continua onde estava (ou na mesma transferência).
  await pool.query('UPDATE ctes_emitidos SET unidade_origem_id = $2, unidade_atual_id = $3, unidade_destino_id = $4, em_transferencia_id = $5 WHERE id = $1',
    [novoId, o.unidade_origem_id, o.unidade_atual_id, o.unidade_destino_id, o.em_transferencia_id]);
  await pool.query('UPDATE ctes_emitidos SET unidade_atual_id = NULL, em_transferencia_id = NULL WHERE id = $1', [o.id]);
  await pool.query('UPDATE transferencia_itens SET cte_id = $2 WHERE cte_id = $1 AND NOT EXISTS (SELECT 1 FROM transferencia_itens x WHERE x.transferencia_id = transferencia_itens.transferencia_id AND x.cte_id = $2)', [o.id, novoId]);
}

// Transmite o CT-e. Se uma tentativa anterior ficou sem resposta, consulta a
// chave antes de reenviar (a SEFAZ pode ter autorizado e a resposta se perdido).
async function transmitir(id) {
  const { rows } = await pool.query('SELECT * FROM ctes_emitidos WHERE id = $1', [id]);
  let reg = rows[0];
  if (!reg) throw new Error('CT-e não encontrado.');
  if (['autorizado', 'cancelado'].includes(reg.status)) throw new Error(`Esse CT-e já está ${reg.status}.`);
  const e = await carregarEmitente();
  require('../licenca').conferirEmpresa(e.cnpj);   // a licença é desta empresa (CNPJ)?
  const cert = await certificadoParaUsar(e);
  // Demonstração: o que for transmitido agora fica marcado e nunca vai à SEFAZ.
  const demo = reg.demonstracao || (!reg.chave && !!e.cte_demonstracao);
  if (demo && !reg.demonstracao) await pool.query('UPDATE ctes_emitidos SET demonstracao = TRUE WHERE id = $1', [id]);
  if (!demo && reg.demonstracao) throw new Error('Esse CT-e foi feito no modo demonstração. Duplique para emitir de verdade.');
  const opcoes = { uf: e.uf, cert, verificarServidor: e.cte_verificar_servidor, simulado: demo ? { conhecido: null } : null };
  const contingencia = contingenciaLigada(e);
  if (contingencia && String(reg.dados?.tpCTe) === '3') throw new Error('CT-e de substituição não pode ser emitido em contingência. Espere a SEFAZ voltar e desligue a contingência.');

  let pendente = null;
  if (reg.status === 'enviando' || reg.status === 'erro') {
    if (reg.chave && reg.xml_assinado) {
      const c = await sefaz.consultar({ ...opcoes, tpAmb: reg.ambiente, chave: reg.chave, contingencia: naSvc(e, reg.chave) }).catch(() => null);
      if (c && (c.cStat === '100' || c.cStat === '150') && c.protCTe) {
        await registrarAutorizado(id, reg.xml_assinado, { ...c, cStat: '100', xMotivo: 'Autorizado o uso do CT-e (confirmado pela consulta)' });
        return carregar(id);
      }
      // Foi para a SEFAZ de origem sem resposta e agora vai pela SVC: guarda a chave
      // para conferir depois (se a origem tiver autorizado, precisa cancelar).
      if (!c && contingencia && reg.chave[34] === '1') pendente = reg.chave;
    }
  }

  const icms = completarIcms(reg.dados);
  if (icms) await pool.query('UPDATE ctes_emitidos SET dados = $2 WHERE id = $1', [id, JSON.stringify(icms)]);

  await reservarNumero(id);
  reg = (await pool.query('SELECT * FROM ctes_emitidos WHERE id = $1', [id])).rows[0];
  if (Number(reg.ambiente) !== Number(e.cte_ambiente)) {
    throw new Error('O ambiente (homologação/produção) mudou depois que esse CT-e recebeu número. Duplique o CT-e para emitir no ambiente atual.');
  }
  const certCnpj = soDigitos(cert.cnpj);
  if (certCnpj && certCnpj.slice(0, 8) !== soDigitos(e.cnpj).slice(0, 8)) {
    throw new Error(`O certificado digital é do CNPJ ${cert.cnpj}, diferente do CNPJ da empresa (${e.cnpj}).`);
  }

  const ws = webservicesDaUf(e.uf, reg.ambiente, contingencia);
  const { xml, chave, tpAmb } = montarCte({ ...dadosParaXml(reg, e), tpEmis: ws.tpEmis });
  const assinado = incluirQrCode(assinar(xml, 'infCte', cert), ws.qrCode, chave, tpAmb);
  await pool.query(`UPDATE ctes_emitidos SET status = 'enviando', chave = $2, xml_assinado = $3, tp_emis = $4, cstat = NULL, motivo = NULL,
      chave_pendente_origem = COALESCE($5, chave_pendente_origem), atualizado_em = NOW() WHERE id = $1`,
  [id, chave, assinado, ws.tpEmis, pendente]);
  opcoes.contingencia = contingencia;

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
  const c = await sefaz.consultar({ uf: e.uf, cert, verificarServidor: e.cte_verificar_servidor, tpAmb: reg.ambiente, chave: reg.chave, simulado: simulacao(reg), contingencia: naSvc(e, reg.chave) });
  if (['100', '150'].includes(c.cStat) && c.protCTe && reg.status !== 'autorizado' && reg.status !== 'cancelado' && reg.xml_assinado) {
    await registrarAutorizado(id, reg.xml_assinado, { ...c, cStat: '100' });
  }
  if (['101', '151'].includes(c.cStat) && reg.status !== 'cancelado') {
    await pool.query(`UPDATE ctes_emitidos SET status = 'cancelado', atualizado_em = NOW() WHERE id = $1`, [id]);
  }
  // Chave que ficou pendente na SEFAZ de origem (antes da contingência).
  let pendente = null;
  if (reg.chave_pendente_origem && !contingenciaLigada(e)) {
    const p = await sefaz.consultar({ uf: e.uf, cert, verificarServidor: e.cte_verificar_servidor, tpAmb: reg.ambiente, chave: reg.chave_pendente_origem, simulado: simulacao(reg) }).catch(() => null);
    if (p) {
      pendente = { chave: reg.chave_pendente_origem, cStat: p.cStat, xMotivo: p.xMotivo, nProt: p.nProt, autorizada: ['100', '150'].includes(p.cStat) };
      if (['217', '101', '151'].includes(p.cStat)) await pool.query('UPDATE ctes_emitidos SET chave_pendente_origem = NULL WHERE id = $1', [id]);
    }
  }
  return { consulta: { cStat: c.cStat, xMotivo: c.xMotivo, nProt: c.nProt }, pendente, cte: await carregar(id) };
}

async function enviarEvento(reg, montar, tipo) {
  const e = await carregarEmitente();
  const cert = await certificadoParaUsar(e, reg.demonstracao);
  const chave = reg.chaveEvento || reg.chave;
  const xml = montar({ chave, cnpj: e.cnpj, uf: e.uf, tpAmb: reg.ambiente });
  const assinado = assinar(xml, 'infEvento', cert);
  const r = await sefaz.enviarEvento({ uf: e.uf, cert, verificarServidor: e.cte_verificar_servidor, tpAmb: reg.ambiente, xmlEventoAssinado: assinado, simulado: simulacao(reg), contingencia: naSvc(e, chave) });
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
  await averbacao.semFalhar(averbacao.avisarEvento('cte', id, 'cancelamento'));
  return evento;
}

// Cancela a chave que a SEFAZ de origem autorizou enquanto o CT-e era reemitido na SVC.
async function cancelarPendenteOrigem(id) {
  const reg = await carregar(id);
  if (!reg?.chave_pendente_origem) throw new Error('Esse CT-e não tem chave pendente na SEFAZ de origem.');
  const e = await carregarEmitente();
  if (contingenciaLigada(e)) throw new Error('Desligue a contingência antes: o cancelamento vai para a SEFAZ de origem.');
  const cert = await certificadoParaUsar(e, reg.demonstracao);
  const p = await sefaz.consultar({ uf: e.uf, cert, verificarServidor: e.cte_verificar_servidor, tpAmb: reg.ambiente, chave: reg.chave_pendente_origem, simulado: simulacao(reg) });
  if (!['100', '150'].includes(p.cStat) || !p.nProt) {
    if (['217', '101', '151'].includes(p.cStat)) await pool.query('UPDATE ctes_emitidos SET chave_pendente_origem = NULL WHERE id = $1', [id]);
    throw new Error(`Não há o que cancelar: ${p.cStat} - ${p.xMotivo}`);
  }
  const just = `Emitido em duplicidade - substituido pelo CT-e autorizado em contingencia ${reg.chave}`.slice(0, 255);
  const evento = await enviarEvento({ ...reg, chaveEvento: reg.chave_pendente_origem }, (base) => eventos.cancelamento({ ...base, nProt: p.nProt, justificativa: just }), 'cancelamento_pendente_origem');
  await pool.query('UPDATE ctes_emitidos SET chave_pendente_origem = NULL WHERE id = $1', [id]);
  return evento;
}

// Rascunho de CT-e complementar (cobra um valor a mais: estadia, reentrega,
// diferença de frete) ou de substituição, a partir de um CT-e autorizado.
const PRAZO_SUBSTITUICAO_DIAS = 60;
async function rascunhoDerivado(id, tipo, usuarioNome) {
  const reg = await carregar(id);
  if (reg?.status !== 'autorizado') throw new Error('Só dá para complementar ou substituir CT-e autorizado.');
  const d = reg.dados || {};
  if (String(d.tpCTe ?? '0') === '1') throw new Error('CT-e complementar não pode ser complementado nem substituído.');
  const ref = `${reg.serie}/${reg.numero}`;
  let dados;
  if (tipo === 'complementar') {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ctes_emitidos WHERE status = 'autorizado' AND dados->'complementados' ? $1`, [reg.chave]);
    if (rows[0].n >= 10) throw new Error('Esse CT-e já recebeu 10 complementos (o máximo).');
    dados = {
      ...d, tpCTe: '1', complementados: [reg.chave], substituido: null, nfes: d.nfes,
      valores: { vTPrest: 0, componentes: [{ xNome: 'COMPLEMENTO', vComp: 0 }] },
      icms: { ...d.icms, vBC: 0, vICMS: 0 }, observacoes: `Complemento do CT-e ${ref}.`,
    };
  } else {
    const dias = (Date.now() - new Date(reg.autorizado_em).getTime()) / 86400000;
    if (dias > PRAZO_SUBSTITUICAO_DIAS) throw new Error(`A substituição tem que ser autorizada em até ${PRAZO_SUBSTITUICAO_DIAS} dias da autorização do CT-e (este tem ${Math.floor(dias)}).`);
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ctes_emitidos WHERE status = 'autorizado' AND dados->'complementados' ? $1`, [reg.chave]);
    if (rows[0].n) throw new Error('CT-e que já foi complementado não pode ser substituído.');
    dados = { ...d, tpCTe: '3', complementados: [], substituido: { chave: reg.chave, indAlteraToma: false }, observacoes: d.observacoes || '' };
  }
  const r = resumo(dados);
  const { rows } = await pool.query(
    `INSERT INTO ctes_emitidos (ambiente, dados, valor_total, tomador_nome, remetente_nome, destinatario_nome, cidade_fim, uf_fim, criado_por_nome, demonstracao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [reg.ambiente, dados, r.valor_total, r.tomador_nome, r.remetente_nome, r.destinatario_nome, r.cidade_fim, r.uf_fim, usuarioNome, reg.demonstracao]);
  return carregar(rows[0].id);
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
  return sefaz.statusServico({ uf: e.uf, tpAmb: e.cte_ambiente, cert, verificarServidor: e.cte_verificar_servidor, simulado: e.cte_demonstracao ? {} : null, contingencia: contingenciaLigada(e) });
}

module.exports = { completarIcms, certificadoParaUsar, carregarEmitente, emitenteDoCadastro, dadosParaXml, resumo, transmitir, consultar, cancelar, cartaCorrecao, testarConexao, carregar, rascunhoDerivado, cancelarPendenteOrigem, contingenciaDaUf };
