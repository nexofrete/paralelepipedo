// Etiquetas de volume: código de barras, leitura e impressão (HTML e ZPL).
const test = require('node:test');
const assert = require('node:assert');
const { codigoVolume, lerCodigo, volumesDoCte, html, zpl } = require('../src/etiquetas');

test('código do volume: 14 dígitos que voltam para CT-e e volume', () => {
  const c = codigoVolume(203, 12);
  assert.strictEqual(c, '77000002030012');
  assert.deepStrictEqual(lerCodigo(c), { cteId: 203, volume: 12 });
  assert.deepStrictEqual(lerCodigo(` ${c}\r\n`), { cteId: 203, volume: 12 });   // o leitor manda Enter
  assert.strictEqual(lerCodigo('77000002030000'), null);   // volume 0 não existe
  assert.strictEqual(lerCodigo('12345'), null);
  // Chave do CT-e (modelo 57) vale como "CT-e inteiro"; chave de NF-e (55) não.
  const chaveCte = '35261011222333000181570010000000231000000231';
  assert.deepStrictEqual(lerCodigo(chaveCte), { chave: chaveCte });
  assert.strictEqual(lerCodigo(chaveCte.replace('57001', '55001')), null);
});

test('volumes do CT-e: unidade 03 / VOLUMES; sem informação, 1', () => {
  assert.strictEqual(volumesDoCte({ carga: { quantidades: [{ cUnid: '01', qCarga: 480 }, { cUnid: '03', tpMed: 'VOLUMES', qCarga: 12 }] } }), 12);
  assert.strictEqual(volumesDoCte({ carga: { quantidades: [{ cUnid: '01', qCarga: 480 }] } }), 1);
  assert.strictEqual(volumesDoCte({}), 1);
  assert.strictEqual(volumesDoCte({ carga: { quantidades: [{ cUnid: '03', qCarga: 50000 }] } }), 999);
});

const etq = (v) => ({ cteId: 5, serie: 1, numero: 23, total: 2, volume: v, codigo: codigoVolume(5, v), nfs: ['1520'], remetente: 'Fábrica <A>', destinatario: 'Loja São João',
  endereco: 'Rua X, 10', bairro: 'Centro', cep: '01000000', cidade: 'Guarulhos', uf: 'SP', origem: 'Campinas/SP', peso: 480.5 });

test('etiqueta HTML: uma página por volume, tamanho da etiqueta e texto escapado', () => {
  const h = html([etq(1), etq(2)], { formato: '100x150', empresa: { nome_fantasia: 'Rápido' } });
  assert.strictEqual((h.match(/class="et"/g) || []).length, 2);
  assert.ok(h.includes('size: 100mm 150mm'));
  assert.ok(h.includes('VOL <b>2</b>/2'));
  assert.ok(h.includes('Fábrica &lt;A&gt;') && !h.includes('<A>'));
  assert.ok(h.includes('<svg'));
});

test('etiqueta ZPL: um ^XA..^XZ por volume, sem acentos e com o código', () => {
  const z = zpl([etq(1), etq(2)], { formato: '100x50' });
  assert.strictEqual((z.match(/\^XA/g) || []).length, 2);
  assert.strictEqual((z.match(/\^XZ/g) || []).length, 2);
  assert.ok(z.includes('^PW800^LL400'));
  assert.ok(z.includes(`^FD${codigoVolume(5, 2)}^FS`));
  assert.ok(!/[ãáç]/i.test(z));
});
