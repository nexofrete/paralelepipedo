// Consulta de CNPJ (dados da Receita) usada em todos os cadastros: ao digitar o
// CNPJ, a tela preenche razão social, fantasia, endereço separado (logradouro,
// número, complemento, bairro), cidade com o código IBGE, UF, CEP, telefone,
// e-mail e — quando o serviço informa — a inscrição estadual.
//  • Até 3 serviços públicos gratuitos, nessa ordem: BrasilAPI, CNPJ.ws, ReceitaWS.
//  • O resultado fica guardado 30 dias (não encontrado: 1 dia), para não estourar
//    o limite de consultas desses serviços.
//  • CNPJ com dígito verificador errado nem é consultado.
const pool = require('./db');
const Doc = require('./utils/documento');

const soDigitos = Doc.digitos;
const limpo = (v) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t || null; };
const formatarCnpj = (d) => Doc.formatar(d);
// Dígito verificador e validação: a regra única de CNPJ/CPF do sistema (utils/documento.js, já com o CNPJ alfanumérico).
const digitosCnpj = Doc.dvCnpj;
const cnpjValido = (d) => /^\d{14}$/.test(d) && Doc.cnpjValido(d);
const cpfValido = Doc.cpfValido;

const CABECALHOS = { 'User-Agent': 'Nexofrete (consulta de CNPJ para cadastro)', Accept: 'application/json' };
async function buscarJson(url) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 15000);
  try {
    const resp = await fetch(url, { headers: CABECALHOS, signal: controle.signal });
    if (resp.status === 404) return { naoEncontrado: true };
    if (resp.status === 429) throw new Error('limite de consultas atingido (429)');
    if (!resp.ok) throw new Error(`respondeu ${resp.status}`);
    return await resp.json();
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'demorou demais' : err.message);
  } finally { clearTimeout(timer); }
}

const cep = (v) => { const d = soDigitos(v); return d.length === 8 ? d : null; };
const ibge = (v) => { const d = soDigitos(v); return d.length === 7 ? d : null; };
const fone = (v) => { const d = soDigitos(String(v ?? '').split('/')[0]); return d.length >= 10 ? d.slice(0, 11) : null; };
const email = (v) => { const t = String(v ?? '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null; };

// Cada serviço → o mesmo formato.
const FONTES = [
  ['BrasilAPI', (c) => `https://brasilapi.com.br/api/cnpj/v1/${c}`, (a) => ({
    razao_social: a.razao_social, nome_fantasia: a.nome_fantasia, situacao: a.descricao_situacao_cadastral,
    logradouro: [a.descricao_tipo_de_logradouro, a.logradouro].filter(Boolean).join(' '), numero: a.numero, complemento: a.complemento, bairro: a.bairro,
    cep: a.cep, municipio: a.municipio, codigo_municipio: a.codigo_municipio_ibge, uf: a.uf, telefone: a.ddd_telefone_1, email: a.email, ie: null,
  })],
  ['CNPJ.ws', (c) => `https://publica.cnpj.ws/cnpj/${c}`, (a) => {
    const e = a.estabelecimento || {};
    const uf = e.estado?.sigla;
    // Inscrição estadual ativa do estado do estabelecimento.
    const ies = Array.isArray(e.inscricoes_estaduais) ? e.inscricoes_estaduais : [];
    const ie = ies.find((x) => x?.ativo !== false && (!uf || x?.estado?.sigla === uf))?.inscricao_estadual || null;
    return {
      razao_social: a.razao_social, nome_fantasia: e.nome_fantasia, situacao: e.situacao_cadastral,
      logradouro: [e.tipo_logradouro, e.logradouro].filter(Boolean).join(' '), numero: e.numero, complemento: e.complemento, bairro: e.bairro,
      cep: e.cep, municipio: e.cidade?.nome, codigo_municipio: e.cidade?.ibge_id, uf, telefone: e.ddd1 && e.telefone1 ? `${e.ddd1}${e.telefone1}` : null, email: e.email, ie,
    };
  }],
  ['ReceitaWS', (c) => `https://receitaws.com.br/v1/cnpj/${c}`, (a) => (a.status === 'ERROR' ? { naoEncontrado: true } : {
    razao_social: a.nome, nome_fantasia: a.fantasia, situacao: a.situacao,
    logradouro: a.logradouro, numero: a.numero, complemento: a.complemento, bairro: a.bairro,
    cep: a.cep, municipio: a.municipio, codigo_municipio: null, uf: a.uf, telefone: a.telefone, email: a.email, ie: null,
  })],
];

function normalizar(r, cnpj, fonte) {
  const numero = limpo(r.numero);
  return {
    cnpj, cnpj_formatado: formatarCnpj(cnpj), fonte,
    razao_social: limpo(r.razao_social), nome_fantasia: limpo(r.nome_fantasia), situacao: limpo(r.situacao),
    logradouro: limpo(r.logradouro), numero: numero && !/^S\/?N$/i.test(numero) ? numero : (numero ? 'S/N' : null), complemento: limpo(r.complemento),
    bairro: limpo(r.bairro), cep: cep(r.cep), municipio: limpo(r.municipio), codigo_municipio: ibge(r.codigo_municipio), uf: limpo(r.uf)?.toUpperCase().slice(0, 2) || null,
    telefone: fone(r.telefone), email: email(r.email), ie: limpo(r.ie) ? soDigitos(r.ie) || limpo(r.ie) : null,
  };
}

// Junta: o 1º serviço que achou vale; campos que ele não trouxe (IBGE, IE) vêm dos outros, se já consultados.
async function consultarServicos(cnpj) {
  const erros = []; let naoAchou = 0; let base = null;
  for (const [nome, url, converter] of FONTES) {
    try {
      const bruto = await buscarJson(url(cnpj));
      const r = bruto.naoEncontrado ? bruto : converter(bruto);
      if (r.naoEncontrado) { naoAchou += 1; erros.push(`${nome}: não encontrado`); continue; }
      const n = normalizar(r, cnpj, nome);
      if (!n.razao_social) { erros.push(`${nome}: veio sem razão social`); continue; }
      if (!base) base = n;
      else for (const k of ['codigo_municipio', 'ie', 'telefone', 'email', 'nome_fantasia']) if (!base[k] && n[k]) base[k] = n[k];
      // Já tem o essencial (com IBGE): não precisa perguntar aos outros.
      if (base.municipio && base.codigo_municipio) break;
    } catch (err) { erros.push(`${nome}: ${err.message}`); }
  }
  if (base) return base;
  if (naoAchou === FONTES.length) return { naoEncontrado: true, erro: 'CNPJ não encontrado na Receita (em nenhum dos serviços de consulta).' };
  console.error('[cnpj] consulta falhou:', erros.join(' · '));
  return { falhou: true, erro: 'Os serviços de consulta da Receita não responderam agora. Preencha à mão ou tente de novo em alguns minutos.', detalhe: erros.join(' · ') };
}

// Cidade sem código IBGE (ReceitaWS): procura nas cidades que o sistema já conhece (clientes e CT-e).
const semAcento = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function completarIbge(d) {
  if (d.codigo_municipio || !d.municipio || !d.uf) return d;
  const { rows } = await pool.query(
    `SELECT DISTINCT cod, mun FROM (
       SELECT cod_municipio AS cod, municipio AS mun, uf FROM clientes
       UNION ALL SELECT dados->'remetente'->'endereco'->>'cMun', dados->'remetente'->'endereco'->>'xMun', dados->'remetente'->'endereco'->>'UF' FROM ctes_emitidos
       UNION ALL SELECT dados->'destinatario'->'endereco'->>'cMun', dados->'destinatario'->'endereco'->>'xMun', dados->'destinatario'->'endereco'->>'UF' FROM ctes_emitidos) x
      WHERE cod ~ '^[0-9]{7}$' AND UPPER(uf) = UPPER($1) LIMIT 5000`, [d.uf]).catch(() => ({ rows: [] }));
  const alvo = semAcento(d.municipio);
  const achou = rows.find((r) => semAcento(r.mun) === alvo);
  return achou ? { ...d, codigo_municipio: achou.cod } : d;
}

async function consultar(doc, { forcar = false } = {}) {
  const alfa = Doc.chars(doc);
  // CNPJ alfanumérico: os serviços públicos de consulta ainda não atendem; o cadastro é feito à mão.
  if (Doc.ehCnpjAlfanumerico(alfa)) {
    if (!Doc.cnpjValido(alfa)) throw Object.assign(new Error('CNPJ alfanumérico inválido: o dígito verificador não confere.'), { status: 400 });
    return { naoEncontrado: true, alfanumerico: true, cnpj: alfa, cnpj_formatado: Doc.formatar(alfa), erro: 'CNPJ alfanumérico: os serviços de consulta da Receita ainda não trazem esses dados. Preencha os campos à mão.' };
  }
  const cnpj = soDigitos(doc);
  if (cnpj.length !== 14) throw Object.assign(new Error('CNPJ precisa ter 14 dígitos.'), { status: 400 });
  if (!cnpjValido(cnpj)) throw Object.assign(new Error(`CNPJ inválido: o dígito verificador não confere (o certo seria ${formatarCnpj(cnpj.slice(0, 12) + digitosCnpj(cnpj.slice(0, 12)))}).`), { status: 400 });
  if (!forcar) {
    const { rows: [c] } = await pool.query(
      `SELECT dados FROM cnpj_consultas WHERE cnpj = $1 AND consultado_em > NOW() - (CASE WHEN dados ? 'naoEncontrado' THEN INTERVAL '1 day' ELSE INTERVAL '30 days' END)`, [cnpj]);
    if (c) return { ...c.dados, guardado: true };
  }
  let r = await consultarServicos(cnpj);
  if (r.falhou) return r;                                   // falha de rede não fica guardada
  if (!r.naoEncontrado) r = await completarIbge(r);
  await pool.query(`INSERT INTO cnpj_consultas (cnpj, dados) VALUES ($1, $2) ON CONFLICT (cnpj) DO UPDATE SET dados = EXCLUDED.dados, consultado_em = NOW()`, [cnpj, JSON.stringify(r)]);
  return r;
}

module.exports = { consultar, consultarServicos, normalizar, cnpjValido, cpfValido, digitosCnpj, formatarCnpj, FONTES };
