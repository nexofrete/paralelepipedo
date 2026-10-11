// Serviços de mapa contra o serviço de mentira (sem banco: o cache falha em silêncio).
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const original = Module._load;
Module._load = function carregar(nome, ...resto) {
  if (nome === '../db') return { query: async () => { throw new Error('sem banco'); } };
  return original.call(this, nome, ...resto);
};
const mapa = require('../../src/roteirizacao/servicosMapa');
const falso = require('./mapaFalso');

test('geocodifica pelo endereço, cai para o centro da cidade e calcula a matriz', async () => {
  const s = await falso.iniciar();
  try {
    const cfg = { ...mapa.PADRAO, osrm_url: s.url, nominatim_url: s.url };
    const a = await mapa.geocodificar({ xLgr: 'RUA DAS FLORES', nro: '10', xMun: 'CAMPINAS', UF: 'SP' }, cfg);
    assert.strictEqual(a.precisao, 'endereco');
    const b = await mapa.geocodificar({ xLgr: 'RUA INEXISTENTE', nro: '1', xMun: 'SAO PAULO', UF: 'SP' }, cfg);
    assert.strictEqual(b.precisao, 'cidade');
    const c = await mapa.geocodificar({ xMun: 'Rio de Janeiro', UF: 'RJ' }, cfg);
    assert.strictEqual(c.precisao, 'cidade');
    const m = await mapa.matriz([a, b, c], cfg);
    assert.match(m.fonte, /OSRM/);
    assert.ok(m.dist[0][1] > 100 && m.dist[0][1] < 150, `Campinas→SP ${m.dist[0][1]} km`);
    assert.strictEqual(m.dur[0][0], 0);
    const g = await mapa.geometria([a, b], cfg);
    assert.strictEqual(g.length, 2);
    // Serviço fora do ar: estimativa.
    const fora = await mapa.matriz([a, b], { ...cfg, osrm_url: 'http://127.0.0.1:1' });
    assert.match(fora.fonte, /estimativa/);
  } finally { await s.fechar(); }
});
