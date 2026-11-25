const test = require('node:test');
const assert = require('node:assert');
const { lerHtml, caminhosApi, montarTexto, urlValida, descreverTela, textoTela, avisoDoLogin } = require('../src/wms');

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

test('descreve a tela de expedição sem os dados das linhas', () => {
  const t = descreverTela(`<title>WMS - Imperium</title><form method="get" action="/wms/exp" id="f">
    <label for="c">Carga:</label><input name="carga" id="c" value="217227"> Data Inicio: <input name="dt_de"> a <input name="dt_ate">
    <select name="status"><option value="">Todos</option><option value="I">INTEGRADO</option></select><input type="submit" value="Buscar"></form>
    <table><tr><th>Expedição</th><th>Cargas</th><th>Status</th></tr><tr><td>84472</td><td>217227</td><td>INTEGRADO</td></tr></table>
    <button onclick="exportar()">Exportar</button>`);
  assert.deepStrictEqual(t.formularios[0].campos.map((c) => c.nome), ['carga', 'dt_de', 'dt_ate', 'status', null]);
  assert.strictEqual(t.formularios[0].campos[0].rotulo, 'Carga:');
  assert.deepStrictEqual(t.formularios[0].campos[3].opcoes, ['=Todos', 'I=INTEGRADO']);
  assert.strictEqual(t.formularios[0].campos[4].valor_botao, 'Buscar');
  assert.deepStrictEqual(t.tabelas[0].titulos, ['Expedição', 'Cargas', 'Status']);
  assert.strictEqual(t.tabelas[0].linhas, 1);
  assert.strictEqual(t.exportar.length, 1);
  const texto = textoTela(t, 'http://wms/exp', 'http://wms/home');
  assert.ok(!/84472/.test(texto), 'o diagnóstico não leva os dados das linhas');
});

test('mensagem de erro do login do WMS', () => {
  assert.strictEqual(avisoDoLogin('<div class="alert alert-danger">Usuário ou senha inválidos</div>'), 'Usuário ou senha inválidos');
  assert.match(avisoDoLogin('<body><p>Login</p><td>Atenção: senha incorreta para o usuário</td></body>'), /senha incorreta para o usuário/);
  assert.strictEqual(avisoDoLogin('<script>alert("Usuario bloqueado")</script>'), 'Usuario bloqueado');
  assert.strictEqual(avisoDoLogin('<form><input type=password></form>'), '');
});
