// Serviços de mapa da roteirização:
// - geocodificar: endereço → coordenadas (OpenStreetMap/Nominatim, com cache no
//   banco); sem achar, o centro do município (base local, funciona offline).
// - matriz: tempo e distância entre todos os pontos — OSRM (gratuito, carro,
//   com um fator para caminhão), OpenRouteService (chave grátis, perfil
//   caminhão) ou estimativa pela distância em linha reta.
// - geometria: o desenho da rota no mapa, quando o serviço devolve.
const pool = require('../db');
const { municipio, distanciaKm, norm } = require('./municipios');

const PADRAO = {
  provedor: 'osrm', osrm_url: 'https://router.project-osrm.org', ors_url: 'https://api.openrouteservice.org', ors_chave: null,
  nominatim_url: 'https://nominatim.openstreetmap.org', geocodificar_endereco: true, fator_caminhao: 1.25, velocidade_estimada: 55,
  mapa_url: null,
};

async function configuracao() {
  const { rows } = await pool.query('SELECT * FROM configuracao_roteirizacao WHERE id = 1').catch(() => ({ rows: [] }));
  const c = { ...PADRAO };
  Object.entries(rows[0] || {}).forEach(([k, v]) => { if (v != null && k in PADRAO) c[k] = v; });
  c.fator_caminhao = Number(c.fator_caminhao) || 1; c.velocidade_estimada = Number(c.velocidade_estimada) || 55;
  return c;
}

async function pedirJson(url, opcoes = {}, tempo = 12000) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), tempo);
  try {
    const r = await fetch(url, { ...opcoes, signal: controle.signal, headers: { 'User-Agent': 'Nexofrete/1.0 (roteirizacao)', ...(opcoes.headers || {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

// ---------- Geocodificação ----------
let ultimaConsulta = 0;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// A política do Nominatim pede no máximo 1 consulta por segundo.
async function nominatim(cfg, e) {
  const espera = ultimaConsulta + 1100 - Date.now();
  if (espera > 0) await esperar(espera);
  ultimaConsulta = Date.now();
  const p = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'br',
    street: [e.nro, e.xLgr].filter(Boolean).join(' '), city: e.xMun || '', state: e.UF || '', country: 'Brasil' });
  if (/^\d{8}$/.test(String(e.CEP || ''))) p.set('postalcode', `${e.CEP.slice(0, 5)}-${e.CEP.slice(5)}`);
  const r = await pedirJson(`${cfg.nominatim_url}/search?${p}`, {}, 8000);
  return r[0] ? { lat: Number(r[0].lat), lon: Number(r[0].lon) } : null;
}

// e: { xLgr, nro, xBairro, xMun, UF, CEP, cMun }. Devolve { lat, lon, precisao: 'endereco'|'cidade', fonte }.
async function geocodificar(e, cfg) {
  const mun = municipio({ ibge: e.cMun, cidade: e.xMun, uf: e.UF });
  const chave = norm([e.xLgr, e.nro, e.xBairro, e.xMun, e.UF, e.CEP].filter(Boolean).join(' '));
  if (e.xLgr && cfg.geocodificar_endereco) {
    const { rows } = await pool.query('SELECT lat, lon, achado FROM geocodificacao_cache WHERE chave = $1', [chave]).catch(() => ({ rows: [] }));
    if (rows[0]?.achado) return { lat: Number(rows[0].lat), lon: Number(rows[0].lon), precisao: 'endereco', fonte: 'cache' };
    if (!rows[0]) {
      let ponto = null;
      try { ponto = await nominatim(cfg, e); } catch { ponto = undefined; }   // undefined = falhou (não guarda)
      // Resultado longe da cidade é engano (rua com o mesmo nome em outro lugar).
      if (ponto && mun && distanciaKm(ponto, mun) > 60) ponto = null;
      if (ponto !== undefined) {
        await pool.query(`INSERT INTO geocodificacao_cache (chave, lat, lon, achado) VALUES ($1, $2, $3, $4)
          ON CONFLICT (chave) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon, achado = EXCLUDED.achado, criado_em = NOW()`,
        [chave, ponto?.lat ?? null, ponto?.lon ?? null, !!ponto]).catch(() => {});
      }
      if (ponto) return { ...ponto, precisao: 'endereco', fonte: 'OpenStreetMap' };
    }
  }
  if (mun) return { lat: mun.lat, lon: mun.lon, precisao: 'cidade', fonte: 'centro do município' };
  return null;
}

// ---------- Matriz de tempo (min) e distância (km) ----------
function estimada(pontos, cfg) {
  const dist = pontos.map((a) => pontos.map((b) => Math.round(distanciaKm(a, b) * 1.3 * 10) / 10));   // ruas não são em linha reta
  const dur = dist.map((linha) => linha.map((km) => {
    if (!km) return 0;
    const vel = km < 10 ? 25 : km < 50 ? 40 : cfg.velocidade_estimada;
    return Math.round((km / vel) * 60 + 5);
  }));
  return { dur, dist, fonte: 'estimativa (linha reta × 1,3)' };
}

async function matriz(pontos, cfg) {
  try {
    if (cfg.provedor === 'ors' && cfg.ors_chave) {
      const r = await pedirJson(`${cfg.ors_url}/v2/matrix/driving-hgv`, {
        method: 'POST', headers: { Authorization: cfg.ors_chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: pontos.map((p) => [p.lon, p.lat]), metrics: ['distance', 'duration'], units: 'km' }),
      }, 30000);
      return { dur: r.durations.map((l) => l.map((s) => Math.round((s || 0) / 60))), dist: r.distances.map((l) => l.map((k) => Math.round((k || 0) * 10) / 10)),
        fonte: 'OpenRouteService (perfil caminhão)' };
    }
    if (cfg.provedor === 'osrm') {
      const coords = pontos.map((p) => `${p.lon},${p.lat}`).join(';');
      const r = await pedirJson(`${cfg.osrm_url}/table/v1/driving/${coords}?annotations=duration,distance`, {}, 30000);
      if (r.code !== 'Ok') throw new Error(r.code);
      return { dur: r.durations.map((l) => l.map((s) => Math.round(((s || 0) / 60) * cfg.fator_caminhao))),
        dist: r.distances.map((l) => l.map((m) => Math.round((m || 0) / 100) / 10)), fonte: `OSRM (ruas; tempo × ${cfg.fator_caminhao} para caminhão)` };
    }
  } catch (e) {
    const est = estimada(pontos, cfg);
    return { ...est, fonte: `${est.fonte} — o serviço de rotas não respondeu (${e.message})` };
  }
  return estimada(pontos, cfg);
}

// Desenho da rota (lista de [lat, lon]) na ordem final; null se o serviço não der.
async function geometria(pontos, cfg) {
  try {
    if (cfg.provedor === 'ors' && cfg.ors_chave) {
      const r = await pedirJson(`${cfg.ors_url}/v2/directions/driving-hgv/geojson`, {
        method: 'POST', headers: { Authorization: cfg.ors_chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: pontos.map((p) => [p.lon, p.lat]) }),
      }, 30000);
      return r.features[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    }
    if (cfg.provedor === 'osrm') {
      const coords = pontos.map((p) => `${p.lon},${p.lat}`).join(';');
      const r = await pedirJson(`${cfg.osrm_url}/route/v1/driving/${coords}?overview=simplified&geometries=geojson`, {}, 30000);
      return r.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    }
  } catch { /* sem desenho: a tela liga os pontos em linha reta */ }
  return null;
}

module.exports = { configuracao, geocodificar, matriz, geometria, estimada, PADRAO };
