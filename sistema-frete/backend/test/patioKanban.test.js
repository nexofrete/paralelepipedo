// Kanban gerencial do pátio (src/patio.js, etapaKanban): tempo na etapa e alertas.
const test = require('node:test');
const assert = require('node:assert');
const { etapaKanban } = require('../src/patio');

const agora = Date.parse('2026-11-23T15:00:00Z');
const antes = (min) => new Date(agora - min * 60000).toISOString();

test('tempo na etapa e alerta de quem passou do tempo', () => {
  assert.deepStrictEqual(etapaKanban({ status: 'agendado', previsto_em: antes(-30), janela_min: 60 }, agora), { minutos: -30, alerta: null });
  assert.strictEqual(etapaKanban({ status: 'agendado', previsto_em: antes(90), janela_min: 60 }, agora, { tolMin: 15 }).alerta, 'Atrasado');
  assert.strictEqual(etapaKanban({ status: 'agendado', previsto_em: antes(300), janela_min: 60 }, agora, { naoCompareceuMin: 240 }).alerta, 'Não veio');
  assert.deepStrictEqual(etapaKanban({ status: 'aguardando', chegada_em: antes(20) }, agora), { minutos: 20, alerta: null });
  assert.strictEqual(etapaKanban({ status: 'aguardando', chegada_em: antes(75) }, agora).alerta, 'Esperando há muito tempo');
  assert.strictEqual(etapaKanban({ status: 'em_doca', inicio_doca_em: antes(50), minutos_previstos: 40 }, agora).alerta, 'Passou do tempo na doca');
  assert.strictEqual(etapaKanban({ status: 'em_doca', inicio_doca_em: antes(50) }, agora, { minutosDoca: 60 }).alerta, null);
  assert.deepStrictEqual(etapaKanban({ status: 'saiu', chegada_em: antes(120), saida_em: antes(10) }, agora), { minutos: 110, alerta: null });
});
