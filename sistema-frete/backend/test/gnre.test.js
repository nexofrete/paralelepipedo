// GNRE: conferência da linha digitável/código de barras de arrecadação (FEBRABAN), módulo 10 e 11.
const test = require('node:test');
const assert = require('node:assert');
const { lerCodigo, mod10, mod11, linhaFormatada } = require('../src/gnre');

// Monta um código de barras de arrecadação válido (44) e a linha digitável (48) para o teste.
function montar(id, valorCentavos, resto = '00011202611070000000000000123') {
  const m = ['6', '7'].includes(id) ? mod10 : mod11;
  // 8 (arrecadação), 5 (segmento: órgãos governamentais), id (valor/módulo), DV, valor (11), resto (29)
  let c = `85${id}0${String(valorCentavos).padStart(11, '0')}${resto}`.slice(0, 44);
  c = c.slice(0, 3) + m(c.slice(0, 3) + c.slice(4)) + c.slice(4);
  const linha = [0, 1, 2, 3].map((i) => { const b = c.slice(i * 11, i * 11 + 11); return b + m(b); }).join('');
  return { c, linha };
}

test('GNRE: módulo 10 e 11 da arrecadação', () => {
  assert.strictEqual(mod10('01230067896'), 3);
  assert.strictEqual(mod11('0000000000'), 0);   // resto 0: DV 0
  for (let i = 0; i < 50; i += 1) { const s = String(Math.floor(Math.random() * 1e10)).padStart(10, '0'); const d = mod11(s); assert.ok(d >= 0 && d <= 9); }
});

test('GNRE: linha digitável e código de barras conferidos, com o valor', () => {
  for (const id of ['6', '8']) {
    const { c, linha } = montar(id, 11520);
    const pelaLinha = lerCodigo(linha);
    assert.strictEqual(pelaLinha.erro, undefined, `id ${id}: ${pelaLinha.erro}`);
    assert.strictEqual(pelaLinha.codigo, c);
    assert.strictEqual(pelaLinha.valor, 115.2);
    assert.strictEqual(lerCodigo(c).linha, linha);
    assert.strictEqual(lerCodigo(linhaFormatada(linha)).codigo, c);   // com pontos, traços e espaços
  }
  const { linha } = montar('7', 5000);
  assert.strictEqual(lerCodigo(linha).valor, null);   // 7/9: a guia não traz o valor em reais
});

test('GNRE: recusa linha errada', () => {
  const { c, linha } = montar('6', 3600);
  const trocado = linha.slice(0, 20) + ((Number(linha[20]) + 1) % 10) + linha.slice(21);
  assert.match(lerCodigo(trocado).erro, /2º bloco/);
  const cTrocado = c.slice(0, 10) + ((Number(c[10]) + 1) % 10) + c.slice(11);
  assert.match(lerCodigo(cTrocado).erro, /dígito verificador geral/);
  assert.match(lerCodigo('123').erro, /48 números/);
  assert.match(lerCodigo(`2${linha.slice(1)}`).erro, /começa com 8/);
  assert.match(lerCodigo(`8${'5'}${'2'}${linha.slice(3)}`).erro, /3º número/);
});
