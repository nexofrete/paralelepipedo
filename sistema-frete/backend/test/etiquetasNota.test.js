// Etiqueta de volume da NF-e (src/etiquetasNota.js): volumes escolhidos e ZPL 10 × 7 cm.
const test = require('node:test');
const assert = require('node:assert');
const e = require('../src/etiquetasNota');

const ex = { nome: 'SULPAR UTILIDADES E BAZAR LTDA', rua: 'RUA GENERAL OSORIO, 664', complemento: '', bairro: 'CENTRO', cidade: 'PELOTAS', uf: 'RS',
  cep: '96020-000', transportadora: 'TEMPO JUSTO TRANSPORTES LOGISTICA E ARMAZEM LTDA', volume: 1, total: 68, pedido: '216759', nota: '195975' };

test('volumes: todos, faixa, lista e fora do total', () => {
  assert.deepStrictEqual(e.volumesDaFaixa('', 3), [1, 2, 3]);
  assert.deepStrictEqual(e.volumesDaFaixa('todos', 2), [1, 2]);
  assert.deepStrictEqual(e.volumesDaFaixa('1-3,10', 68), [1, 2, 3, 10]);
  assert.deepStrictEqual(e.volumesDaFaixa('5-2', 10), [2, 3, 4, 5]);
  assert.deepStrictEqual(e.volumesDaFaixa('70, 2', 68), [2]);
});

test('ZPL: 100 × 70 mm em 203 dpi (800 × 560 pontos), uma etiqueta por volume, com volume, pedido e nota', () => {
  const z = e.zpl([ex, { ...ex, volume: 2 }]);
  assert.strictEqual((z.match(/\^XA/g) || []).length, 2);
  assert.match(z, /\^PW800\^LL560/);
  assert.match(z, /VOLUMES:\s+1\s+\/\s+68/);
  assert.match(z, /PEDIDO: 216759/);
  assert.match(z, /NOTA: 195975/);
  assert.match(e.zpl([ex], { dpi: 300 }), /\^PW1200\^LL840/);
});

test('ZPL: texto longo estreita a fonte para caber no bloco (não imprime por cima)', () => {
  const longo = { ...ex, bairro: 'JARDIM DAS FLORES DO NORTE', cidade: 'SAO JOSE DOS CAMPOS', transportadora: 'TRANSPORTADORA EXEMPLO DE NOME BEM COMPRIDO LTDA' };
  for (const m of e.zpl([longo]).matchAll(/\^A0N,(\d+),(\d+)\^FB(\d+),(\d+),\d+,L,0\^FD([^^]*)\^FS/g)) {
    const [, , w, larg, linhas, texto] = m;
    assert.ok(texto.length / Number(linhas) * 0.6 * Number(w) <= Number(larg) + 1, `não cabe: ${texto}`);
  }
});

test('ZPL sem acentos e sem caracteres de comando', () => {
  const z = e.zpl([{ ...ex, nome: 'JOÃO ^ SÃO ~ AÇÚCAR' }]);
  assert.match(z, /\^FDJOAO SAO ACUCAR\^FS/);
});
