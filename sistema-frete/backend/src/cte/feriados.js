// Feriados para a previsão de entrega: os nacionais (fixos e os que mudam
// com a Páscoa) e os cadastrados (estaduais/municipais ou de folga da
// empresa), que valem para todo o país, uma UF ou uma cidade.
const pool = require('../db');
const { norm } = require('../roteirizacao/municipios');

const iso = (d) => d.toISOString().slice(0, 10);
const somarDias = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher).
function pascoa(ano) {
  const a = ano % 19; const b = Math.floor(ano / 100); const c = ano % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30; const i = Math.floor(c / 4); const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

// [{ data, descricao, tipo }] — tipo "nacional" ou "ponto facultativo" (Carnaval e Corpus Christi,
// que quase todo o comércio e as transportadoras não trabalham).
function feriadosNacionais(ano) {
  const p = pascoa(ano);
  const fixos = [['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'], ['09-07', 'Independência do Brasil'],
    ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'], ['11-15', 'Proclamação da República'], ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
    ['12-25', 'Natal']].map(([md, descricao]) => ({ data: `${ano}-${md}`, descricao, tipo: 'nacional' }));
  return [...fixos,
    { data: iso(somarDias(p, -48)), descricao: 'Carnaval (segunda)', tipo: 'ponto facultativo' },
    { data: iso(somarDias(p, -47)), descricao: 'Carnaval (terça)', tipo: 'ponto facultativo' },
    { data: iso(somarDias(p, -2)), descricao: 'Sexta-feira Santa', tipo: 'nacional' },
    { data: iso(somarDias(p, 60)), descricao: 'Corpus Christi', tipo: 'ponto facultativo' },
  ].sort((x, y) => x.data.localeCompare(y.data));
}

// Datas (Set "AAAA-MM-DD") sem entrega para um destino, entre dois anos.
async function feriadosDoDestino({ uf, cidade } = {}, anoInicial = new Date().getFullYear(), anos = 2) {
  const datas = new Set();
  for (let a = anoInicial; a < anoInicial + anos; a += 1) feriadosNacionais(a).forEach((f) => datas.add(f.data));
  const { rows } = await pool.query(
    `SELECT TO_CHAR(data, 'YYYY-MM-DD') AS data, uf, cidade, anual FROM feriados`).catch(() => ({ rows: [] }));
  rows.forEach((f) => {
    if (f.uf && String(f.uf).toUpperCase() !== String(uf || '').toUpperCase()) return;
    if (f.cidade && norm(f.cidade) !== norm(cidade)) return;
    if (f.anual) for (let a = anoInicial; a < anoInicial + anos; a += 1) datas.add(`${a}${f.data.slice(4)}`);
    else datas.add(f.data);
  });
  return datas;
}

module.exports = { pascoa, feriadosNacionais, feriadosDoDestino };
