// Serviço de mapas de mentira (Nominatim + OSRM) para testar sem internet.
// Endereço → centro do município + um deslocamento pequeno pela rua;
// tempos e distâncias pela linha reta (× 1,25, a 50 km/h).
const http = require('http');
const { municipio, distanciaKm } = require('../../src/roteirizacao/municipios');

function iniciar(porta = 0) {
  const pedidos = [];
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    pedidos.push(url.pathname);
    const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (url.pathname === '/search') {
      const m = municipio({ cidade: url.searchParams.get('city'), uf: url.searchParams.get('state') });
      if (!m || /INEXISTENTE/i.test(url.searchParams.get('street') || '')) return json([]);
      const h = [...(url.searchParams.get('street') || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
      return json([{ lat: String(m.lat + ((h % 40) - 20) / 1000), lon: String(m.lon + ((h % 30) - 15) / 1000) }]);
    }
    const coords = decodeURIComponent(url.pathname.split('/').pop()).split(';').map((c) => { const [lon, lat] = c.split(',').map(Number); return { lat, lon }; });
    if (url.pathname.startsWith('/table/v1/driving/')) {
      const dist = coords.map((a) => coords.map((b) => distanciaKm(a, b) * 1.25 * 1000));
      return json({ code: 'Ok', distances: dist, durations: dist.map((l) => l.map((m) => (m / 1000 / 50) * 3600)) });
    }
    if (url.pathname.startsWith('/route/v1/driving/')) {
      return json({ code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates: coords.map((c) => [c.lon, c.lat]) } }] });
    }
    res.writeHead(404); res.end();
    return null;
  });
  return new Promise((ok) => srv.listen(porta, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${srv.address().port}`, pedidos, fechar: () => new Promise((r) => srv.close(r)) })));
}
module.exports = { iniciar };
if (require.main === module) iniciar(Number(process.argv[2]) || 3997).then((s) => console.log(`mapa de mentira em ${s.url}`));
