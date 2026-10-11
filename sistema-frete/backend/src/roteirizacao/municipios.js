// Coordenadas (centro) de todos os municípios do Brasil, pelo código IBGE ou
// pelo nome + UF. Serve de plano B quando o endereço não é achado no mapa e
// funciona sem internet. Base: kelvins/municipios-brasileiros (licença MIT).
const base = require('./municipios.json');

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const porIbge = new Map();
const porNome = new Map();
for (const [ibge, nome, uf, lat, lon] of base.municipios) {
  const m = { ibge: String(ibge), nome, uf, lat, lon };
  porIbge.set(m.ibge, m);
  porNome.set(`${norm(nome)}|${uf}`, m);
}

function municipio({ ibge, cidade, uf } = {}) {
  const cod = String(ibge || '').replace(/\D/g, '');
  if (cod.length === 7 && porIbge.has(cod)) return porIbge.get(cod);
  if (cidade && uf) return porNome.get(`${norm(cidade)}|${String(uf).toUpperCase()}`) || null;
  return null;
}

// Distância em linha reta (km) entre dois pontos {lat, lon}.
function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

module.exports = { municipio, distanciaKm, norm };
