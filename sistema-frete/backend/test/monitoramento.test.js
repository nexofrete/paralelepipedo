// Monitoramento: distância até a rota, desde quando está parado, chegada prevista, atraso e os alertas.
const test = require('node:test');
const assert = require('node:assert');
const { distanciaAteLinha, paradoDesde, estimarChegadas, atrasoPrevisto, situacao, CONFIG_PADRAO } = require('../src/monitoramento');

test('Monitoramento: distância do caminhão até a linha da rota', () => {
  const linha = [[-22.90, -43.20], [-22.90, -43.10]];   // reta leste-oeste
  assert.ok(distanciaAteLinha({ lat: -22.90, lon: -43.15 }, linha) < 0.05);
  const d = distanciaAteLinha({ lat: -22.95, lon: -43.15 }, linha);   // ~5,5 km ao sul
  assert.ok(d > 5 && d < 6, `deu ${d}`);
  assert.ok(distanciaAteLinha({ lat: -22.90, lon: -43.30 }, linha) > 9);   // passou do começo da linha
  assert.strictEqual(distanciaAteLinha({ lat: 0, lon: 0 }, []), null);
});

test('Monitoramento: parado desde a primeira posição perto da última', () => {
  const t = (min) => new Date(Date.UTC(2026, 9, 21, 12, min)).toISOString();
  const pos = [   // da mais nova para a mais antiga
    { lat: -22.9000, lon: -43.2000, registrado_em: t(40) },
    { lat: -22.9005, lon: -43.2003, registrado_em: t(30) },
    { lat: -22.9001, lon: -43.1999, registrado_em: t(20) },
    { lat: -22.9300, lon: -43.2000, registrado_em: t(10) },
  ];
  assert.strictEqual(paradoDesde(pos), Date.parse(t(20)));
  assert.strictEqual(paradoDesde([]), null);
});

test('Monitoramento: chegadas em sequência com o tempo de cada entrega', () => {
  const agora = Date.UTC(2026, 9, 21, 12, 0);
  const [a, b] = estimarChegadas({ lat: -22.90, lon: -43.20 }, agora, [{ lat: -22.90, lon: -43.20 }, { lat: -22.95, lon: -43.20 }], { atendimento_min: 15, velocidade: 55 });
  assert.strictEqual(a, agora);   // já está lá
  assert.ok(b - a > 15 * 60000 && b - a < 45 * 60000, `${(b - a) / 60000} min`);
  assert.deepStrictEqual(estimarChegadas({ lat: 0, lon: 0 }, agora, [{}]), [null]);
});

test('Monitoramento: atraso pelo agendamento ou pela previsão', () => {
  const t = (iso) => Date.parse(iso);
  assert.match(atrasoPrevisto(t('2026-10-21T15:30:00-03:00'), { agendamento: { data: '2026-10-21', hora_ate: '14:00' } }), /agendamento/);
  assert.strictEqual(atrasoPrevisto(t('2026-10-21T13:30:00-03:00'), { agendamento: { data: '2026-10-21', hora_ate: '14:00' } }), null);
  const amanha = new Date(Date.now() - 3 * 3600000 + 86400000).toISOString().slice(0, 10);
  assert.strictEqual(atrasoPrevisto(Date.parse(`${amanha}T10:00:00-03:00`), { previsao: amanha }), null);
  assert.match(atrasoPrevisto(Date.parse(`${amanha}T10:00:00-03:00`) + 86400000, { previsao: amanha }), /previsão/);
  assert.strictEqual(atrasoPrevisto(Date.now() + 86400000, { previsao: '2020-01-01' }), null);   // já estava atrasada: não repete aqui
});

test('Monitoramento: situação e alertas', () => {
  const agora = Date.now(); const cfg = CONFIG_PADRAO;
  const ultima = { registrado_em: new Date(agora - 60000).toISOString() };
  assert.strictEqual(situacao({ ultima, agoraMs: agora, desdeParadoMs: agora - 60000, cfg }).estado, 'em_movimento');
  const parado = situacao({ ultima, agoraMs: agora, desdeParadoMs: agora - 40 * 60000, cfg });
  assert.strictEqual(parado.estado, 'parado'); assert.strictEqual(parado.alertas[0].tipo, 'parado');
  const cliente = situacao({ ultima, agoraMs: agora, desdeParadoMs: agora - 40 * 60000, cfg, noCliente: 'LOJA' });
  assert.strictEqual(cliente.estado, 'no_cliente'); assert.strictEqual(cliente.alertas.length, 0);
  assert.strictEqual(situacao({ ultima: { registrado_em: new Date(agora - 60 * 60000).toISOString() }, agoraMs: agora, cfg }).estado, 'sem_sinal');
  assert.strictEqual(situacao({ ultima, agoraMs: agora, cfg, foraDaRotaKm: 5 }).alertas[0].tipo, 'desvio');
  assert.strictEqual(situacao({ ultima: null, agoraMs: agora, cfg }).estado, 'sem_posicao');
});
