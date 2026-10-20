// CIOT e vale-pedágio: o que a ANTT exige para abrir a operação e o simulador do provedor.
const test = require('node:test');
const assert = require('node:assert');
const pef = require('../src/pef/pef');
const { PROVEDORES, pedagioEstimado } = require('../src/pef/provedores');

const op = () => ({
  contratante: { cnpj: '11222333000181', nome: 'Transp', rntrc: '12345678' },
  contratado: { doc: '52998224725', nome: 'João', rntrc: '01234567', tipo: 'TAC' },
  motorista: { cpf: '52998224725', nome: 'João' },
  veiculos: [{ placa: 'FRT4E21', eixos: 5 }],
  origem: { ibge: '3509502', cidade: 'Campinas', uf: 'SP' }, destino: { ibge: '3304557', cidade: 'Rio de Janeiro', uf: 'RJ' },
  carga: { natureza: 'Carga geral', peso_kg: 12000 }, valores: { frete: 4500, adiantamento: 1500, saldo: 3000 },
  data_inicio: '2026-10-20', data_fim: null,
});

test('CIOT: operação completa passa; o que falta é listado de uma vez', () => {
  assert.doesNotThrow(() => pef.conferir(op()));
  const o = op();
  o.contratado.rntrc = '12'; o.motorista.cpf = '11111111111'; o.veiculos[0].placa = 'XX'; o.destino = null; o.carga.peso_kg = 0;
  assert.throws(() => pef.conferir(o), (err) => /RNTRC do contratado/.test(err.message) && /CPF do motorista/.test(err.message)
    && /placa/.test(err.message) && /destino/.test(err.message) && /peso/.test(err.message));
});

test('simulador: CIOT de 12 números e vale-pedágio pela rota e pelos eixos', async () => {
  const s = PROVEDORES.simulador;
  const r = await s.declarar(op());
  assert.match(r.ciot, /^\d{12}$/);
  assert.match(r.verificador, /^\d{4}$/);
  const est = pedagioEstimado(op(), 5);
  assert.ok(est > 100 && est < 1000, `estimativa ${est}`);
  const vp = await s.comprarValePedagio(op(), { eixos: 5 }, { vp_fornecedora_cnpj: '11222333000181' });
  assert.strictEqual(vp.valor, est);
  const vp2 = await s.comprarValePedagio(op(), { valor: 321.5, eixos: 5 }, { vp_fornecedora_cnpj: '11222333000181' });
  assert.strictEqual(vp2.valor, 321.5);
  await assert.rejects(s.comprarValePedagio(op(), { eixos: 5 }, {}), /fornecedora/);
});

test('provedores reais sem contrato: avisam e não enviam nada', async () => {
  for (const id of ['pamcard', 'repom', 'efrete', 'target']) {
    await assert.rejects(PROVEDORES[id].declarar(op(), {}), (err) => err.status === 501 && /manual da API/.test(err.message));
  }
});
