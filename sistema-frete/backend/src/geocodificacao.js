const https = require('https');

// Busca a cidade/UF de um endereço usando o Nominatim (OpenStreetMap) — é
// gratuito e não precisa de chave de API, mas o resultado é "melhor esforço":
// nomes de rua se repetem em várias cidades do Brasil, então quem usa isso
// sempre vê o resultado antes de aplicar, nunca aplica sozinho sem confirmar.
function buscarCidadePorEndereco(endereco, uf) {
  return new Promise((resolve, reject) => {
    const consulta = uf ? `${endereco}, ${uf}, Brasil` : `${endereco}, Brasil`;
    const path = `/search?format=json&addressdetails=1&limit=3&countrycodes=br&q=${encodeURIComponent(consulta)}`;

    const req = https.request({
      hostname: 'nominatim.openstreetmap.org',
      path,
      method: 'GET',
      headers: { 'User-Agent': 'SistemaDeFretes/1.0 (uso interno)' },
    }, (res) => {
      let resposta = '';
      res.on('data', (chunk) => { resposta += chunk; });
      res.on('end', () => {
        try {
          const resultados = JSON.parse(resposta);
          const candidatos = resultados.map((r) => ({
            cidade: r.address?.city || r.address?.town || r.address?.municipality || r.address?.village || null,
            uf: r.address?.state_code || r.address?.['ISO3166-2-lvl4']?.replace('BR-', '') || null,
            enderecoCompleto: r.display_name,
          })).filter((c) => c.cidade);
          resolve(candidatos);
        } catch (err) {
          reject(new Error('Não foi possível interpretar a resposta da busca de endereço.'));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { buscarCidadePorEndereco };
