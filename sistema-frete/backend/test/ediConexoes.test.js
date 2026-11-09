// EDI por SFTP/FTP: filtro dos nomes de arquivo e pastas.
const test = require('node:test');
const assert = require('node:assert');
const cx = require('../src/ediConexoes');

test('EDI SFTP/FTP: filtro de arquivos (vazio = todos; * e ?; sem diferença de maiúsculas)', () => {
  assert.strictEqual(cx.filtroDe('')('qualquer.pdf'), true);
  const f = cx.filtroDe('*.txt; OCO*');
  assert.strictEqual(f('OCOREN_1.TXT'), true);
  assert.strictEqual(f('conemb.txt'), true);
  assert.strictEqual(f('OCO123.EDI'), true);
  assert.strictEqual(f('relatorio.pdf'), false);
  assert.strictEqual(cx.filtroDe('DOC???.TXT')('DOC001.txt'), true);
  assert.strictEqual(cx.filtroDe('a.b')('aXb'), false);   // ponto é literal
});

test('EDI SFTP/FTP: pasta sempre com barra no começo', () => {
  assert.strictEqual(cx.pastaLimpa('saida'), '/saida');
  assert.strictEqual(cx.pastaLimpa('\\saida\\edi'), '/saida/edi');
  assert.strictEqual(cx.pastaLimpa(''), '/');
  assert.strictEqual(cx.pastaLimpa('./in'), './in');
});
