// Upload de fotos/PDF: o tipo vem do conteúdo; HTML disfarçado não passa nem abre como página.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const { detectarTipo, servir } = require('../src/utils/arquivoSeguro');

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const PNG = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(20)]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj<<>>endobj\n', 'latin1');
const HTML = Buffer.from('<img src=x onerror="alert(document.cookie)">', 'utf8');

test('arquivo: tipo pelo conteúdo, não pelo nome', () => {
  assert.deepStrictEqual(detectarTipo(JPG), { ext: '.jpg', mime: 'image/jpeg' });
  assert.strictEqual(detectarTipo(PNG).ext, '.png');
  assert.strictEqual(detectarTipo(PDF).ext, '.pdf');
  assert.strictEqual(detectarTipo(PDF, { pdf: false }), null);   // canhoto/coleta: só foto
  assert.strictEqual(detectarTipo(HTML), null);                   // .html "image/jpeg" não passa
  // Começa como GIF: é tratado como imagem (servido como image/gif, isolado — o navegador não executa).
  assert.strictEqual(detectarTipo(Buffer.from('GIF89a<script>')).mime, 'image/gif');
});

test('arquivo: imagem sai isolada; extensão desconhecida (arquivo antigo) só baixa', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arq-'));
  fs.writeFileSync(path.join(dir, 'a.jpg'), JPG);
  fs.writeFileSync(path.join(dir, 'b.html'), HTML);
  const app = express();
  app.get('/:n', (req, res) => servir(res, path.join(dir, req.params.n)));
  const srv = app.listen(0);
  const pegar = (n) => new Promise((ok) => http.get(`http://127.0.0.1:${srv.address().port}/${n}`, (r) => { r.resume(); r.on('end', () => ok(r.headers)); }));
  try {
    const img = await pegar('a.jpg');
    assert.strictEqual(img['content-type'], 'image/jpeg');
    assert.match(img['content-security-policy'], /sandbox/);
    const html = await pegar('b.html');
    assert.strictEqual(html['content-type'], 'application/octet-stream');
    assert.match(html['content-disposition'], /^attachment/);
    assert.strictEqual(html['x-content-type-options'], 'nosniff');
  } finally { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
