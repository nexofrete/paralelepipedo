// Cidade pelo CEP, para endereço escrito sem a cidade ("Rua X, 174, Bairro Cocota - CEP 21921025").
//  1. Na hora, sem internet: as faixas de CEP das capitais (Correios). Ex.: 20000-000 a 23799-999 = Rio de Janeiro/RJ.
//  2. Fora das capitais: consulta na BrasilAPI (o mesmo serviço da consulta de CNPJ), guardada em cep_consultas
//     (encontrado: para sempre; não encontrado: 7 dias) para não consultar de novo.
const pool = require('./db');

// [início, fim, cidade, UF] — faixas das capitais (as partes centrais, para não errar nas bordas).
const CAPITAIS = [
  ['01000000', '05999999', 'São Paulo', 'SP'], ['08000000', '08499999', 'São Paulo', 'SP'],
  ['20000000', '23799999', 'Rio de Janeiro', 'RJ'], ['30000000', '31999999', 'Belo Horizonte', 'MG'],
  ['29000000', '29099999', 'Vitória', 'ES'], ['80000000', '82999999', 'Curitiba', 'PR'],
  ['88000000', '88099999', 'Florianópolis', 'SC'], ['90000000', '91999999', 'Porto Alegre', 'RS'],
  ['79000000', '79129999', 'Campo Grande', 'MS'], ['78000000', '78109999', 'Cuiabá', 'MT'],
  ['74000000', '74899999', 'Goiânia', 'GO'], ['70000000', '72799999', 'Brasília', 'DF'], ['73000000', '73699999', 'Brasília', 'DF'],
  ['40000000', '42599999', 'Salvador', 'BA'], ['49000000', '49098999', 'Aracaju', 'SE'], ['57000000', '57099999', 'Maceió', 'AL'],
  ['50000000', '52999999', 'Recife', 'PE'], ['58000000', '58099999', 'João Pessoa', 'PB'], ['59000000', '59139999', 'Natal', 'RN'],
  ['60000000', '61599999', 'Fortaleza', 'CE'], ['64000000', '64099999', 'Teresina', 'PI'], ['65000000', '65109999', 'São Luís', 'MA'],
  ['66000000', '66999999', 'Belém', 'PA'], ['68900000', '68914999', 'Macapá', 'AP'], ['69000000', '69099999', 'Manaus', 'AM'],
  ['69300000', '69339999', 'Boa Vista', 'RR'], ['69900000', '69924999', 'Rio Branco', 'AC'], ['76800000', '76834999', 'Porto Velho', 'RO'],
  ['77000000', '77299999', 'Palmas', 'TO'],
];
function capitalDoCep(cep) {
  const d = String(cep || '').replace(/\D/g, '');
  if (d.length !== 8) return null;
  const f = CAPITAIS.find(([a, b]) => d >= a && d <= b);
  return f ? { cidade: f[2], uf: f[3] } : null;
}

async function buscar(cep) {
  const d = String(cep || '').replace(/\D/g, '');
  if (d.length !== 8) return null;
  const { rows: [g] } = await pool.query('SELECT cidade, uf, bairro, rua, nao_encontrado, consultado_em FROM cep_consultas WHERE cep = $1', [d]);
  if (g && (!g.nao_encontrado || Date.now() - new Date(g.consultado_em).getTime() < 7 * 86400000)) return g.nao_encontrado ? null : g;
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 10000);
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${d}`, { headers: { 'User-Agent': 'Nexofrete (endereço de entrega)', Accept: 'application/json' }, signal: controle.signal });
    if (r.status === 404) {
      await pool.query(`INSERT INTO cep_consultas (cep, nao_encontrado) VALUES ($1, TRUE) ON CONFLICT (cep) DO UPDATE SET nao_encontrado = TRUE, consultado_em = NOW()`, [d]);
      return null;
    }
    if (!r.ok) return null;   // fora do ar / limite: tenta de novo na próxima vez
    const j = await r.json();
    if (!j?.city || !j?.state) return null;
    const v = { cidade: String(j.city), uf: String(j.state).toUpperCase(), bairro: j.neighborhood || null, rua: j.street || null };
    await pool.query(`INSERT INTO cep_consultas (cep, cidade, uf, bairro, rua) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (cep) DO UPDATE SET cidade = EXCLUDED.cidade, uf = EXCLUDED.uf, bairro = EXCLUDED.bairro, rua = EXCLUDED.rua, nao_encontrado = FALSE, consultado_em = NOW()`,
    [d, v.cidade, v.uf, v.bairro, v.rua]);
    return v;
  } catch { return null; } finally { clearTimeout(timer); }
}

module.exports = { capitalDoCep, buscar, CAPITAIS };
