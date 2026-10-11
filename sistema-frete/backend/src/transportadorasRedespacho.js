// Transportadora de REDESPACHO cadastrada sozinha pelo CNPJ.
//
// A NF-e traz o redespacho nas informações complementares ("REDESPACHO: ...
// CNPJ: 12.345.678/0001-90 ..."). Se esse CNPJ não está em Cadastros »
// Transportadoras, o sistema cadastra e completa os dados (razão social,
// endereço, cidade/UF, CEP, telefone, e-mail) consultando o CNPJ na BrasilAPI.
// Com isso, a cidade até onde a transportadora contratada leva (a do
// redespacho) vem do CADASTRO — e não mais da leitura do texto da nota.
const pool = require('./db');

const CNPJ_REDESPACHO_RE = /REDESPACHO\s*:[^<]{0,250}?(?:CNPJ\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})|(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}))/i;
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const formatarCnpj = (d) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Dígitos verificadores do CNPJ. CNPJ digitado errado na nota (ex.: no "REDESPACHO:")
// é recusado por todos os serviços de consulta — confere antes e sugere o certo.
function digitosCnpj(base12) {
  const calc = (nums, pesos) => { const r = nums.reduce((s, n, i) => s + n * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  const n = base12.split('').map(Number);
  const d1 = calc(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${d1}${d2}`;
}
function cnpjValido(d) { return /^\d{14}$/.test(d) && !/^(\d)\1{13}$/.test(d) && digitosCnpj(d.slice(0, 12)) === d.slice(12); }
function sugestaoCnpj(d) { return formatarCnpj(d.slice(0, 12) + digitosCnpj(d.slice(0, 12))); }
const erroCnpjInvalido = (d) => `CNPJ inválido — o dígito verificador não confere (provavelmente digitado errado na nota). O correto deve ser ${sugestaoCnpj(d)}: corrija o CNPJ aqui e clique em "Completar pelo CNPJ".`;

const fila = [];
const naFila = new Set();
let processando = false;

const CABECALHOS = { 'User-Agent': 'Nexofrete (cadastro de transportadora pelo CNPJ)', Accept: 'application/json' };
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
  } finally {
    clearTimeout(timer);
  }
}
// Consulta o CNPJ em até 3 serviços públicos gratuitos, nessa ordem, e devolve
// sempre no mesmo formato: { razao_social, endereco, bairro, municipio, uf, cep, telefone, email }.
async function consultarCnpj(cnpj) {
  const erros = [];
  const fontes = [
    ['BrasilAPI', `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, (a) => ({
      razao_social: a.razao_social, nome_fantasia: a.nome_fantasia, endereco: [[a.descricao_tipo_de_logradouro, a.logradouro].filter(Boolean).join(' '), a.numero].filter(Boolean).join(', ') + (a.complemento ? ` - ${a.complemento}` : ''),
      bairro: a.bairro, municipio: a.municipio, uf: a.uf, cep: a.cep, telefone: a.ddd_telefone_1, email: a.email })],
    ['CNPJ.ws', `https://publica.cnpj.ws/cnpj/${cnpj}`, (a) => { const e = a.estabelecimento || {}; return {
      razao_social: a.razao_social, nome_fantasia: e.nome_fantasia, endereco: [[e.tipo_logradouro, e.logradouro].filter(Boolean).join(' '), e.numero].filter(Boolean).join(', ') + (e.complemento ? ` - ${e.complemento}` : ''),
      bairro: e.bairro, municipio: e.cidade?.nome, uf: e.estado?.sigla, cep: e.cep, telefone: e.ddd1 && e.telefone1 ? `${e.ddd1}${e.telefone1}` : null, email: e.email }; }],
    ['ReceitaWS', `https://receitaws.com.br/v1/cnpj/${cnpj}`, (a) => (a.status === 'ERROR' ? { naoEncontrado: true } : {
      razao_social: a.nome, nome_fantasia: a.fantasia, endereco: [a.logradouro, a.numero].filter(Boolean).join(', ') + (a.complemento ? ` - ${a.complemento}` : ''),
      bairro: a.bairro, municipio: a.municipio, uf: a.uf, cep: a.cep, telefone: a.telefone, email: a.email })],
  ];
  let naoEncontradoEm = 0;
  for (const [nome, url, converter] of fontes) {
    try {
      const bruto = await buscarJson(url);
      if (bruto.naoEncontrado) { naoEncontradoEm += 1; erros.push(`${nome}: CNPJ não encontrado`); continue; }
      const r = converter(bruto);
      if (r.naoEncontrado) { naoEncontradoEm += 1; erros.push(`${nome}: CNPJ não encontrado`); continue; }
      if (r.municipio) return { ...r, fonte: nome };
      erros.push(`${nome}: veio sem cidade`);
    } catch (err) {
      erros.push(`${nome}: ${err.message}`);
    }
  }
  if (naoEncontradoEm === fontes.length) return { naoEncontrado: true, erro: 'CNPJ não encontrado em nenhum serviço de consulta' };
  return { falhou: true, erro: erros.join(' · ') };
}


// ---------- Correção do CNPJ pela razão social ----------
// Usada quando o CNPJ da nota é inválido (dígito errado) ou não existe na
// Receita. A transportadora pode ter várias filiais: só aceita um CNPJ
// "parecido" com o da nota (mesma raiz, poucos dígitos diferentes) e com a
// razão social parecida com o nome da nota — nunca a primeira empresa que achar.
const PALAVRAS_COMUNS = new Set(['LTDA', 'ME', 'EPP', 'EIRELI', 'SA', 'S', 'A', 'E', 'DE', 'DO', 'DA', 'DOS', 'DAS', 'TRANSPORTES',
  'TRANSPORTE', 'TRANSPORTADORA', 'LOGISTICA', 'LOG', 'CARGAS', 'CARGA', 'RODOVIARIO', 'RODOVIARIA', 'COMERCIO', 'SERVICOS', 'SERVICO',
  'ARMAZENAMENTO', 'ARMAZENS', 'EXPRESS', 'EXPRESSO', 'ENCOMENDAS', 'DISTRIBUICAO', 'MULTIMODAL', 'INTERMODAL', 'E', 'CIA', 'FILIAL', 'MATRIZ',
  'UNIDADE', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR',
  'SC', 'SP', 'SE', 'TO']);
function palavrasDoNome(nome) {
  const todas = String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const fortes = todas.filter((p) => !PALAVRAS_COMUNS.has(p) && p.length >= 2);
  return fortes.length ? fortes : todas;
}
// 0 a 1: quanto os dois nomes se parecem (palavras "fortes" em comum).
function semelhancaNome(a, b) {
  const A = new Set(palavrasDoNome(a)); const B = new Set(palavrasDoNome(b));
  if (!A.size || !B.size) return 0;
  let comum = 0; A.forEach((p) => { if (B.has(p)) comum += 1; });
  return comum / Math.max(A.size, B.size);
}
// Quantos dígitos diferem nos 12 primeiros (raiz + filial).
const distanciaCnpj = (a, b) => { let n = 0; for (let i = 0; i < 12; i++) if (a[i] !== b[i]) n += 1; return n; };

async function corrigirCnpj(d, nome, excluirId) {
  if (!nome) return null;
  // 1) No próprio sistema: cadastro de transportadoras e emitentes dos CT-e recebidos
  //    (o CNPJ do XML do CT-e é sempre válido). Nome parecido + CNPJ mais próximo.
  const { rows } = await pool.query(
    `SELECT DISTINCT REGEXP_REPLACE(transportadora_cnpj_cte, '[^0-9]', '', 'g') AS cnpj, transportadora_cte AS nome
       FROM fretes WHERE transportadora_cnpj_cte IS NOT NULL AND transportadora_cte IS NOT NULL
     UNION
     SELECT REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g'), razao_social FROM transportadoras WHERE cnpj IS NOT NULL AND id <> $1
     UNION
     SELECT REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g'), nome_fantasia FROM transportadoras WHERE cnpj IS NOT NULL AND NULLIF(nome_fantasia, '') IS NOT NULL AND id <> $1`, [excluirId || 0]);
  const parecidos = rows.filter((r) => cnpjValido(r.cnpj) && r.cnpj !== d && semelhancaNome(nome, r.nome) >= 0.6)
    .map((r) => ({ ...r, dist: distanciaCnpj(r.cnpj, d), mesmaRaiz: r.cnpj.slice(0, 8) === d.slice(0, 8), mesmaFilial: r.cnpj.slice(8, 12) === d.slice(8, 12) }));
  // Só escolhe sozinho um CNPJ da MESMA FILIAL da nota (dígitos 9 a 12 iguais):
  // mesma raiz, ou raiz com até 2 dígitos trocados. Nunca troca de filial sozinho.
  const locais = parecidos.filter((r) => r.mesmaFilial && (r.mesmaRaiz || r.dist <= 2)).sort((x, y) => x.dist - y.dist);
  if (locais.length) {
    return { cnpj: locais[0].cnpj, nome: locais[0].nome, confirmado: true,
      metodo: `pelo nome "${locais[0].nome}", achado ${locais[0].mesmaRaiz ? 'com a mesma raiz e filial' : 'com a mesma filial e CNPJ quase igual'} nos CT-e/cadastros do sistema (${locais[0].dist} dígito(s) diferente(s))` };
  }
  // A empresa é conhecida, mas com OUTRA filial: avisa quais, sem escolher.
  const outrasFiliais = [...new Map(parecidos.filter((r) => r.mesmaRaiz && !r.mesmaFilial).map((r) => [r.cnpj, r])).values()];
  // 2) Só os dígitos verificadores errados: mesmo número com o final corrigido.
  const corrigido = d.slice(0, 12) + digitosCnpj(d.slice(0, 12));
  if (corrigido !== d) {
    const api = await consultarCnpj(corrigido).catch(() => null);
    if (api && !api.falhou && !api.naoEncontrado && semelhancaNome(nome, api.razao_social) >= 0.6) {
      return { cnpj: corrigido, nome: api.razao_social, api, confirmado: true, metodo: 'só os dígitos verificadores estavam errados (a razão social confere)' };
    }
  }
  if (outrasFiliais.length) {
    return { cnpj: null, confirmado: false, nome: outrasFiliais[0].nome,
      aviso: `A empresa parece ser a ${outrasFiliais[0].nome}, mas o sistema só conhece outra(s) filial(is) dela: ${outrasFiliais.slice(0, 5).map((r) => formatarCnpj(r.cnpj)).join(', ')} — nenhuma é a filial ${d.slice(8, 12)} do CNPJ da nota (${formatarCnpj(d)}). Confirme o CNPJ certo com a transportadora; a cidade não foi preenchida para não pegar a de outra filial.` };
  }
  // 3) Matriz da mesma raiz: confirma a EMPRESA, mas não a filial — não preenche cidade.
  const matriz = d.slice(0, 8) + '0001' + digitosCnpj(d.slice(0, 8) + '0001');
  if (matriz !== d && matriz !== corrigido) {
    const api = await consultarCnpj(matriz).catch(() => null);
    if (api && !api.falhou && !api.naoEncontrado && semelhancaNome(nome, api.razao_social) >= 0.6) {
      return { cnpj: null, confirmado: false, nome: api.razao_social,
        aviso: `A empresa é a ${api.razao_social} (raiz confirmada pela matriz ${formatarCnpj(matriz)}, em ${api.municipio || '?'}/${api.uf || '?'}), mas a filial do CNPJ da nota (${formatarCnpj(d)}) não confere. Confirme com a transportadora o CNPJ da filial que faz o redespacho — a cidade não foi preenchida para não pegar a de outra filial.` };
    }
  }
  return null;
}

// Aplica a correção no cadastro: CNPJ certo, o errado como alternativo, observação.
async function aplicarCorrecao(t, dErrado, correcao) {
  const certo = correcao.cnpj;
  const { rows: outra } = await pool.query(
    `SELECT id, razao_social FROM transportadoras WHERE REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g') = $1 AND id <> $2 LIMIT 1`, [certo, t.id]);
  const nota = `CNPJ corrigido automaticamente: a nota trazia ${formatarCnpj(dErrado)}; o certo é ${formatarCnpj(certo)} — ${correcao.metodo}.`;
  if (outra[0]) {
    // Já existe a transportadora com o CNPJ certo: o CNPJ errado vira alternativo dela;
    // esta (cadastrada sozinha pela nota, sem tabela de preço) é removida para não ficar repetida.
    await pool.query(`UPDATE transportadoras SET cnpj_alternativos = CONCAT_WS(',', NULLIF(cnpj_alternativos, ''), $2::text) WHERE id = $1`, [outra[0].id, dErrado]);
    const { rows: usada } = await pool.query('SELECT 1 FROM tabelas_preco WHERE transportadora_id = $1 LIMIT 1', [t.id]);
    if (!usada.length) await pool.query(`DELETE FROM transportadoras WHERE id = $1 AND eh_redespacho AND observacoes LIKE 'Cadastrada sozinha:%'`, [t.id]).catch(() => {});
    return { id: outra[0].id, juntada: true };
  }
  await pool.query(
    `UPDATE transportadoras SET cnpj = $2, cnpj_alternativos = CONCAT_WS(',', NULLIF(cnpj_alternativos, ''), $3::text),
            observacoes = CONCAT_WS(E'\n', NULLIF(observacoes, ''), $4::text), cadastro_erro = NULL, cadastro_consultado_em = NULL
      WHERE id = $1`, [t.id, formatarCnpj(certo), dErrado, nota]);
  return { id: t.id };
}

// Cadastra (se não existir) e completa os dados pelo CNPJ.
async function garantir(cnpj, nomeDaNota, { forcar = false } = {}) {
  const d = soDigitos(cnpj);
  if (d.length !== 14) return null;
  // Mesmo CNPJ, ou mesma raiz + filial (12 primeiros dígitos): a nota pode trazer o
  // CNPJ com o dígito verificador errado e o cadastro já estar corrigido.
  const { rows } = await pool.query(
    `SELECT id, razao_social, cnpj, municipio, cadastro_consultado_em FROM transportadoras
      WHERE REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g') = $1
         OR LEFT(REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g'), 12) = LEFT($1, 12)
         OR ($1 = ANY(STRING_TO_ARRAY(COALESCE(cnpj_alternativos, ''), ',')))
      ORDER BY (REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g') = $1) DESC LIMIT 1`, [d]);
  let t = rows[0];
  if (!t) {
    const nome = String(nomeDaNota || '').replace(/\s*CNPJ[\s\S]*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 150) || `Transportadora ${formatarCnpj(d)}`;
    const ins = await pool.query(
      `INSERT INTO transportadoras (razao_social, cnpj, eh_redespacho, observacoes) VALUES ($1, $2, TRUE, $3)
       ON CONFLICT DO NOTHING RETURNING id, razao_social, municipio, cadastro_consultado_em`,
      [nome, formatarCnpj(d), 'Cadastrada sozinha: transportadora de redespacho informada numa NF-e.']);
    t = ins.rows[0];
    if (!t) return null;
  }
  // Já tem cidade, ou já consultou nos últimos 30 dias: não consulta de novo.
  if (!forcar && (t.municipio || (t.cadastro_consultado_em && Date.now() - new Date(t.cadastro_consultado_em).getTime() < 30 * 86400000))) return t.id;
  // O cadastro já está com o CNPJ certo (a nota é que traz o errado): usa o do cadastro.
  const doCadastro = soDigitos(t.cnpj);
  if (doCadastro.length === 14 && doCadastro !== d && cnpjValido(doCadastro)) return garantir(doCadastro, nomeDaNota, { forcar });
  if (!cnpjValido(d)) {
    const r = await tentarCorrigir(t, d, nomeDaNota, forcar, erroCnpjInvalido(d));
    if (r) return r;
    return t.id;
  }
  try {
    const api = await consultarCnpj(d);
    if (api.naoEncontrado) {
      const r = await tentarCorrigir(t, d, nomeDaNota, forcar, api.erro);
      if (r) return r;
      return t.id;
    }
    if (api.falhou) {
      await pool.query(`UPDATE transportadoras SET cadastro_erro = $2${api.naoEncontrado ? ', cadastro_consultado_em = NOW()' : ''} WHERE id = $1`, [t.id, api.erro]);
      if (api.falhou) throw new Error(api.erro);
      return t.id;
    }
    const endereco = api.endereco || '';
    await pool.query(
      `UPDATE transportadoras SET
          razao_social = CASE WHEN observacoes LIKE 'Cadastrada sozinha:%' AND $2::text IS NOT NULL THEN $2 ELSE razao_social END,
          endereco = COALESCE(NULLIF(endereco, ''), $3), bairro = COALESCE(NULLIF(bairro, ''), $4),
          municipio = COALESCE(NULLIF(municipio, ''), $5), uf = COALESCE(NULLIF(uf, ''), $6), cep = COALESCE(NULLIF(cep, ''), $7),
          telefone = COALESCE(NULLIF(telefone, ''), $8), email = COALESCE(NULLIF(email, ''), $9),
          nome_fantasia = COALESCE(NULLIF(nome_fantasia, ''), $10),
          cadastro_consultado_em = NOW(), cadastro_erro = NULL
        WHERE id = $1`,
      [t.id, api.razao_social || null, endereco.trim() || null, api.bairro || null, api.municipio || null, api.uf || null,
       api.cep ? soDigitos(api.cep) : null, api.telefone ? soDigitos(api.telefone) : null, api.email || null,
       (api.nome_fantasia && String(api.nome_fantasia).trim() && !/^\*+$/.test(String(api.nome_fantasia).trim())) ? String(api.nome_fantasia).trim().slice(0, 150) : null]);
    cacheCidades.quando = 0;   // a cidade nova vale já no próximo cálculo
  } catch (err) {
    console.error(`[redespacho] Não consegui consultar o CNPJ ${formatarCnpj(d)}:`, err.message);
    if (forcar) throw err;
    return { id: t.id, falhou: true };
  }
  return t.id;
}

// CNPJ inválido ou inexistente: tenta achar o certo pela razão social. Se achar,
// corrige o cadastro e completa os dados pelo CNPJ certo; se só confirmar a
// empresa (não a filial), avisa sem preencher a cidade.
async function tentarCorrigir(t, d, nomeDaNota, forcar, erroOriginal) {
  const nome = (t.razao_social && !/^Transportadora \d/.test(t.razao_social)) ? t.razao_social : nomeDaNota;
  const correcao = await corrigirCnpj(d, nome, t.id).catch((e) => { console.error('[redespacho] correção do CNPJ:', e.message); return null; });
  if (correcao?.confirmado) {
    const r = await aplicarCorrecao(t, d, correcao);
    console.log(`[redespacho] CNPJ ${formatarCnpj(d)} corrigido para ${formatarCnpj(correcao.cnpj)} (${correcao.metodo}).`);
    return garantir(correcao.cnpj, nome, { forcar }).then(() => r.id);
  }
  const msg = correcao?.aviso || `${erroOriginal}${nome ? ' Também não achei, pelo nome, uma transportadora com CNPJ parecido.' : ''}`;
  await pool.query('UPDATE transportadoras SET cadastro_erro = $2, cadastro_consultado_em = NOW() WHERE id = $1', [t.id, msg]);
  if (forcar) throw new Error(msg);
  return null;
}

// Fila: uma consulta por vez, com intervalo (a BrasilAPI limita a frequência).
function enfileirar(cnpj, nome, tentativa = 1) {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || naFila.has(d)) return;
  naFila.add(d);
  fila.push({ cnpj: d, nome, tentativa });
  processar();
}
async function processar() {
  if (processando) return;
  processando = true;
  try {
    while (fila.length) {
      const { cnpj, nome, tentativa, forcar } = fila.shift();
      let r = null;
      try { r = await garantir(cnpj, nome, { forcar: !!forcar }); } catch (err) { console.error('[redespacho]', err.message); }
      naFila.delete(cnpj);
      // Os serviços de consulta falharam (limite, fora do ar): tenta de novo em 10 min, até 5 vezes.
      if (r?.falhou && tentativa < 5) setTimeout(() => enfileirar(cnpj, nome, tentativa + 1), 10 * 60 * 1000);
      await esperar(3000);
    }
  } finally {
    processando = false;
  }
}

// Nota importada agora: pega o CNPJ do redespacho (grava na nota) e põe na fila.
async function daNota(freteId, dados) {
  const m = String(dados?.infCpl || '').match(CNPJ_REDESPACHO_RE);
  if (!m) return;
  const cnpj = soDigitos(m[1] || m[2]);
  await pool.query('UPDATE fretes SET redespacho_cnpj = $2 WHERE id = $1 AND redespacho_cnpj IS NULL', [freteId, cnpj]).catch(() => {});
  enfileirar(cnpj, dados.redespacho);
}

// Ao ligar: redespachos das notas que já estão no banco e ainda sem cadastro (ou sem cidade).
async function completarAntigos() {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (f.redespacho_cnpj) f.redespacho_cnpj, f.redespacho FROM fretes f
        WHERE f.redespacho_cnpj ~ '^[0-9]{14}$'
          AND NOT EXISTS (SELECT 1 FROM transportadoras t WHERE REGEXP_REPLACE(COALESCE(t.cnpj, ''), '[^0-9]', '', 'g') = f.redespacho_cnpj
                            AND (NULLIF(t.municipio, '') IS NOT NULL OR t.cadastro_consultado_em > NOW() - INTERVAL '30 days'))
        ORDER BY f.redespacho_cnpj, f.id DESC LIMIT 500`);
    rows.forEach((r) => enfileirar(r.redespacho_cnpj, r.redespacho));
    if (rows.length) console.log(`[redespacho] Cadastrando/completando ${rows.length} transportadora(s) de redespacho pelo CNPJ (em segundo plano).`);
  } catch (err) {
    console.error('[redespacho]', err.message);
  }
}

// Cidade/UF do cadastro de cada CNPJ (usado no cálculo do frete). Guardado por 5 min.
const cacheCidades = { quando: 0, mapa: null };
async function cidadesPorCnpj() {
  if (cacheCidades.mapa && Date.now() - cacheCidades.quando < 300000) return cacheCidades.mapa;
  const { rows } = await pool.query(
    `SELECT REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') AS cnpj, razao_social, municipio, uf, cnpj_alternativos FROM transportadoras
      WHERE NULLIF(municipio, '') IS NOT NULL AND LENGTH(REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g')) = 14`);
  cacheCidades.mapa = new Map();
  rows.forEach((r) => {
    const v = { municipio: r.municipio, uf: r.uf, nome: r.razao_social };
    cacheCidades.mapa.set(r.cnpj, v);
    String(r.cnpj_alternativos || '').split(',').map(soDigitos).filter((c) => c.length === 14).forEach((c) => cacheCidades.mapa.set(c, v));
    if (!cacheCidades.mapa.has(`raiz:${r.cnpj.slice(0, 12)}`)) cacheCidades.mapa.set(`raiz:${r.cnpj.slice(0, 12)}`, v);
  });
  cacheCidades.quando = Date.now();
  return cacheCidades.mapa;
}

// Botão "Completar pelo CNPJ" (uma transportadora, na hora) e "Completar todas" (fila).
async function completarAgora(id, cnpjDigitado = null) {
  const novo = soDigitos(cnpjDigitado);
  if (novo.length === 14 && cnpjValido(novo)) {
    try {
      await pool.query('UPDATE transportadoras SET cnpj = $2 WHERE id = $1 AND REGEXP_REPLACE(COALESCE(cnpj, \'\'), \'[^0-9]\', \'\', \'g\') <> $3',
        [id, formatarCnpj(novo), novo]);
    } catch (err) {
      if (err.code === '23505') throw new Error(`já existe outra transportadora cadastrada com o CNPJ ${formatarCnpj(novo)} — use aquela (e exclua esta, se for repetida).`);
      throw err;
    }
  }
  const { rows } = await pool.query('SELECT id, cnpj, razao_social FROM transportadoras WHERE id = $1', [id]);
  if (!rows[0]) throw new Error('Transportadora não encontrada.');
  if (soDigitos(rows[0].cnpj).length !== 14) throw new Error('Essa transportadora não tem um CNPJ completo cadastrado.');
  await garantir(rows[0].cnpj, rows[0].razao_social, { forcar: true });
  const { rows: atual } = await pool.query('SELECT * FROM transportadoras WHERE id = $1', [id]);
  return atual[0];
}
async function completarTodas() {
  const { rows } = await pool.query(
    `SELECT cnpj, razao_social FROM transportadoras
      WHERE LENGTH(REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g')) = 14
        AND (NULLIF(municipio, '') IS NULL OR (eh_redespacho AND NULLIF(nome_fantasia, '') IS NULL))`);
  rows.forEach((r) => { const d = soDigitos(r.cnpj); naFila.delete(d); fila.push({ cnpj: d, nome: r.razao_social, tentativa: 1, forcar: true }); naFila.add(d); });
  processar();
  return rows.length;
}

// Cadastro do redespacho pelo CNPJ da nota: exato, ou pela raiz + filial (dígito errado na nota).
function cidadeDoCnpj(mapa, cnpj) {
  const d = soDigitos(cnpj);
  if (!mapa || d.length !== 14) return null;
  return mapa.get(d) || mapa.get(`raiz:${d.slice(0, 12)}`) || null;
}

module.exports = { semelhancaNome, corrigirCnpj, cidadeDoCnpj, cnpjValido, daNota, completarAntigos, cidadesPorCnpj, garantir, completarAgora, completarTodas, CNPJ_REDESPACHO_RE };
