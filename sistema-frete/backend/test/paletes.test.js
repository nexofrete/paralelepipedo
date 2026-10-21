// Paletes: a troca (o que falta vira vale), a devolução baixando os vales do mais antigo e quem recebe a carga.
const test = require('node:test');
const assert = require('node:assert');
const { troca, distribuir, parteDaEntrega } = require('../src/paletes');

test('Paletes: troca na entrega — o que não voltou vira vale; voltou a mais baixa vales antigos', () => {
  assert.deepStrictEqual(troca(12, 4), { saida: 12, entrada: 4, falta: 8, sobra: 0 });
  assert.deepStrictEqual(troca(10, 10), { saida: 10, entrada: 10, falta: 0, sobra: 0 });
  assert.deepStrictEqual(troca(0, 5), { saida: 0, entrada: 5, falta: 0, sobra: 5 });
  assert.deepStrictEqual(troca('', 'x'), { saida: 0, entrada: 0, falta: 0, sobra: 0 });
  assert.deepStrictEqual(troca(-3, 2), { saida: 0, entrada: 2, falta: 0, sobra: 2 });
});

test('Paletes: devolução baixa os vales do que vence antes, começando pelo escolhido', () => {
  const vales = [
    { id: 1, quantidade: 8, devolvidos: 3, cobrados: 0, vencimento: '2026-11-20' },
    { id: 2, quantidade: 6, devolvidos: 0, cobrados: 0, vencimento: '2026-10-11' },
    { id: 3, quantidade: 4, devolvidos: 0, cobrados: 4, vencimento: '2026-09-01' },
  ];
  assert.deepStrictEqual(distribuir(vales, 8), { aplicado: [{ vale_id: 2, qtd: 6 }, { vale_id: 1, qtd: 2 }], sobra: 0 });
  assert.deepStrictEqual(distribuir(vales, 20), { aplicado: [{ vale_id: 2, qtd: 6 }, { vale_id: 1, qtd: 5 }], sobra: 9 });
  assert.deepStrictEqual(distribuir(vales, 3, 1), { aplicado: [{ vale_id: 1, qtd: 3 }], sobra: 0 });
  assert.deepStrictEqual(distribuir([], 4), { aplicado: [], sobra: 4 });
});

test('Paletes: a parte da entrega é o recebedor do CT-e, senão o destinatário', () => {
  assert.deepStrictEqual(parteDaEntrega({ destinatario: { cnpj: '77.888.999/0001-55', xNome: 'LOJA' } }), { doc: '77888999000155', nome: 'LOJA' });
  assert.deepStrictEqual(parteDaEntrega({ destinatario: { cnpj: '77888999000155', xNome: 'LOJA' }, recebedor: { cpf: '529.982.247-25', xNome: 'CD' } }), { doc: '52998224725', nome: 'CD' });
  assert.deepStrictEqual(parteDaEntrega({}), { doc: null, nome: 'Destinatário' });
});
