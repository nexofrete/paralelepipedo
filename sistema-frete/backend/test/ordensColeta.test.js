// Ordens de coleta do embarcador (src/ordensColeta.js): situação de acompanhamento.
const test = require('node:test');
const assert = require('node:assert');
const { situacao } = require('../src/ordensColeta');

const agora = Date.parse('2026-11-23T15:00:00Z');
const h = (n) => new Date(agora + n * 3600000).toISOString();

test('ordem enviada: aguardando, sem resposta depois de 4 h e atrasada depois da janela', () => {
  assert.strictEqual(situacao({ status: 'enviada', enviada_em: h(-1), coletar_em: h(5), janela_min: 120 }, agora), 'Aguardando confirmação');
  assert.strictEqual(situacao({ status: 'enviada', enviada_em: h(-5), coletar_em: h(5), janela_min: 120 }, agora), 'Sem resposta');
  assert.strictEqual(situacao({ status: 'enviada', enviada_em: h(-9), coletar_em: h(-3), janela_min: 120 }, agora), 'Atrasada');
});

test('ordem aceita segue a visita do pátio', () => {
  const base = { status: 'aceita', previsto_em: h(2), janela_min: 60 };
  assert.strictEqual(situacao({ ...base, visita_status: 'agendado' }, agora), 'Confirmada');
  assert.strictEqual(situacao({ ...base, previsto_em: h(-2), visita_status: 'agendado' }, agora), 'Atrasada');
  assert.strictEqual(situacao({ ...base, visita_status: 'em_doca' }, agora), 'No pátio');
  assert.strictEqual(situacao({ ...base, visita_status: 'saiu' }, agora), 'Coletada');
  assert.strictEqual(situacao({ ...base, visita_status: 'nao_compareceu' }, agora), 'Não compareceu');
  assert.strictEqual(situacao({ status: 'recusada' }, agora), 'Recusada');
  assert.strictEqual(situacao({ status: 'rascunho' }, agora), 'Rascunho');
});

test('ordem de descarga: "Descarregada" quando o caminhão sai; XML da compra dá transportadora, volumes e peso', () => {
  assert.strictEqual(situacao({ status: 'aceita', tipo: 'descarga', previsto_em: h(1), visita_status: 'saiu' }, agora), 'Descarregada');
  assert.strictEqual(situacao({ status: 'aceita', tipo: 'coleta', previsto_em: h(1), visita_status: 'saiu' }, agora), 'Coletada');
  const { doXmlCompra } = require('../src/ordensColeta');
  const x = doXmlCompra('<nfeProc><NFe><infNFe><emit><xNome>F</xNome><enderEmit><xMun>Joinville</xMun><UF>SC</UF></enderEmit></emit><transp><transporta><xNome>TRANSP X</xNome></transporta><vol><qVol>2</qVol><pesoB>10.5</pesoB></vol><vol><qVol>1</qVol><pesoB>4</pesoB></vol></transp></infNFe></NFe></nfeProc>');
  assert.deepStrictEqual(x, { transportadora: 'TRANSP X', volumes: 3, peso: 14.5, cidade: 'Joinville', uf: 'SC' });
  assert.deepStrictEqual(doXmlCompra('não é xml'), {});
});
