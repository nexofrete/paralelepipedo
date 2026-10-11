// Código de barras da chave no DACTE (Code 128).
const test = require('node:test');
const assert = require('node:assert');
const { code128Svg } = require('../../src/cte/codigoBarras');

// Barras e espaços (1 = barra, 0 = espaço) a partir do SVG gerado.
function modulos(svg) {
  let saida = ''; let x = 10;
  for (const m of svg.matchAll(/<rect x="(\d+)" y="0" width="(\d+)"/g)) {
    saida += '0'.repeat(Number(m[1]) - x) + '1'.repeat(Number(m[2]));
    x = Number(m[1]) + Number(m[2]);
  }
  return saida;
}

test('chave numérica: mesmas barras que a biblioteca python-barcode (referência)', () => {
  const referencia = '1101001110010001000110111001001101100100010011000100100110011101001110110111010100011000110110011001100110110010010111100111011010001101100110011001000100110110011001101100110011011001100110011011001100100010011011001100110110011001101100110010011100110100011001001100011101011';
  assert.strictEqual(modulos(code128Svg('35261011222333000181570010000000011000000017', { modulo: 1 })), referencia);
});
