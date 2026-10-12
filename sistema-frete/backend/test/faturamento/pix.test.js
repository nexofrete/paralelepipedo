// PIX copia e cola (BR Code): CRC do exemplo oficial do Banco Central e montagem.
const test = require('node:test');
const assert = require('node:assert');
const { brCode, crc16, normalizarChave } = require('../../src/faturamento/pix');

test('CRC16 do exemplo do manual do BR Code (Banco Central)', () => {
  const exemplo = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
  assert.strictEqual(crc16(exemplo), '1D3D');
});

test('BR Code com valor, nome, cidade e txid da fatura', () => {
  const c = brCode({ chave: '11.222.333/0001-81', nome: 'Transportes São João Ltda', cidade: 'Campinas', valor: 1234.5, txid: 'FAT-42', descricao: 'Fatura 42' });
  assert.match(c, /^000201/);
  assert.match(c, /0014br\.gov\.bcb\.pix011411222333000181/);
  assert.match(c, /54071234\.50/);
  assert.match(c, /5925TRANSPORTES SAO JOAO LTD/);
  assert.match(c, /6008CAMPINAS/);
  assert.match(c, /62090505FAT42/);
  assert.strictEqual(c.slice(-4), crc16(c.slice(0, -4)));
});

test('chaves PIX: e-mail, celular, aleatória e documento', () => {
  assert.strictEqual(normalizarChave('Financeiro@Empresa.com.br'), 'financeiro@empresa.com.br');
  assert.strictEqual(normalizarChave('+55 (11) 98765-4321'), '+5511987654321');
  assert.strictEqual(normalizarChave('123E4567-E12B-12D1-A456-426655440000'), '123e4567-e12b-12d1-a456-426655440000');
  assert.strictEqual(normalizarChave('529.982.247-25'), '52998224725');
  assert.throws(() => brCode({ chave: '', nome: 'X', cidade: 'Y', valor: 1 }), /chave PIX/);
});
