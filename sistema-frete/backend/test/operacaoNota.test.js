// Operação da NF-e pelo CFOP (src/notasFiscais.js classificarOperacao): o "Faturamento do dia" soma só venda e bonificação.
const test = require('node:test');
const assert = require('node:assert');
const { classificarOperacao: op } = require('../src/notasFiscais');

test('venda pelo CFOP (dentro do estado, interestadual, ST, a não contribuinte, exportação)', () => {
  for (const c of ['5102', '6102', '5101', '5405', '6403', '6108', '5117', '7101', '5656']) assert.strictEqual(op({ cfops: [c] }), 'venda', c);
});
test('bonificação pelo CFOP x910 ou pela natureza com 5949', () => {
  assert.strictEqual(op({ cfops: ['5910'] }), 'bonificacao');
  assert.strictEqual(op({ cfops: ['6910'], natureza: 'REMESSA EM BONIFICACAO' }), 'bonificacao');
  assert.strictEqual(op({ cfops: ['5949'], natureza: 'Bonificação' }), 'bonificacao');
});
test('nota com itens de venda e de bonificação conta como venda', () => {
  assert.strictEqual(op({ cfops: ['5102', '5910'], natureza: 'VENDA E BONIFICACAO' }), 'venda');
});
test('remessa, transferência, devolução, conserto e entrada ficam de fora', () => {
  for (const c of ['5152', '6152', '5915', '5912', '5949', '6202', '5901', '5551']) assert.strictEqual(op({ cfops: [c], natureza: 'OUTRA' }), 'outra', c);
  assert.strictEqual(op({ cfops: ['5102'], finNFe: '4' }), 'outra');   // devolução
  assert.strictEqual(op({ cfops: ['1102'], tpNF: '0' }), 'outra');     // entrada
});
