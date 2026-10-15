// Coletas: validação do pedido (o que a tela e o app mandam).
const test = require('node:test');
const assert = require('node:assert');
const { lerColeta, STATUS, MOTIVOS } = require('../src/coletas');

const base = { remetente_nome: 'Atacado X', logradouro: 'Rua A', cidade: 'Campinas', uf: 'sp' };

test('coleta: normaliza números, documentos e UF', () => {
  const c = lerColeta({ ...base, remetente_doc: '11.222.333/0001-81', peso_kg: '1.250,5', valor_mercadoria: '15.300,00', volumes: '12', cep: '13010-000', hora_de: '08:00', hora_ate: '12:00' });
  assert.strictEqual(c.uf, 'SP');
  assert.strictEqual(c.remetente_doc, '11222333000181');
  assert.strictEqual(c.peso_kg, 1250.5);
  assert.strictEqual(c.valor_mercadoria, 15300);
  assert.strictEqual(c.volumes, 12);
  assert.strictEqual(c.cep, '13010000');
  assert.strictEqual(c.tomador, 'remetente');
  assert.strictEqual(c.canal, 'telefone');
  assert.match(c.data_coleta, /^\d{4}-\d{2}-\d{2}$/);
});

test('coleta: recusa pedido incompleto ou incoerente', () => {
  assert.throws(() => lerColeta({ ...base, remetente_nome: ' ' }), /remetente/);
  assert.throws(() => lerColeta({ ...base, cidade: '' }), /cidade/);
  assert.throws(() => lerColeta({ ...base, logradouro: '' }), /endereço/);
  assert.throws(() => lerColeta({ ...base, remetente_doc: '123' }), /CNPJ\/CPF do remetente/);
  assert.throws(() => lerColeta({ ...base, hora_de: '14:00', hora_ate: '09:00' }), /horário/);
  assert.throws(() => lerColeta({ ...base, data_coleta: '2000-01-01' }), /antiga/);
  // Valores inválidos viram "não informado", não erro.
  assert.strictEqual(lerColeta({ ...base, peso_kg: 'abc', volumes: '-3' }).peso_kg, null);
  assert.strictEqual(lerColeta({ ...base, canal: 'pombo' }).canal, 'telefone');
  assert.strictEqual(lerColeta({ ...base, tomador: 'destinatario' }).tomador, 'destinatario');
});

test('coleta: situações e motivos do motorista', () => {
  assert.deepStrictEqual(Object.keys(STATUS), ['pendente', 'programada', 'em_coleta', 'coletada', 'nao_coletada', 'cancelada']);
  assert.ok(MOTIVOS.includes('Outro'));
});
