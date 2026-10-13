// Painel gerencial: peso (kg/ton), frete por kg, ticket, % no prazo e complementar fora da carga.
const test = require('node:test');
const assert = require('node:assert');
const { pesoKg, indicadores } = require('../../src/routes/painelTransporte').ajudantes;

const cte = (v, q, extra = {}) => ({ valor_total: v, dados: { valores: { vTPrest: v }, carga: { vCarga: v * 20, quantidades: q }, ...(extra.dados || {}) }, ...extra });

test('peso em kg ou toneladas', () => {
  assert.strictEqual(pesoKg({ carga: { quantidades: [{ cUnid: '01', qCarga: 520.5 }, { cUnid: '03', qCarga: 12 }] } }), 520.5);
  assert.strictEqual(pesoKg({ carga: { quantidades: [{ cUnid: '2', qCarga: 1.5 }] } }), 1500);
  assert.strictEqual(pesoKg({}), 0);
});

test('indicadores: frete/kg, ticket, frete sobre a carga e entregas no prazo', () => {
  const dia = (s) => new Date(`${s}T12:00:00Z`);
  const i = indicadores([
    cte(400, [{ cUnid: '01', qCarga: 1000 }], { situacao_entrega: 'entregue', data_entrega: dia('2026-10-03'), previsao_original: dia('2026-10-03') }),
    cte(600, [{ cUnid: '01', qCarga: 1000 }], { situacao_entrega: 'entregue', data_entrega: dia('2026-10-06'), previsao_original: dia('2026-10-04') }),
    cte(100, [], { dados: { tpCTe: '1' } }),   // complementar: entra no faturamento, não na carga
  ]);
  assert.strictEqual(i.faturamento, 1100);
  assert.strictEqual(i.ctes, 2);
  assert.strictEqual(i.complementares, 1);
  assert.strictEqual(i.peso_kg, 2000);
  assert.strictEqual(i.frete_kg, 0.55);
  assert.strictEqual(i.ticket, 550);
  assert.strictEqual(i.pct_no_prazo, 50);
  assert.strictEqual(i.frete_sobre_carga, 5.5);
});
