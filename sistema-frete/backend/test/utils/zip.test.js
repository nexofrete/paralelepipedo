// ZIP próprio (backup completo e pacote do contador): grava, abre de volta,
// confere o CRC e o formato é o padrão (abre com o leitor de XML do sistema).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EscritorZip, abrirZip, crc32 } = require('../../src/utils/zip');
const { lerXmlDoZip } = require('../../src/utils/lerZip');

test('CRC32 conhecido', () => {
  assert.strictEqual(crc32(Buffer.from('123456789')).toString(16), 'cbf43926');
});

test('grava pasta e arquivos, lê de volta igual e detecta corrupção', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
  fs.mkdirSync(path.join(dir, 'fotos', 'sub'), { recursive: true });
  const foto = require('crypto').randomBytes(50000);   // não comprime: fica guardada como está
  fs.writeFileSync(path.join(dir, 'fotos', 'sub', 'entrega.jpg'), foto);
  const arq = path.join(dir, 'b.zip');
  const z = new EscritorZip(arq);
  z.adicionar('banco.sql', 'INSERT INTO x VALUES (1);\n'.repeat(500));
  z.adicionar('notas/ação.xml', '<nfeProc>ç</nfeProc>');
  assert.strictEqual(z.adicionarPasta(path.join(dir, 'fotos'), 'dados/comprovantes'), 1);
  const r = z.fechar();
  assert.strictEqual(r.arquivos, 3);
  const zip = abrirZip(arq);
  assert.deepStrictEqual(zip.entradas.map((e) => e.nome), ['banco.sql', 'notas/ação.xml', 'dados/comprovantes/sub/entrega.jpg']);
  assert.ok(zip.entradas[2].ler().equals(foto));
  zip.fechar();
  assert.strictEqual(lerXmlDoZip(fs.readFileSync(arq))[0].buffer.toString(), '<nfeProc>ç</nfeProc>');
  // Estraga um byte dos dados da foto: a leitura acusa.
  const b = fs.readFileSync(arq); b[b.length - 400] ^= 0xff; fs.writeFileSync(arq, b);
  const ruim = abrirZip(arq);
  assert.throws(() => ruim.entradas.forEach((e) => e.ler()), /corrompido|invalid|incorrect/i);
  ruim.fechar();
});
