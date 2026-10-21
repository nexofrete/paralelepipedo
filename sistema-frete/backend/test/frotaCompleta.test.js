// Frota completa: jornada (Lei 13.103), posições e custo dos pneus, situação dos documentos.
const test = require('node:test');
const assert = require('node:assert');
const { calcular } = require('../src/jornada');
const pneus = require('../src/pneus');
const { situacao } = require('../src/frotaDocumentos');

const h = (hhmm, dia = '2026-10-20') => `${dia}T${hhmm}:00-03:00`;

test('Jornada: totais, extras, direção contínua, refeição e fim', () => {
  const c = calcular([
    { tipo: 'trabalho', em: h('06:00') }, { tipo: 'direcao', em: h('06:30') }, { tipo: 'espera', em: h('12:30') }, { tipo: 'direcao', em: h('13:30') },
    { tipo: 'refeicao', em: h('14:00') }, { tipo: 'direcao', em: h('14:30') }, { tipo: 'trabalho', em: h('18:30') }, { tipo: 'fim', em: h('19:30') },
  ]);
  assert.deepStrictEqual(c.totais, { trabalho: 90, direcao: 630, pausa: 0, refeicao: 30, espera: 60 });
  assert.strictEqual(c.jornada, 720);   // a espera não conta
  assert.strictEqual(c.extras, 240);
  assert.strictEqual(c.direcao_continua_max, 360);
  assert.deepStrictEqual(c.alertas.map((a) => a.codigo), ['direcao_continua', 'excesso_jornada', 'refeicao']);
  assert.strictEqual(c.estado, 'fim');
});

test('Jornada: descanso fracionado zera a direção contínua; interjornada curta; jornada em dia', () => {
  const c = calcular([
    { tipo: 'direcao', em: h('08:00') }, { tipo: 'pausa', em: h('11:00') }, { tipo: 'direcao', em: h('11:15') }, { tipo: 'pausa', em: h('12:00') },
    { tipo: 'refeicao', em: h('12:15') }, { tipo: 'direcao', em: h('13:15') }, { tipo: 'fim', em: h('16:15') },
  ], { fimAnterior: h('23:00', '2026-10-19') });
  assert.strictEqual(c.jornada, 405);   // 3h + 45 min + 3h de direção
  assert.strictEqual(c.direcao_continua_max, 225);   // 3h + 45 min: as duas pausas de 15 min somam 30 e zeram
  assert.deepStrictEqual(c.alertas.map((a) => a.codigo), ['interjornada']);   // 9h de descanso desde 23h
  const aberta = calcular([{ tipo: 'direcao', em: h('06:00') }], { agora: new Date(h('12:00')) });
  assert.strictEqual(aberta.direcao_continua_atual, 360);
  assert.ok(aberta.alertas.some((a) => a.codigo === 'direcao_continua'));
});

test('Pneus: posições por eixo, nome da posição e custo por km', () => {
  const t = pneus.posicoes({ tipo: 'tracao', eixos: 3 });
  assert.deepStrictEqual(t.eixos[0].lados, ['1E', '1D']);
  assert.deepStrictEqual(t.eixos[1].lados, ['2EE', '2EI', '2DI', '2DE']);
  assert.strictEqual(t.todas.length, 12);
  assert.deepStrictEqual(pneus.posicoes({ tipo: 'reboque', eixos: 2 }).eixos[0].lados, ['1EE', '1EI', '1DI', '1DE']);
  assert.strictEqual(pneus.nomePosicao('2DI'), 'Eixo 2 direito interno');
  assert.strictEqual(pneus.nomePosicao('EST1'), 'Estepe 1');
  const r = pneus.resumir({ status: 'montado', km_montagem: 100000, km_acumulado: 40000, valor_compra: '2000', custo_recapagens: '600', sulco_mm: '2.5' }, 110000);
  assert.strictEqual(r.km_total, 50000);
  assert.strictEqual(r.custo_total, 2600);
  assert.strictEqual(r.custo_km, 0.052);
  assert.strictEqual(r.alerta, 'baixo');
  assert.strictEqual(pneus.resumir({ status: 'estoque', sulco_mm: '1.2' }).alerta, 'ilegal');
});

test('Documentos: vencido, vencendo (pelo aviso) e em dia', () => {
  assert.deepStrictEqual(situacao({ validade: '2026-10-01' }, '2026-10-21'), { situacao: 'vencido', dias: -20 });
  assert.strictEqual(situacao({ validade: '2026-11-05', aviso_dias: 30 }, '2026-10-21').situacao, 'vencendo');
  assert.strictEqual(situacao({ validade: '2026-11-05', aviso_dias: 10 }, '2026-10-21').situacao, 'em_dia');
  assert.strictEqual(situacao({}, '2026-10-21').situacao, 'sem_validade');
});
