// Serviços extras: cálculo pelo preço (percentual, fixo, por hora/dia com franquia, % da mercadoria) e o mínimo.
const test = require('node:test');
const assert = require('node:assert');
const { calcular, tomadorDoc, MOTIVOS_REENTREGA, SERVICOS } = require('../src/servicosExtras');

test('Serviços extras: cálculo de cada modo', () => {
  assert.strictEqual(calcular({ modo: 'percentual', valor: 50 }, { frete: 300 }), 150);
  assert.strictEqual(calcular({ modo: 'percentual', valor: 50, minimo: 200 }, { frete: 300 }), 200);   // mínimo
  assert.strictEqual(calcular({ modo: 'fixo', valor: 45 }), 45);
  assert.strictEqual(calcular({ modo: 'por_hora', valor: 80, franquia: 5 }, { quantidade: 7.5 }), 200);
  assert.strictEqual(calcular({ modo: 'por_hora', valor: 80, franquia: 5, minimo: 100 }, { quantidade: 4 }), 0);   // dentro da franquia não cobra (nem o mínimo)
  assert.strictEqual(calcular({ modo: 'por_dia', valor: 30, franquia: 3 }, { quantidade: 5 }), 60);
  assert.strictEqual(calcular({ modo: 'mercadoria_dia', valor: 0.1, franquia: 2 }, { mercadoria: 50000, quantidade: 4 }), 100);
  assert.strictEqual(calcular({ modo: 'percentual', valor: 0 }, { frete: 300 }), 0);
});

test('Serviços extras: quem paga, motivos de reentrega e documento de cada serviço', () => {
  const d = { tomador: '3', remetente: { cnpj: '11222333000181' }, destinatario: { cnpj: '11.444.777/0001-61' } };
  assert.strictEqual(tomadorDoc(d), '11444777000161');
  assert.ok(MOTIVOS_REENTREGA.includes('fechado') && MOTIVOS_REENTREGA.includes('ausente'));
  assert.ok(!MOTIVOS_REENTREGA.includes('avaria_total'));   // falha nossa não vira reentrega cobrada
  assert.strictEqual(SERVICOS.armazenagem.documento, 'nfse');
  assert.strictEqual(SERVICOS.reentrega.documento, 'cte');
});
