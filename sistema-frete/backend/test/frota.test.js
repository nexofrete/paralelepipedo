// Frota: consumo de tanque cheio a tanque cheio, situação do plano preventivo
// e a leitura dos formulários de abastecimento e manutenção.
const test = require('node:test');
const assert = require('node:assert');
const { calcularConsumo, situacaoPlano, lerAbastecimento, lerManutencao, lerPlano } = require('../src/frota');

const ab = (id, km, litros, cheio = true, extra = {}) => ({ id, veiculo_id: 1, data: `2026-10-${String(id).padStart(2, '0')}`, km, litros, tanque_cheio: cheio, combustivel: 'diesel_s10', ...extra });

test('frota: consumo soma os parciais até o próximo tanque cheio e ignora ARLA', () => {
  const c = calcularConsumo([ab(1, 120000, 400), ab(2, 121100, 410), ab(3, 121600, 150, false), ab(4, null, 40, true, { combustivel: 'arla32' }), ab(5, 122100, 260), ab(6, 123300, 480)]);
  assert.strictEqual(c.has(1), false);   // primeiro tanque cheio é só a base
  assert.deepStrictEqual(c.get(2), { km_rodados: 1100, litros_trecho: 410, consumo: 2.68 });
  assert.strictEqual(c.has(3), false);   // parcial não tem consumo próprio
  assert.deepStrictEqual(c.get(5), { km_rodados: 1000, litros_trecho: 410, consumo: 2.44 });
  assert.strictEqual(c.get(6).consumo, 2.5);
});

test('frota: consumo é por veículo', () => {
  const c = calcularConsumo([ab(1, 1000, 100), { ...ab(2, 50000, 100), veiculo_id: 2 }, ab(3, 1300, 100), { ...ab(4, 50500, 100), veiculo_id: 2 }]);
  assert.strictEqual(c.get(3).consumo, 3);
  assert.strictEqual(c.get(4).consumo, 5);
});

test('frota: plano preventivo vence pelo km ou pela data, o que vier primeiro', () => {
  const p = { a_cada_km: 20000, a_cada_dias: 180, aviso_km: 1000, aviso_dias: 15, ultima_km: 100000, ultima_data: '2026-06-01' };
  assert.strictEqual(situacaoPlano(p, 110000, '2026-07-01').situacao, 'em_dia');
  assert.strictEqual(situacaoPlano(p, 119500, '2026-07-01').situacao, 'vencendo');
  assert.strictEqual(situacaoPlano(p, 121000, '2026-07-01').situacao, 'vencido');
  const porData = situacaoPlano(p, 101000, '2026-11-25');
  assert.deepStrictEqual([porData.situacao, porData.proxima_data, porData.falta_dias], ['vencendo', '2026-11-28', 3]);
  assert.strictEqual(situacaoPlano({ ...p, ultima_km: null, ultima_data: null }, 1, '2026-07-01').situacao, 'sem_base');
  assert.strictEqual(situacaoPlano({ a_cada_dias: 365, aviso_dias: 30, ultima_data: '2025-10-01' }, null, '2026-10-15').situacao, 'vencido');
});

test('frota: abastecimento — km com ponto de milhar, preço por litro e km obrigatório', () => {
  const a = lerAbastecimento({ veiculo_id: 1, data: '2026-10-01', km: '120.500', litros: '400,5', valor_total: '2.483,10' });
  assert.deepStrictEqual([a.km, a.litros, a.valor_total, a.tanque_cheio, a.pagamento], [120500, 400.5, 2483.1, true, 'a_vista']);
  assert.throws(() => lerAbastecimento({ veiculo_id: 1, data: '2026-10-01', litros: 100, valor_total: 620 }), /hodômetro/);
  assert.doesNotThrow(() => lerAbastecimento({ veiculo_id: 1, data: '2026-10-01', litros: 40, valor_total: 160, combustivel: 'arla32' }));
  assert.throws(() => lerAbastecimento({ veiculo_id: 1, data: '2026-10-01', km: 1, litros: 400, valor_total: 10 }), /Preço por litro/);
});

test('frota: manutenção soma peças e serviços', () => {
  const m = lerManutencao({ veiculo_id: 1, data: '2026-10-01', descricao: 'Troca de óleo', itens: [
    { tipo: 'peca', descricao: 'Óleo', qtd: '38', valor_unit: '32,50' }, { tipo: 'servico', descricao: 'Mão de obra', qtd: 1, valor_unit: 250 }, { descricao: '' }] });
  assert.strictEqual(m.itens.length, 2);
  assert.strictEqual(m.valor_total, 1485);
  assert.throws(() => lerManutencao({ veiculo_id: 1, descricao: 'x', data: '2026-10-05', data_saida: '2026-10-01' }), /saída/);
  assert.throws(() => lerPlano({ item: 'Óleo' }), /km/);
});
