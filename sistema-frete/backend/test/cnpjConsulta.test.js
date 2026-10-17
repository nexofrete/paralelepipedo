const test = require('node:test');
const assert = require('node:assert');
const { consultarServicos, cnpjValido, cpfValido } = require('../src/cnpjConsulta');

const CNPJ = '11222333000181';
const BRASILAPI = { razao_social: 'TRANSPORTES TESTE LTDA', nome_fantasia: 'TESTE', descricao_situacao_cadastral: 'ATIVA', descricao_tipo_de_logradouro: 'RUA', logradouro: 'DAS FLORES',
  numero: '100', complemento: 'SALA 2', bairro: 'CENTRO', cep: '13010-000', municipio: 'CAMPINAS', codigo_municipio_ibge: 3509502, uf: 'SP', ddd_telefone_1: '1933334444', email: 'CONTATO@TESTE.COM.BR' };
const CNPJWS = { razao_social: 'TRANSPORTES TESTE LTDA', estabelecimento: { nome_fantasia: 'TESTE', tipo_logradouro: 'RUA', logradouro: 'DAS FLORES', numero: 'S/N', bairro: 'CENTRO', cep: '13010000',
  cidade: { nome: 'Campinas', ibge_id: 3509502 }, estado: { sigla: 'SP' }, ddd1: '19', telefone1: '33334444', email: null,
  inscricoes_estaduais: [{ inscricao_estadual: '244.555.666.777', ativo: true, estado: { sigla: 'SP' } }, { inscricao_estadual: '999', ativo: true, estado: { sigla: 'RJ' } }] } };
const RECEITAWS = { status: 'OK', nome: 'TRANSPORTES TESTE LTDA', fantasia: '', logradouro: 'R DAS FLORES', numero: '100', bairro: 'CENTRO', cep: '13.010-000', municipio: 'CAMPINAS', uf: 'SP', telefone: '(19) 3333-4444 / (19) 9999-0000', email: '' };

function simular(respostas) {
  const chamadas = [];
  global.fetch = async (url) => {
    chamadas.push(url);
    const chave = url.includes('brasilapi') ? 'b' : url.includes('cnpj.ws') ? 'w' : 'r';
    const r = respostas[chave];
    if (r instanceof Error) throw r;
    if (r === 404) return { status: 404, ok: false };
    return { status: 200, ok: true, json: async () => r };
  };
  return chamadas;
}

test('cnpj: dígitos verificadores de CNPJ e CPF', () => {
  assert.ok(cnpjValido('11222333000181'));
  assert.ok(!cnpjValido('11222333000182'));
  assert.ok(!cnpjValido('11111111111111'));
  assert.ok(cpfValido('52998224725'));
  assert.ok(!cpfValido('52998224726'));
});

test('cnpj: BrasilAPI responde com tudo (endereço separado, IBGE) e para ali', async () => {
  const ch = simular({ b: BRASILAPI });
  const r = await consultarServicos(CNPJ);
  assert.strictEqual(ch.length, 1);
  assert.strictEqual(r.fonte, 'BrasilAPI');
  assert.strictEqual(r.logradouro, 'RUA DAS FLORES'); assert.strictEqual(r.numero, '100'); assert.strictEqual(r.complemento, 'SALA 2');
  assert.strictEqual(r.cep, '13010000'); assert.strictEqual(r.codigo_municipio, '3509502'); assert.strictEqual(r.telefone, '1933334444');
  assert.strictEqual(r.email, 'contato@teste.com.br'); assert.strictEqual(r.cnpj_formatado, '11.222.333/0001-81');
});

test('cnpj: BrasilAPI fora do ar → CNPJ.ws, com a IE do estado', async () => {
  simular({ b: new Error('respondeu 503'), w: CNPJWS });
  const r = await consultarServicos(CNPJ);
  assert.strictEqual(r.fonte, 'CNPJ.ws');
  assert.strictEqual(r.ie, '244555666777');
  assert.strictEqual(r.numero, 'S/N');
  assert.strictEqual(r.codigo_municipio, '3509502');
});

test('cnpj: só a ReceitaWS (sem IBGE) — telefone do 1º número, campos vazios ficam nulos', async () => {
  simular({ b: 404, w: new Error('limite de consultas atingido (429)'), r: RECEITAWS });
  const r = await consultarServicos(CNPJ);
  assert.strictEqual(r.fonte, 'ReceitaWS');
  assert.strictEqual(r.codigo_municipio, null);
  assert.strictEqual(r.telefone, '1933334444');
  assert.strictEqual(r.nome_fantasia, null); assert.strictEqual(r.email, null);
});

test('cnpj: não encontrado em nenhum × falha de rede', async () => {
  simular({ b: 404, w: 404, r: { status: 'ERROR', message: 'CNPJ inválido' } });
  assert.ok((await consultarServicos(CNPJ)).naoEncontrado);
  simular({ b: new Error('demorou demais'), w: new Error('demorou demais'), r: new Error('demorou demais') });
  const r = await consultarServicos(CNPJ);
  assert.ok(r.falhou); assert.match(r.erro, /demorou demais/);
});
