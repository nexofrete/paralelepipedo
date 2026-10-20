// Pagamento eletrônico de frete (Resolução ANTT 5.862/2019): CIOT e vale-pedágio do acerto de viagem
// com terceiro (TAC ou agregado), pelo provedor escolhido na configuração (Pamcard, Repom, e-Frete,
// Target ou o simulador).
//  1. Declarar a operação de transporte → o provedor devolve o CIOT, que vai para o acerto e para o
//     MDF-e (se ainda não foi transmitido).
//  2. Comprar o vale-pedágio (Lei 10.209/2001: pago pelo contratante, fora do frete) → número da
//     compra, valor e fornecedora vão para o acerto e para o MDF-e.
//  3. Encerrar ao fechar o acerto (valor final do frete e peso entregue), ou cancelar antes da viagem.
// Cada passo fica guardado em pef_operacoes, com o que foi enviado e o que voltou.
const pool = require('../db');
const Doc = require('../utils/documento');
const { municipio } = require('../roteirizacao/municipios');
const { criptografar, descriptografar } = require('../rastreioLonngren');
const { PROVEDORES } = require('./provedores');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const texto = (v, max) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, max) : null; };
const CANCELAR_ATE_HORAS = 24;

// ---------- Configuração ----------
const PADRAO = { provedor: 'simulador', ambiente: 'homologacao', credenciais: {}, vp_fornecedora_cnpj: null, vp_fornecedora_nome: null, eixos_padrao: 5, forma_pagamento: 'cartao' };
async function config({ comSenhas = false } = {}) {
  const { rows } = await pool.query('SELECT pef_config FROM empresa WHERE id = 1');
  const c = { ...PADRAO, ...(rows[0]?.pef_config || {}) };
  const cred = {};
  Object.entries(c.credenciais || {}).forEach(([k, v]) => { cred[k] = /senha|token/.test(k) ? (comSenhas ? descriptografar(v) : (v ? '••••••' : '')) : v; });
  return { ...c, credenciais: cred };
}
async function salvarConfig(b = {}) {
  const atual = await config({ comSenhas: true });
  const provedor = PROVEDORES[b.provedor] ? b.provedor : 'simulador';
  const cred = {};
  for (const k of PROVEDORES[provedor].credenciais) {
    const v = texto(b.credenciais?.[k], 200);
    // Senha e token: "••••••" (ou vazio) mantém o que já estava guardado.
    if (/senha|token/.test(k)) cred[k] = !v || /^•+$/.test(v) ? (atual.credenciais[k] ? criptografar(atual.credenciais[k]) : null) : criptografar(v);
    else cred[k] = v;
  }
  const vpCnpj = Doc.limpar(b.vp_fornecedora_cnpj);
  if (vpCnpj && !Doc.cnpjValido(vpCnpj)) throw falha('CNPJ da fornecedora do vale-pedágio inválido.');
  const c = {
    provedor, ambiente: b.ambiente === 'producao' ? 'producao' : 'homologacao', credenciais: cred,
    vp_fornecedora_cnpj: vpCnpj, vp_fornecedora_nome: texto(b.vp_fornecedora_nome, 120),
    eixos_padrao: Math.min(Math.max(parseInt(b.eixos_padrao, 10) || 5, 2), 9),
    forma_pagamento: ['cartao', 'pix', 'conta'].includes(b.forma_pagamento) ? b.forma_pagamento : 'cartao',
  };
  await pool.query('UPDATE empresa SET pef_config = $1 WHERE id = 1', [c]);
  return config();
}
const provedores = () => Object.entries(PROVEDORES).map(([id, p]) => ({ id, nome: p.nome, site: p.site, simulado: p.simulado, aguardando: !!p.aguardando, credenciais: p.credenciais }));

// ---------- Operação de transporte (o que vai para o provedor) ----------
async function dadosDoAcerto(acertoId) {
  const { rows } = await pool.query('SELECT * FROM acertos WHERE id = $1', [acertoId]);
  const a = rows[0];
  if (!a) throw falha('Acerto não encontrado.', 404);
  if (a.tipo !== 'terceiro') throw falha('CIOT é só para acerto com terceiro ou agregado (TAC). Motorista próprio não tem CIOT.');
  const { rows: [m] } = a.mdfe_id ? await pool.query('SELECT id, chave, status, dados FROM mdfes WHERE id = $1', [a.mdfe_id]) : { rows: [] };
  return { a, m };
}

// e: { origem_ibge, origem_cidade, origem_uf, destino_*, peso_kg, natureza, ncm, eixos, data_fim, tipo_viagem, forma_pagamento, pagamento_id }
async function montarOperacao(acertoId, e = {}, cfg) {
  const { a, m } = await dadosDoAcerto(acertoId);
  const { rows: [emp] } = await pool.query('SELECT cnpj, razao_social, rntrc FROM empresa WHERE id = 1');
  const d = m?.dados || {};
  const ac = require('../acertos');
  const { rows: lanc } = await pool.query('SELECT * FROM acerto_lancamentos WHERE acerto_id = $1', [acertoId]);
  const t = ac.calcular(a, lanc);
  const mun = (ibge, cidade, uf) => municipio({ ibge, cidade, uf });
  const origem = mun(e.origem_ibge, e.origem_cidade, e.origem_uf) || mun(d.carregamento?.[0]?.cMun);
  const ultima = (d.descargas || []).slice(-1)[0];
  const destino = mun(e.destino_ibge, e.destino_cidade, e.destino_uf) || mun(ultima?.cMun);
  const op = {
    acerto_id: a.id,
    contratante: { cnpj: Doc.limpar(emp?.cnpj), nome: emp?.razao_social || null, rntrc: emp?.rntrc || null },
    contratado: { doc: a.proprietario_doc, nome: a.proprietario_nome, rntrc: a.rntrc, tipo: String(a.proprietario_doc || '').length === 11 ? 'TAC' : 'ETC' },
    motorista: { cpf: a.motorista_cpf, nome: a.motorista_nome },
    veiculos: [{ placa: a.placa || d.veiculo?.placa || null, eixos: Math.min(Math.max(parseInt(e.eixos, 10) || cfg.eixos_padrao || 5, 2), 9) }],
    origem: origem ? { ibge: origem.ibge, cidade: origem.nome, uf: origem.uf } : null,
    destino: destino ? { ibge: destino.ibge, cidade: destino.nome, uf: destino.uf } : null,
    carga: { natureza: texto(e.natureza, 120) || d.prodPred?.xProd || 'Carga geral', ncm: String(e.ncm || d.prodPred?.NCM || '').replace(/\D/g, '').slice(0, 8) || null,
      peso_kg: Number(e.peso_kg) || Number(d.tot?.qCarga) || null },
    tipo_viagem: e.tipo_viagem === 'tac_agregado' ? 'tac_agregado' : 'padrao',
    valores: { frete: t.frete, adiantamento: t.adiantamento, impostos: { inss: Number(a.inss) || 0, sest_senat: Number(a.sest_senat) || 0, irrf: Number(a.irrf) || 0 },
      saldo: t.saldo, pedagio: Number(a.vale_pedagio_valor) || 0 },
    pagamento: { forma: ['cartao', 'pix', 'conta'].includes(e.forma_pagamento) ? e.forma_pagamento : cfg.forma_pagamento, identificacao: texto(e.pagamento_id, 80) },
    data_inicio: String(a.data_saida instanceof Date ? a.data_saida.toISOString() : a.data_saida).slice(0, 10),
    data_fim: /^\d{4}-\d{2}-\d{2}$/.test(String(e.data_fim || '')) ? e.data_fim : null,
    documentos: m?.chave ? [{ tipo: 'MDFe', chave: m.chave }] : [],
  };
  return { op, a, m };
}

// O que a ANTT exige para abrir a operação (o provedor recusa sem isso).
function conferir(op) {
  const faltas = [];
  if (!op.contratante.cnpj) faltas.push('CNPJ da empresa (Cadastros » Empresa)');
  if (!op.contratante.rntrc) faltas.push('RNTRC da empresa (Configuração fiscal)');
  if (!op.contratado.doc || !Doc.valido(op.contratado.doc)) faltas.push('CPF/CNPJ do contratado (proprietário do veículo)');
  if (!/^\d{8,9}$/.test(String(op.contratado.rntrc || ''))) faltas.push('RNTRC do contratado (8 ou 9 números)');
  if (!op.motorista.cpf || !Doc.cpfValido(op.motorista.cpf)) faltas.push('CPF do motorista');
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(String(op.veiculos[0].placa || ''))) faltas.push('placa do veículo');
  if (!op.origem) faltas.push('cidade de origem');
  if (!op.destino) faltas.push('cidade de destino');
  if (!(op.valores.frete > 0)) faltas.push('valor do frete');
  if (!(op.carga.peso_kg > 0)) faltas.push('peso da carga');
  if (op.data_fim && op.data_fim < op.data_inicio) faltas.push('data de término depois da saída');
  if (faltas.length) throw falha(`Para declarar o CIOT falta: ${faltas.join(', ')}.`);
}

// ---------- Guardar, acerto e MDF-e ----------
async function operacaoAtiva(acertoId) {
  const { rows } = await pool.query(`SELECT * FROM pef_operacoes WHERE acerto_id = $1 AND status IN ('declarada', 'encerrada') ORDER BY id DESC LIMIT 1`, [acertoId]);
  return rows[0] || null;
}
async function levarAoAcerto(acertoId, campos) {
  const sets = Object.keys(campos).map((k, i) => `${k} = $${i + 2}`).join(', ');
  const { rows } = await pool.query(`UPDATE acertos SET ${sets} WHERE id = $1 RETURNING *`, [acertoId, ...Object.values(campos)]);
  // CIOT e vale-pedágio no MDF-e ainda não transmitido.
  const cliente = await pool.connect();
  try { return await require('../acertos').levarAoMdfe(cliente, rows[0]); } finally { cliente.release(); }
}
const provedorDe = (id) => { const p = PROVEDORES[id]; if (!p) throw falha('Provedor de CIOT não configurado.'); return p; };
const registrarErro = (opId, err) => pool.query(`UPDATE pef_operacoes SET erro = $2 WHERE id = $1`, [opId, String(err.message).slice(0, 500)]).catch(() => {});

async function declarar(acertoId, extra, usuarioNome) {
  const cfg = await config({ comSenhas: true });
  if (await operacaoAtiva(acertoId)) throw falha('Este acerto já tem CIOT. Para trocar, cancele o atual.', 409);
  const { op, a } = await montarOperacao(acertoId, extra, cfg);
  if (a.status !== 'aberto') throw falha('O acerto já foi fechado: reabra para declarar o CIOT.', 409);
  conferir(op);
  const p = provedorDe(cfg.provedor);
  const r = await p.declarar(op, cfg);
  const { rows } = await pool.query(
    `INSERT INTO pef_operacoes (acerto_id, provedor, ambiente, simulado, status, ciot, verificador, protocolo, operacao, usuario_nome)
     VALUES ($1, $2, $3, $4, 'declarada', $5, $6, $7, $8, $9) RETURNING *`,
    [acertoId, cfg.provedor, cfg.ambiente, !!p.simulado, r.ciot, r.verificador || null, r.protocolo || null, op, usuarioNome]);
  const noMdfe = await levarAoAcerto(acertoId, { ciot: r.ciot });
  return { ...rows[0], ciot_no_mdfe: noMdfe };
}

async function comprarValePedagio(acertoId, { valor, eixos } = {}, usuarioNome) {
  const cfg = await config({ comSenhas: true });
  const o = await operacaoAtiva(acertoId);
  if (!o || o.status !== 'declarada') throw falha('Declare o CIOT antes de comprar o vale-pedágio.', 409);
  if (o.vp_numero) throw falha('O vale-pedágio desta operação já foi comprado.', 409);
  const op = { ...o.operacao, veiculos: [{ ...o.operacao.veiculos[0], eixos: parseInt(eixos, 10) || o.operacao.veiculos[0].eixos }] };
  try {
    const r = await provedorDe(o.provedor).comprarValePedagio(op, { valor: Number(String(valor ?? '').replace(/\./g, '').replace(',', '.')) || 0, eixos: op.veiculos[0].eixos }, cfg);
    const { rows } = await pool.query(
      `UPDATE pef_operacoes SET vp_numero = $2, vp_valor = $3, vp_fornecedora_cnpj = $4, vp_fornecedora_nome = $5, vp_em = NOW(), erro = NULL WHERE id = $1 RETURNING *`,
      [o.id, r.numero, centavos(r.valor), r.fornecedora_cnpj, r.fornecedora_nome || null]);
    const noMdfe = await levarAoAcerto(acertoId, { vale_pedagio_valor: centavos(r.valor), vale_pedagio_cnpj: r.fornecedora_cnpj, vale_pedagio_compra: String(r.numero).slice(0, 30) });
    return { ...rows[0], vp_no_mdfe: noMdfe, usuario: usuarioNome };
  } catch (err) { await registrarErro(o.id, err); throw err; }
}

// Encerramento: valor final (frete + acréscimos − descontos) e peso entregue.
async function encerrar(acertoId, { peso_entregue } = {}) {
  const cfg = await config({ comSenhas: true });
  const o = await operacaoAtiva(acertoId);
  if (!o || o.status !== 'declarada') return null;
  const { rows: [a] } = await pool.query('SELECT * FROM acertos WHERE id = $1', [acertoId]);
  const { rows: lanc } = await pool.query('SELECT * FROM acerto_lancamentos WHERE acerto_id = $1', [acertoId]);
  const t = require('../acertos').calcular(a, lanc);
  const final = { valor_frete: t.bruto, saldo: t.saldo, peso_entregue: Number(peso_entregue) || o.operacao.carga.peso_kg };
  try {
    const r = await provedorDe(o.provedor).encerrar(o.operacao, final, cfg);
    const { rows } = await pool.query(`UPDATE pef_operacoes SET status = 'encerrada', encerrada_em = NOW(), encerramento = $2, protocolo_encerramento = $3, erro = NULL WHERE id = $1 RETURNING *`,
      [o.id, final, r.protocolo || null]);
    return rows[0];
  } catch (err) { await registrarErro(o.id, err); throw err; }
}

async function cancelar(acertoId, motivo) {
  const cfg = await config({ comSenhas: true });
  const o = await operacaoAtiva(acertoId);
  if (!o) throw falha('Este acerto não tem CIOT para cancelar.', 404);
  if (o.status === 'encerrada') throw falha('A operação já foi encerrada: não dá para cancelar.', 409);
  const m = texto(motivo, 200);
  if (!m || m.length < 15) throw falha('Informe o motivo do cancelamento (pelo menos 15 caracteres).');
  if (Date.now() - new Date(o.criado_em).getTime() > CANCELAR_ATE_HORAS * 3600000) {
    throw falha(`O CIOT só pode ser cancelado até ${CANCELAR_ATE_HORAS} horas depois da declaração. Depois disso, encerre a operação com os valores reais.`, 409);
  }
  try {
    const r = await provedorDe(o.provedor).cancelar(o.operacao, m, cfg);
    await pool.query(`UPDATE pef_operacoes SET status = 'cancelada', cancelada_em = NOW(), motivo_cancelamento = $2, protocolo_cancelamento = $3, erro = NULL WHERE id = $1`, [o.id, m, r.protocolo || null]);
  } catch (err) { await registrarErro(o.id, err); throw err; }
  // Tira o CIOT (e o vale-pedágio comprado nele) do acerto e do MDF-e não transmitido.
  const campos = { ciot: null };
  if (o.vp_numero) Object.assign(campos, { vale_pedagio_valor: 0, vale_pedagio_cnpj: null, vale_pedagio_compra: null });
  await pool.query(`UPDATE acertos SET ${Object.keys(campos).map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [acertoId, ...Object.values(campos)]);
  const { rows: [a] } = await pool.query('SELECT mdfe_id FROM acertos WHERE id = $1', [acertoId]);
  if (a?.mdfe_id) {
    await pool.query(`UPDATE mdfes SET dados = dados - 'ciot'${o.vp_numero ? " - 'valePedagio'" : ''} WHERE id = $1 AND status IN ('rascunho', 'rejeitado', 'erro')`, [a.mdfe_id]);
  }
  return { cancelada: true };
}

// Situação no acerto: a operação atual, o histórico e o que já dá para pré-preencher na tela.
async function situacao(acertoId) {
  const cfg = await config();
  const { rows } = await pool.query('SELECT * FROM pef_operacoes WHERE acerto_id = $1 ORDER BY id DESC', [acertoId]);
  let previa = null;
  try { previa = (await montarOperacao(acertoId, {}, cfg)).op; } catch { /* acerto de motorista próprio */ }
  const p = PROVEDORES[cfg.provedor];
  return { provedor: { id: cfg.provedor, nome: p?.nome, simulado: !!p?.simulado, aguardando: !!p?.aguardando }, ambiente: cfg.ambiente,
    atual: rows.find((r) => ['declarada', 'encerrada'].includes(r.status)) || null, historico: rows, previa, cancelar_ate_horas: CANCELAR_ATE_HORAS };
}

module.exports = { config, salvarConfig, provedores, montarOperacao, conferir, declarar, comprarValePedagio, encerrar, cancelar, situacao, operacaoAtiva };
