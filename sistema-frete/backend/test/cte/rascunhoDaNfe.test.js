// NF-e por e-mail: notas do mesmo remetente para o mesmo destino (e mesma
// modalidade de frete) viram um CT-e só; destinos ou CIF/FOB diferentes, CT-e separados.
const test = require('node:test');
const assert = require('node:assert');
const { agrupar } = require('../../src/cte/rascunhoDaNfe');

const nota = (n, { dest = '33444555000166', cMun = '3304557', entrega = null, modFrete = '0' } = {}) => ({
  chave: String(n), numero: String(n), modFrete,
  remetente: { cnpj: '44555666000199', endereco: { cMun: '3509502' } },
  destinatario: { cnpj: dest, endereco: { cMun } }, entrega,
});

test('agrupa por remetente, destinatário, local de entrega e CIF/FOB', () => {
  const grupos = agrupar([
    nota(1), nota(2),                                    // mesmo destino -> juntas
    nota(3, { dest: '77888999000155' }),                 // outro destinatário
    nota(4, { entrega: { cMun: '3518800' } }),           // entrega em outro município
    nota(5, { modFrete: '1' }),                          // FOB: outro tomador
  ]);
  assert.deepStrictEqual(grupos.map((g) => g.map((n) => n.numero)), [['1', '2'], ['3'], ['4'], ['5']]);
});
