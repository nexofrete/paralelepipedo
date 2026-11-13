// Endereço de entrega e do redespacho lidos dos dados adicionais da NF-e (src/enderecoEntrega.js).
const test = require('node:test');
const assert = require('node:assert');
const e = require('../src/enderecoEntrega');

const ler = (t) => e.lerEndereco(e.blocoRedespacho(t) || e.blocoLocalEntrega(t));

test('redespacho com endereço separado por traços, IE e CEP', () => {
  const r = ler('PEDIDO: 123 //REDESPACHO:TORRES TRANSPORTES RODOFLUVIAL LTDA RUA MINEIROS, 289 - CIDADE INDUSTRIAL SATELITE - GUARULHOS - SP - CEP:07.122-100 - I.E:336.123.456.789 - FRETE POR CONTA DO DESTINO');
  assert.strictEqual(r.nome, 'TORRES TRANSPORTES RODOFLUVIAL LTDA');
  assert.strictEqual(r.logradouro, 'RUA MINEIROS');
  assert.strictEqual(r.numero, '289');
  assert.strictEqual(r.bairro, 'CIDADE INDUSTRIAL SATELITE');
  assert.strictEqual(r.cidade, 'Guarulhos');
  assert.strictEqual(r.uf, 'SP');
  assert.strictEqual(r.cep, '07122100');
  assert.strictEqual(r.conferir, false);
});

test('redespacho com rótulos (CNPJ, END, BAIRRO, CIDADE, UF, CEP)', () => {
  const r = ler('REDESPACHO: TRANSP RAPIDO SUL LTDA CNPJ 11.222.333/0001-81 END: AV BRASIL 500 BAIRRO: CENTRO CIDADE: RIO DE JANEIRO UF: RJ CEP 20000-000');
  assert.strictEqual(r.cnpj, '11222333000181');
  assert.strictEqual(r.logradouro, 'AV BRASIL');
  assert.strictEqual(r.numero, '500');
  assert.strictEqual(r.bairro, 'CENTRO');
  assert.strictEqual(r.cidade, 'Rio de Janeiro');
  assert.strictEqual(r.ibge, '3304557');
});

test('rodovia com km e S/N; cidade sem UF que só existe num estado', () => {
  const a = ler('LOCAL DE ENTREGA: CD ATACADAO RODOVIA BR 101 KM 25, S/N - DISTRITO INDUSTRIAL - SERRA - ES - CEP 29160-000');
  assert.strictEqual(a.logradouro, 'RODOVIA BR 101 KM 25');
  assert.strictEqual(a.numero, 'S/N');
  assert.strictEqual(a.cidade, 'Serra');
  const b = ler('REDESPACHO: TRANSPORTADORA XYZ ME RUA SEM NOME 10 BAIRRO NOVO MOGI DAS CRUZES');
  assert.strictEqual(b.cidade, 'Mogi das Cruzes');
  assert.strictEqual(b.uf, 'SP');
});

test('data de entrega não é endereço; texto sem cidade nem rua fica para conferir', () => {
  assert.strictEqual(e.blocoLocalEntrega('ENTREGA EM 10/11/2026 NO PERIODO DA MANHA'), null);
  const r = ler('REDESPACHO: TRANSP PEQUENA ME - ENTREGAR NO GALPAO DO FUNDO');
  assert.strictEqual(r.nome, 'TRANSP PEQUENA ME');
  assert.strictEqual(r.conferir, true);
  assert.ok(r.motivos.some((m) => /cidade/.test(m)));
});

test('ordem: redespacho > <entrega> do XML > dados adicionais > destinatário', () => {
  const dest = { xNome: 'CLIENTE', enderDest: { xLgr: 'RUA A', nro: '1', xMun: 'RIO DE JANEIRO', UF: 'RJ', cMun: '3304557', CEP: '20000000' } };
  assert.strictEqual(e.daNfe({ dest }).origem, 'destinatario');
  assert.strictEqual(e.daNfe({ dest, infAdic: { infCpl: 'ENTREGAR EM: RUA DAS FLORES, 150 CENTRO - RIO DE JANEIRO - RJ' } }).origem, 'dados_adicionais');
  const comEntrega = e.daNfe({ dest, entrega: { xLgr: 'AV X', nro: '9', xMun: 'NITEROI', UF: 'RJ', cMun: '3303302' }, infAdic: { infCpl: 'ENTREGAR EM: RUA DAS FLORES, 150 - RIO DE JANEIRO - RJ' } });
  assert.strictEqual(comEntrega.origem, 'xml_entrega');
  assert.strictEqual(comEntrega.entrega.cidade, 'NITEROI');
  const comRedesp = e.daNfe({ dest, entrega: { xLgr: 'AV X', nro: '9', xMun: 'NITEROI', UF: 'RJ', cMun: '3303302' }, infAdic: { infCpl: 'REDESPACHO: BRASPRESS RUA Y, 2 - GUARULHOS - SP' } });
  assert.strictEqual(comRedesp.origem, 'redespacho');
  assert.strictEqual(comRedesp.redespacho.cidade, 'Guarulhos');
  assert.strictEqual(comRedesp.entrega.origem, 'xml_entrega');
});
