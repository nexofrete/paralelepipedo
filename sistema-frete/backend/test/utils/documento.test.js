const test = require('node:test');
const assert = require('node:assert');
const Doc = require('../../src/utils/documento');
const { consultar } = require('../../src/cnpjConsulta');

test('CNPJ alfanumérico: exemplo oficial da Receita confere o dígito', () => {
  assert.strictEqual(Doc.cnpjValido('12ABC34501DE35'), true);
  assert.strictEqual(Doc.cnpjValido('12.ABC.345/01DE-35'), true);
  assert.strictEqual(Doc.cnpjValido('12abc34501de35'), true);
  assert.strictEqual(Doc.cnpjValido('12ABC34501DE36'), false);
  assert.strictEqual(Doc.cnpjValido('12ABC34501DEA5'), false);   // DV tem de ser número
  assert.strictEqual(Doc.cnpjValido('11222333000181'), true);    // numérico continua valendo
  assert.strictEqual(Doc.cnpjValido('11111111111111'), false);
});

test('limpar: guarda letras só no CNPJ alfanumérico', () => {
  assert.strictEqual(Doc.limpar('12.abc.345/01de-35'), '12ABC34501DE35');
  assert.strictEqual(Doc.limpar('11.222.333/0001-81'), '11222333000181');
  assert.strictEqual(Doc.limpar('123.456.789-09'), '12345678909');
  assert.strictEqual(Doc.limpar(''), null);
  assert.strictEqual(Doc.limpar(null), null);
});

test('formatar e valido', () => {
  assert.strictEqual(Doc.formatar('12ABC34501DE35'), '12.ABC.345/01DE-35');
  assert.strictEqual(Doc.formatar('11222333000181'), '11.222.333/0001-81');
  assert.strictEqual(Doc.formatar('12345678909'), '123.456.789-09');
  assert.strictEqual(Doc.valido('12.ABC.345/01DE-35'), true);
  assert.strictEqual(Doc.valido('123.456.789-09'), true);
  assert.strictEqual(Doc.formatoOk('12ABC34501DE35'), true);
});

test('consulta de CNPJ alfanumérico responde sem chamar os serviços', async () => {
  const antes = global.fetch;
  global.fetch = async () => { throw new Error('não devia consultar'); };
  try {
    const r = await consultar('12.ABC.345/01DE-35');
    assert.strictEqual(r.naoEncontrado, true);
    assert.strictEqual(r.alfanumerico, true);
    assert.match(r.erro, /alfanumérico/);
    await assert.rejects(consultar('12ABC34501DE36'), /dígito verificador/);
  } finally { global.fetch = antes; }
});
