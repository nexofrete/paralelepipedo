// Gerenciamento de risco (GR) da viagem, como a seguradora exige no plano de gerenciamento de risco (PGR):
//  • Consulta do motorista e do veículo na gerenciadora: liberado (com validade), negado ou pendente.
//    Sem integração (contrato ainda não liberado), o resultado da consulta feita no site da GR é
//    registrado à mão, com protocolo e validade.
//  • Regras da apólice na configuração: limite de valor por veículo, valor a partir do qual é preciso
//    rastreador, escolta e solicitação de monitoramento (SM).
//  • Conferência do MDF-e: lista o que falta; se a empresa quiser, impede a transmissão sem tudo em ordem.
//  • SM: manda a viagem (motorista, veículo, rastreador, rota, valor) para a gerenciadora monitorar.
const pool = require('../db');
const Doc = require('../utils/documento');
const { criptografar, descriptografar } = require('../rastreioLonngren');
const { PROVEDORES } = require('./provedores');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, max) : null; };
const hojeIso = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const somarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const placaLimpa = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const valorOuNulo = (v) => { const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------- Configuração (provedor e regras da apólice) ----------
const PADRAO = {
  provedor: 'simulador', credenciais: {}, validade_dias: 180,
  limite_apolice: null, valor_rastreador: null, valor_escolta: null, valor_sm: null,
  exigir_liberacao: true, bloquear_mdfe: false,
};
async function config({ comSenhas = false } = {}) {
  const { rows } = await pool.query('SELECT gr_config FROM empresa WHERE id = 1');
  const c = { ...PADRAO, ...(rows[0]?.gr_config || {}) };
  const cred = {};
  Object.entries(c.credenciais || {}).forEach(([k, v]) => { cred[k] = /senha/.test(k) ? (comSenhas ? descriptografar(v) : (v ? '••••••' : '')) : v; });
  return { ...c, credenciais: cred };
}
async function salvarConfig(b = {}) {
  const atual = await config({ comSenhas: true });
  const provedor = PROVEDORES[b.provedor] ? b.provedor : 'simulador';
  const cred = {};
  for (const k of PROVEDORES[provedor].credenciais) {
    const v = texto(b.credenciais?.[k], 200);
    if (/senha/.test(k)) cred[k] = !v || /^•+$/.test(v) ? (atual.credenciais[k] ? criptografar(atual.credenciais[k]) : null) : criptografar(v);
    else cred[k] = v;
  }
  const c = {
    provedor, credenciais: cred, validade_dias: Math.min(Math.max(parseInt(b.validade_dias, 10) || 180, 1), 730),
    limite_apolice: valorOuNulo(b.limite_apolice), valor_rastreador: valorOuNulo(b.valor_rastreador), valor_escolta: valorOuNulo(b.valor_escolta),
    valor_sm: valorOuNulo(b.valor_sm), exigir_liberacao: b.exigir_liberacao !== false, bloquear_mdfe: !!b.bloquear_mdfe,
  };
  await pool.query('UPDATE empresa SET gr_config = $1 WHERE id = 1', [c]);
  return config();
}
const provedores = () => Object.entries(PROVEDORES).map(([id, p]) => ({ id, nome: p.nome, simulado: !!p.simulado, aguardando: !!p.aguardando, credenciais: p.credenciais }));
const provedorDe = (id) => { const p = PROVEDORES[id]; if (!p) throw falha('Gerenciadora de risco não configurada.'); return p; };

// ---------- Consultas de motorista e veículo ----------
const chaveDe = (tipo, v) => (tipo === 'motorista' ? String(v || '').replace(/\D/g, '') : placaLimpa(v));
async function ultimaConsulta(tipo, chave) {
  const { rows } = await pool.query('SELECT * FROM gr_consultas WHERE tipo = $1 AND chave = $2 ORDER BY consultado_em DESC, id DESC LIMIT 1', [tipo, chave]);
  return rows[0] || null;
}
// Situação para a viagem: liberado (vigente), vencida, negado, pendente ou sem consulta.
function situacaoDa(c) {
  if (!c) return { situacao: 'sem_consulta', texto: 'sem consulta na GR' };
  const validade = c.validade ? String(c.validade instanceof Date ? c.validade.toISOString() : c.validade).slice(0, 10) : null;
  if (c.status === 'liberado' && validade && validade < hojeIso()) return { situacao: 'vencida', texto: `liberação vencida em ${validade.split('-').reverse().join('/')}`, validade };
  if (c.status === 'liberado') return { situacao: 'liberado', texto: `liberado até ${validade ? validade.split('-').reverse().join('/') : '—'}`, validade };
  if (c.status === 'negado') return { situacao: 'negado', texto: `negado pela GR${c.motivo ? `: ${c.motivo}` : ''}` };
  return { situacao: 'pendente', texto: `em análise na GR${c.motivo ? `: ${c.motivo}` : ''}` };
}

async function consultar(tipo, valor, usuarioNome) {
  if (!['motorista', 'veiculo'].includes(tipo)) throw falha('Tipo de consulta inválido.');
  const chave = chaveDe(tipo, valor);
  const cfg = await config({ comSenhas: true });
  const p = provedorDe(cfg.provedor);
  let r; let nome;
  if (tipo === 'motorista') {
    if (!Doc.cpfValido(chave)) throw falha('CPF do motorista inválido.');
    const { rows: [m] } = await pool.query('SELECT * FROM motoristas WHERE cpf = $1', [chave]);
    if (!m) throw falha('Motorista não está no cadastro (Veículos e motoristas).', 404);
    nome = m.nome;
    r = await p.consultarMotorista({ cpf: m.cpf, nome: m.nome, cnh: m.cnh, cnh_validade: m.cnh_validade ? String(m.cnh_validade instanceof Date ? m.cnh_validade.toISOString() : m.cnh_validade).slice(0, 10) : null }, cfg);
  } else {
    const { rows: [v] } = await pool.query('SELECT * FROM veiculos WHERE placa = $1', [chave]);
    if (!v) throw falha('Veículo não está no cadastro (Veículos e motoristas).', 404);
    nome = v.descricao || v.placa;
    r = await p.consultarVeiculo({ placa: v.placa, renavam: v.renavam, proprietario: v.proprietario }, cfg);
  }
  const validade = r.status === 'liberado' ? (r.validade || somarDias(hojeIso(), cfg.validade_dias)) : null;
  const { rows } = await pool.query(
    `INSERT INTO gr_consultas (tipo, chave, nome, provedor, simulado, status, protocolo, motivo, validade, usuario_nome) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [tipo, chave, nome, cfg.provedor, !!p.simulado, r.status, r.protocolo || null, texto(r.motivo, 300), validade, usuarioNome]);
  return { ...rows[0], ...situacaoDa(rows[0]) };
}

// Resultado da consulta feita no site da gerenciadora (sem integração).
async function registrarManual(b = {}, usuarioNome) {
  const tipo = b.tipo === 'veiculo' ? 'veiculo' : 'motorista';
  const chave = chaveDe(tipo, b.chave);
  if (tipo === 'motorista' && !Doc.cpfValido(chave)) throw falha('CPF do motorista inválido.');
  if (tipo === 'veiculo' && !/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(chave)) throw falha('Placa inválida.');
  const status = ['liberado', 'negado', 'pendente'].includes(b.status) ? b.status : null;
  if (!status) throw falha('Informe o resultado da consulta.');
  const protocolo = texto(b.protocolo, 40);
  if (status === 'liberado' && !protocolo) throw falha('Informe o número/protocolo da liberação da GR.');
  const cfg = await config();
  const validade = status === 'liberado' ? (/^\d{4}-\d{2}-\d{2}$/.test(String(b.validade || '')) ? b.validade : somarDias(hojeIso(), cfg.validade_dias)) : null;
  if (validade && validade < hojeIso()) throw falha('A validade da liberação já passou.');
  const { rows: [cad] } = tipo === 'motorista' ? await pool.query('SELECT nome FROM motoristas WHERE cpf = $1', [chave]) : await pool.query('SELECT COALESCE(descricao, placa) AS nome FROM veiculos WHERE placa = $1', [chave]);
  const { rows } = await pool.query(
    `INSERT INTO gr_consultas (tipo, chave, nome, provedor, simulado, status, protocolo, motivo, validade, usuario_nome) VALUES ($1,$2,$3,'manual',FALSE,$4,$5,$6,$7,$8) RETURNING *`,
    [tipo, chave, cad?.nome || null, status, protocolo, texto(b.motivo, 300), validade, usuarioNome]);
  return { ...rows[0], ...situacaoDa(rows[0]) };
}

// Situação de todos os motoristas e veículos (para o cadastro da frota).
async function situacoes() {
  const { rows } = await pool.query('SELECT DISTINCT ON (tipo, chave) * FROM gr_consultas ORDER BY tipo, chave, consultado_em DESC, id DESC');
  const r = { motorista: {}, veiculo: {} };
  rows.forEach((c) => { r[c.tipo][c.chave] = { ...situacaoDa(c), status: c.status, protocolo: c.protocolo, provedor: c.provedor, consultado_em: c.consultado_em }; });
  return r;
}

// ---------- Viagem (MDF-e) ----------
async function smAtiva(mdfeId) {
  const { rows } = await pool.query(`SELECT * FROM gr_sm WHERE mdfe_id = $1 AND status = 'enviada' ORDER BY id DESC LIMIT 1`, [mdfeId]);
  return rows[0] || null;
}

// O que a apólice exige para esta viagem e o que falta.
async function avaliar(mdfeId) {
  const cfg = await config();
  const { rows: [m] } = await pool.query('SELECT id, status, serie, numero, chave, dados FROM mdfes WHERE id = $1', [mdfeId]);
  if (!m) throw falha('MDF-e não encontrado.', 404);
  const d = m.dados || {};
  const valor = Number(d.tot?.vCarga) || 0;
  const pendencias = []; const itens = [];
  const exige = (limite) => limite != null && valor >= Number(limite);
  // Motoristas e veículos.
  const pessoas = (d.condutores || []).map((c) => ({ tipo: 'motorista', chave: String(c.cpf || '').replace(/\D/g, ''), nome: c.xNome }));
  const placas = [d.veiculo?.placa, ...(d.reboques || []).map((r) => r.placa)].filter(Boolean).map((p) => ({ tipo: 'veiculo', chave: placaLimpa(p), nome: p }));
  if (!pessoas.length) pendencias.push('Escolha o motorista da viagem.');
  if (!placas.length) pendencias.push('Escolha o veículo da viagem.');
  for (const x of [...pessoas, ...placas]) {
    const s = situacaoDa(await ultimaConsulta(x.tipo, x.chave));
    itens.push({ ...x, ...s });
    if (cfg.exigir_liberacao && s.situacao !== 'liberado') pendencias.push(`${x.tipo === 'motorista' ? 'Motorista' : 'Veículo'} ${x.nome}: ${s.texto}.`);
  }
  // Regras de valor da apólice.
  const regras = [];
  if (cfg.limite_apolice) {
    const ok = valor <= cfg.limite_apolice;
    regras.push({ regra: `Limite da apólice por veículo: ${brl(cfg.limite_apolice)}`, ok });
    if (!ok) pendencias.push(`Carga de ${brl(valor)} passa do limite da apólice (${brl(cfg.limite_apolice)}): divida em mais de um veículo ou peça autorização à seguradora.`);
  }
  let rastreador = null;
  if (d.veiculo?.placa) {
    const { rows: [v] } = await pool.query('SELECT rastreador_tecnologia, rastreador_id FROM veiculos WHERE placa = $1', [placaLimpa(d.veiculo.placa)]);
    rastreador = v?.rastreador_tecnologia ? { tecnologia: v.rastreador_tecnologia, id: v.rastreador_id } : null;
  }
  if (exige(cfg.valor_rastreador)) {
    regras.push({ regra: `Rastreador a partir de ${brl(cfg.valor_rastreador)}`, ok: !!rastreador });
    if (!rastreador) pendencias.push(`Carga a partir de ${brl(cfg.valor_rastreador)} exige rastreador: informe a tecnologia e o ID no cadastro do veículo ${d.veiculo?.placa}.`);
  }
  const escolta = d.gr?.escolta || null;
  if (exige(cfg.valor_escolta)) {
    regras.push({ regra: `Escolta a partir de ${brl(cfg.valor_escolta)}`, ok: !!escolta?.contratada });
    if (!escolta?.contratada) pendencias.push(`Carga a partir de ${brl(cfg.valor_escolta)} exige escolta: contrate e marque a escolta.`);
  }
  const sm = await smAtiva(mdfeId);
  if (exige(cfg.valor_sm)) {
    regras.push({ regra: `Monitoramento (SM) a partir de ${brl(cfg.valor_sm)}`, ok: !!sm });
    if (!sm) pendencias.push(`Carga a partir de ${brl(cfg.valor_sm)} exige a solicitação de monitoramento (SM) na gerenciadora.`);
  }
  const p = PROVEDORES[cfg.provedor];
  return {
    mdfe: { id: m.id, status: m.status, numero: m.numero, serie: m.serie }, valor, itens, regras, rastreador, escolta, sm,
    pendencias, ok: !pendencias.length, bloqueia: cfg.bloquear_mdfe,
    provedor: { id: cfg.provedor, nome: p?.nome, simulado: !!p?.simulado, aguardando: !!p?.aguardando },
  };
}

// Antes de transmitir o MDF-e: se a empresa escolheu bloquear, só passa com tudo em ordem.
async function conferirParaTransmitir(mdfeId) {
  const a = await avaliar(mdfeId);
  if (a.bloqueia && !a.ok) throw falha(`Gerenciamento de risco: ${a.pendencias.join(' ')}`, 409);
  return a;
}

async function marcarEscolta(mdfeId, b = {}) {
  const escolta = b.contratada ? { contratada: true, empresa: texto(b.empresa, 120), contato: texto(b.contato, 80) } : null;
  const { rowCount } = await pool.query(
    `UPDATE mdfes SET dados = jsonb_set(COALESCE(dados, '{}'::jsonb), '{gr}', COALESCE(dados->'gr', '{}'::jsonb) || jsonb_build_object('escolta', $2::jsonb)) WHERE id = $1`,
    [mdfeId, JSON.stringify(escolta)]);
  if (!rowCount) throw falha('MDF-e não encontrado.', 404);
  return escolta;
}

async function enviarSM(mdfeId, usuarioNome) {
  const cfg = await config({ comSenhas: true });
  if (await smAtiva(mdfeId)) throw falha('Esta viagem já tem SM enviada. Para mandar de novo, cancele a atual.', 409);
  const a = await avaliar(mdfeId);
  const semLiberacao = a.itens.filter((x) => x.situacao !== 'liberado');
  if (semLiberacao.length) throw falha(`A gerenciadora só aceita a SM com motorista e veículo liberados: ${semLiberacao.map((x) => `${x.nome} (${x.texto})`).join(', ')}.`);
  const { rows: [m] } = await pool.query('SELECT serie, numero, chave, dados FROM mdfes WHERE id = $1', [mdfeId]);
  const d = m.dados || {};
  const viagem = {
    mdfe: { serie: m.serie, numero: m.numero, chave: m.chave },
    motoristas: (d.condutores || []).map((c) => ({ cpf: c.cpf, nome: c.xNome })),
    veiculo: { placa: d.veiculo?.placa, rastreador: a.rastreador }, reboques: (d.reboques || []).map((r) => r.placa),
    origem: (d.carregamento || []).map((x) => ({ ibge: x.cMun, cidade: x.xMun })), destinos: (d.descargas || []).map((x) => ({ ibge: x.cMun, cidade: x.xMun })),
    percurso: d.percurso || [], valor_carga: a.valor, peso: Number(d.tot?.qCarga) || null, produto: d.prodPred?.xProd || null, escolta: a.escolta,
  };
  const p = provedorDe(cfg.provedor);
  const r = await p.enviarSM(viagem, cfg);
  const { rows } = await pool.query(
    `INSERT INTO gr_sm (mdfe_id, provedor, simulado, numero, status, viagem, usuario_nome) VALUES ($1,$2,$3,$4,'enviada',$5,$6) RETURNING *`,
    [mdfeId, cfg.provedor, !!p.simulado, r.numero, viagem, usuarioNome]);
  return rows[0];
}

async function cancelarSM(mdfeId, motivo) {
  const cfg = await config({ comSenhas: true });
  const sm = await smAtiva(mdfeId);
  if (!sm) throw falha('Esta viagem não tem SM enviada.', 404);
  const mot = texto(motivo, 200);
  if (!mot || mot.length < 10) throw falha('Informe o motivo do cancelamento da SM.');
  await provedorDe(sm.provedor).cancelarSM(sm.viagem, mot, cfg);
  await pool.query(`UPDATE gr_sm SET status = 'cancelada', motivo_cancelamento = $2, cancelada_em = NOW() WHERE id = $1`, [sm.id, mot]);
  return { cancelada: true };
}

module.exports = { config, salvarConfig, provedores, consultar, registrarManual, situacoes, situacaoDa, avaliar, conferirParaTransmitir, marcarEscolta, enviarSM, cancelarSM };
