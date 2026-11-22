// Pátio e portaria: docas compatíveis, prioridade da fila e a simulação (alocação e previsão).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compativel, prioridade, ordenarFila, simular } = require('../src/patio');

const MIN = 60000;
const agora = Date.parse('2026-11-23T10:00:00-03:00');
const t = (min) => new Date(agora + min * MIN).toISOString();
const doca = (id, operacao = 'ambas', extra = {}) => ({ id, nome: `Doca ${id}`, operacao, veiculos: [], minutos_padrao: 60, ordem: id, ativa: true, ...extra });

test('doca compatível: operação e tipo de veículo', () => {
  assert.equal(compativel(doca(1, 'carga'), { operacao: 'carga' }), true);
  assert.equal(compativel(doca(1, 'carga'), { operacao: 'descarga' }), false);
  assert.equal(compativel(doca(1, 'ambas'), { operacao: 'descarga' }), true);
  assert.equal(compativel(doca(1, 'carga', { veiculos: ['toco', 'truck'] }), { operacao: 'carga', tipo_veiculo: 'carreta' }), false);
  assert.equal(compativel(doca(1, 'carga', { veiculos: ['toco', 'truck'] }), { operacao: 'carga', tipo_veiculo: 'truck' }), true);
  assert.equal(compativel(doca(1, 'carga', { ativa: false }), { operacao: 'carga' }), false);
});

test('prioridade: quem chegou na janela passa na frente do atrasado e do sem agendamento', () => {
  const pontual = { id: 1, previsto_em: t(-10), janela_min: 30, chegada_em: t(-5) };
  const atrasado = { id: 2, previsto_em: t(-120), janela_min: 30, chegada_em: t(-30) };
  const semAg = { id: 3, sem_agendamento: true, chegada_em: t(-60) };
  assert.equal(prioridade(pontual, 15)[0], 0);
  assert.equal(prioridade(atrasado, 15)[0], 1);
  assert.equal(prioridade(semAg, 15)[0], 1);
  assert.deepEqual(ordenarFila([atrasado, semAg, pontual], 15).map((v) => v.id), [1, 3, 2]);
});

test('simulação: doca livre chama na hora; ocupada dá a previsão pelo fim da operação', () => {
  const docas = [doca(1, 'carga'), doca(2, 'descarga')];
  const visitas = [
    { id: 10, status: 'em_doca', operacao: 'carga', doca_id: 1, inicio_doca_em: t(-20) },            // libera em 40 min
    { id: 11, status: 'aguardando', operacao: 'carga', chegada_em: t(-15), sem_agendamento: true },   // espera a doca 1
    { id: 12, status: 'aguardando', operacao: 'descarga', chegada_em: t(-5), sem_agendamento: true }, // doca 2 livre agora
    { id: 13, status: 'aguardando', operacao: 'carga', chegada_em: t(-2), sem_agendamento: true },    // depois do 11
  ];
  const { previsoes } = simular({ docas, visitas, agora, tolMin: 15 });
  assert.equal(previsoes[12].doca_id, 2);
  assert.equal(previsoes[12].livre_agora, true);
  assert.equal(previsoes[11].doca_id, 1);
  assert.equal(previsoes[11].espera_min, 40);
  assert.equal(previsoes[13].espera_min, 100);   // 40 + 60 do 11
});

test('simulação: usa o tempo médio real da doca e escolhe a que libera primeiro', () => {
  const docas = [doca(1, 'ambas'), doca(2, 'ambas')];
  const visitas = [
    { id: 20, status: 'em_doca', operacao: 'carga', doca_id: 1, inicio_doca_em: t(-10) },   // média 30 → libera em 20
    { id: 21, status: 'chamado', operacao: 'carga', doca_id: 2, chamado_em: t(0) },        // começa em 5, média 90 → livre em 95
    { id: 22, status: 'aguardando', operacao: 'carga', chegada_em: t(-1), sem_agendamento: true },
  ];
  const medias = { '1|carga': 30, '2|carga': 90 };
  const { previsoes } = simular({ docas, visitas, agora, tolMin: 15, medias });
  assert.equal(previsoes[22].doca_id, 1);
  assert.equal(previsoes[22].espera_min, 20);
  assert.equal(previsoes[22].minutos, 30);
});

test('simulação: sem doca compatível avisa', () => {
  const { previsoes } = simular({ docas: [doca(1, 'descarga')], visitas: [{ id: 30, status: 'aguardando', operacao: 'carga', chegada_em: t(0) }], agora });
  assert.equal(previsoes[30].sem_doca, true);
});
