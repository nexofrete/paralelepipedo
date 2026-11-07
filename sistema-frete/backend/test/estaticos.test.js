// Telas mais leves: página com as referências versionadas, cache longo com ?v=, compressão,
// 304 pela impressão e nada fora da pasta public.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const express = require('express');
const { criar, comprimirJson } = require('../src/estaticos');

function servidor() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-estaticos-'));
  fs.mkdirSync(path.join(raiz, 'js'));
  fs.writeFileSync(path.join(raiz, 'js', 'a.js'), `console.log(${JSON.stringify('x'.repeat(5000))});`);
  fs.writeFileSync(path.join(raiz, 'pagina.html'), '<html><script src="js/a.js"></script><script src="https://cdn.exemplo/x.js"></script><img src="img/nao-existe.png"></html>');
  fs.writeFileSync(path.join(path.dirname(raiz), `${path.basename(raiz)}-segredo.txt`), 'segredo');
  const app = express();
  app.use(criar(raiz));
  app.use('/api', comprimirJson);
  app.get('/api/lista', (req, res) => res.json({ itens: Array.from({ length: 500 }, (_, i) => ({ i, nome: 'item repetido' })) }));
  app.get('/api/pouco', (req, res) => res.status(201).json({ ok: true }));
  return new Promise((ok) => { const s = app.listen(0, () => ok({ s, raiz, url: `http://127.0.0.1:${s.address().port}` })); });
}

test('Estáticos: versão no endereço, cache, compressão e 304', async () => {
  const { s, raiz, url } = await servidor();
  try {
    const html = await (await fetch(`${url}/pagina.html`)).text();
    const m = /src="js\/a\.js\?v=([a-f0-9]{12})"/.exec(html);
    assert.ok(m, html);
    assert.match(html, /src="https:\/\/cdn\.exemplo\/x\.js"/);   // de fora: intacto
    assert.match(html, /src="img\/nao-existe\.png"/);              // não existe: intacto
    const r = await fetch(`${url}/js/a.js?v=${m[1]}`, { headers: { 'Accept-Encoding': 'br' } });
    assert.strictEqual(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const sem = await fetch(`${url}/js/a.js`, { headers: { 'Accept-Encoding': 'identity' }, compress: false });
    assert.strictEqual(sem.headers.get('cache-control'), 'no-cache');
    // Comprimido de verdade (o fetch do Node descomprime sozinho: confere pelo http cru).
    const cru = await new Promise((ok) => require('http').get(`${url}/js/a.js`, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => { const p = []; res.on('data', (d) => p.push(d)); res.on('end', () => ok({ res, corpo: Buffer.concat(p) })); }));
    assert.strictEqual(cru.res.headers['content-encoding'], 'gzip');
    assert.ok(cru.corpo.length < 500);
    assert.match(zlib.gunzipSync(cru.corpo).toString(), /^console\.log/);
    // Mesma versão: 304.
    const r304 = await fetch(`${url}/js/a.js`, { headers: { 'If-None-Match': `"${m[1]}"` } });
    assert.strictEqual(r304.status, 304);
    // Arquivo mudou: impressão nova na página.
    fs.writeFileSync(path.join(raiz, 'js', 'a.js'), 'console.log("nova versão");');
    const html2 = await (await fetch(`${url}/pagina.html`)).text();
    assert.ok(!html2.includes(m[1]));
    // Fora da pasta: não serve.
    for (const p of ['/../x', `/%2e%2e/${path.basename(raiz)}-segredo.txt`, '/..%2f..%2fetc%2fpasswd']) {
      const r2 = await fetch(`${url}${p}`);
      assert.strictEqual(r2.status, 404, p);
    }
  } finally { s.close(); }
});

test('Estáticos: JSON da API comprimido (só os grandes) e com o status certo', async () => {
  const { s, url } = await servidor();
  try {
    const grande = await new Promise((ok) => require('http').get(`${url}/api/lista`, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => { const p = []; res.on('data', (d) => p.push(d)); res.on('end', () => ok({ res, corpo: Buffer.concat(p) })); }));
    assert.strictEqual(grande.res.headers['content-encoding'], 'gzip');
    assert.strictEqual(JSON.parse(zlib.gunzipSync(grande.corpo)).itens.length, 500);
    const pouco = await fetch(`${url}/api/pouco`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.strictEqual(pouco.status, 201);
    assert.strictEqual(pouco.headers.get('content-encoding'), null);
    assert.deepStrictEqual(await pouco.json(), { ok: true });
  } finally { s.close(); }
});
