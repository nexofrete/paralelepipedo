const test = require('node:test');
const assert = require('node:assert');
const { lerHtml, caminhosApi, montarTexto, urlValida } = require('../src/wms');

test('lê o formulário de login sem pegar valores', () => {
  const h = lerHtml(`<html><head><title>WMS - Login</title></head><body>
    <form action="/auth/login" method="post" id="frm"><input type="hidden" name="_token" value="SEGREDO123">
    <input name="login" id="usuario" value="andre"><input type="password" name="senha" value="minhasenha"><button type="submit">Entrar</button></form></body></html>`);
  assert.strictEqual(h.titulo, 'WMS - Login');
  assert.strictEqual(h.formularios[0].method, 'POST');
  assert.strictEqual(h.formularios[0].action, '/auth/login');
  assert.deepStrictEqual(h.formularios[0].campos.map((c) => c.nome), ['_token', 'login', 'senha', null]);
  assert.ok(h.pistas.includes('Formulário com token anti-CSRF'));
  const texto = montarTexto({ passos: [{ url: 'http://x/auth/login', status: 200, ms: 5, tipo: 'text/html', cookies: ['SESSAO'] }], html: h });
  assert.ok(!/SEGREDO123|minhasenha|andre/.test(texto), 'o diagnóstico não pode levar valores');
  assert.ok(/nome=senha/.test(texto));
});

test('acha caminhos de API citados nos scripts', () => {
  const c = caminhosApi('fetch("/api/expedicao/listar");const u=`/auth/token`;x.post(\'/api/v1/cargas/{id}\');"/img/logo.png"');
  assert.deepStrictEqual(c, ['/api/expedicao/listar', '/api/v1/cargas/{id}', '/auth/token']);
});

test('endereço do WMS', () => {
  assert.strictEqual(urlValida(' http://10.150.15.66/auth/login '), 'http://10.150.15.66/auth/login');
  assert.throws(() => urlValida('10.150.15.66'), /inválido/);
  assert.throws(() => urlValida('ftp://10.0.0.1'), /http/);
});
