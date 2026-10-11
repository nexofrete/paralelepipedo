// Roteirização: municípios, restrições de circulação, jornada e sequência.
const test = require('node:test');
const assert = require('node:assert');
const { municipio, distanciaKm } = require('../../src/roteirizacao/municipios');
const { avaliar, deBrasilia, relogio } = require('../../src/roteirizacao/restricoes');
const { simular, otimizar, proximoAtendimento } = require('../../src/roteirizacao/otimizar');

test('municípios: acha por código IBGE e por nome + UF (sem acento)', () => {
  assert.strictEqual(municipio({ ibge: '3550308' }).nome, 'São Paulo');
  const c = municipio({ cidade: 'SAO JOSE DOS CAMPOS', uf: 'sp' });
  assert.strictEqual(c.ibge, '3549904');
  const km = distanciaKm(municipio({ ibge: '3550308' }), municipio({ ibge: '3304557' }));
  assert.ok(km > 340 && km < 380, `SP→RJ em linha reta deu ${km}`);
});

const ZMRC = { id: 1, cidade: 'São Paulo', uf: 'SP', categorias: 'tres_quartos,toco,truck,carreta', dias: '1,2,3,4,5', inicio: '05:00', fim: '21:00', tipo: 'proibido', efeito: 'esperar', descricao: 'ZMRC' };
const RODIZIO = { id: 2, cidade: 'São Paulo', uf: 'SP', categorias: '', dias: '1,2,3,4,5', inicio: '07:00', fim: '10:00', tipo: 'rodizio', finais: { 1: '1,2', 2: '3,4' }, efeito: 'esperar', descricao: 'Rodízio' };
const paradaSP = { cidade: 'SAO PAULO', uf: 'SP', bairro: 'SE' };

test('restrição: toco chega 09:00 de segunda em SP → espera até 21:00; VUC passa', () => {
  const seg9 = deBrasilia('2026-10-12T09:00');   // segunda-feira
  assert.strictEqual(relogio(seg9).dia, 1);
  const r = avaliar([ZMRC], paradaSP, { categoria: 'toco' }, seg9);
  assert.strictEqual(relogio(r.liberadoMs).hora, '21:00');
  assert.strictEqual(r.esperaMin, 720);
  assert.strictEqual(avaliar([ZMRC], paradaSP, { categoria: 'vuc' }, seg9).esperaMin, 0);
  // Sábado não está na regra.
  assert.strictEqual(avaliar([ZMRC], paradaSP, { categoria: 'toco' }, deBrasilia('2026-10-10T09:00')).esperaMin, 0);
});

test('rodízio: só para o final de placa do dia; regra que atravessa a meia-noite', () => {
  const seg8 = deBrasilia('2026-10-12T08:00');
  assert.strictEqual(avaliar([RODIZIO], paradaSP, { categoria: 'vuc', placaFinal: '2' }, seg8).esperaMin, 120);
  assert.strictEqual(avaliar([RODIZIO], paradaSP, { categoria: 'vuc', placaFinal: '5' }, seg8).esperaMin, 0);
  const noite = { ...ZMRC, inicio: '22:00', fim: '06:00', dias: '1' };
  assert.strictEqual(avaliar([noite], paradaSP, { categoria: 'toco' }, deBrasilia('2026-10-12T23:00')).esperaMin, 420);   // seg 23h → ter 6h
  assert.strictEqual(avaliar([noite], paradaSP, { categoria: 'toco' }, deBrasilia('2026-10-13T05:00')).esperaMin, 60);    // ter 5h (janela de seg)
});

// Pontos numa linha: 0 (origem) — A(10) — B(20) — C(30): melhor ordem é 1,2,3.
function linha(pos) {
  const dur = pos.map((a) => pos.map((b) => Math.abs(a - b)));
  return { dur, dist: dur.map((l) => l.map((v) => v)) };
}

test('sequência: acha a ordem mais curta e conta pausas do motorista', () => {
  const { dur, dist } = linha([0, 30, 10, 20]);
  const paradas = [{ nome: 'origem' }, { nome: 'C', servicoMin: 10 }, { nome: 'A', servicoMin: 10 }, { nome: 'B', servicoMin: 10 }];
  const ctx = { dur, dist, paradas, saidaMs: deBrasilia('2026-10-12T07:00'), regras: [], veiculo: { categoria: 'toco' }, voltar: false };
  assert.deepStrictEqual(otimizar(ctx), [2, 3, 1]);
  const s = simular([2, 3, 1], ctx);
  assert.strictEqual(s.km, 30);
  assert.strictEqual(s.jornadaMin, 30 + 30);
  // Trecho de 6h dirigindo: uma pausa de 30 min no meio.
  const longo = { ...ctx, dur: [[0, 360], [360, 0]], dist: [[0, 400], [400, 0]], paradas: [{}, { servicoMin: 0 }] };
  const sl = simular([1], longo);
  assert.strictEqual(sl.pausas, 1);
  assert.strictEqual(sl.jornadaMin, 390);
  // Trecho de 15h: pausas de 30 min e um pernoite de 11h ao completar 10h de jornada.
  const muitoLongo = { ...longo, dur: [[0, 900], [900, 0]] };
  const sm = simular([1], muitoLongo);
  assert.strictEqual(sm.pernoites, 1);
  assert.strictEqual(sm.dirigindoMin, 900);
  assert.match(sm.alertasJornada[0], /pernoite/);
  // Sem pernoite (dois motoristas): só o alerta de jornada.
  const sem = simular([1], { ...muitoLongo, pernoite: false });
  assert.strictEqual(sem.pernoites, 0);
  assert.match(sem.alertasJornada[0], /passa da jornada/);
});

test('sequência: evita chegar na janela proibida quando há outra ordem', () => {
  // Origem fora de SP; parada 1 em SP (proibida 05–21h para toco), parada 2 em outra cidade.
  // Saindo 04:00: ir primeiro a SP (chega 04:30, antes da janela) é melhor que deixar SP para depois.
  const dur = [[0, 30, 60], [30, 0, 60], [60, 60, 0]];
  const paradas = [{}, { ...paradaSP, servicoMin: 15 }, { cidade: 'CAMPINAS', uf: 'SP', servicoMin: 15 }];
  const ctx = { dur, dist: dur, paradas, saidaMs: deBrasilia('2026-10-12T04:00'), regras: [ZMRC], veiculo: { categoria: 'toco' }, voltar: false };
  const ordem = otimizar(ctx);
  assert.deepStrictEqual(ordem, [1, 2]);
  const ruim = simular([2, 1], ctx);
  assert.ok(ruim.passos[1].esperaMin > 0 && ruim.passos[1].alertas.length);
});

test('horário de recebimento: espera abrir, passa para o dia útil seguinte', () => {
  const rec = { inicio: '08:00', fim: '18:00', dias: [1, 2, 3, 4, 5] };
  assert.strictEqual(relogio(proximoAtendimento(deBrasilia('2026-10-12T06:30'), rec)).texto, 'seg 12/10 08:00');
  assert.strictEqual(relogio(proximoAtendimento(deBrasilia('2026-10-12T10:00'), rec)).texto, 'seg 12/10 10:00');
  assert.strictEqual(relogio(proximoAtendimento(deBrasilia('2026-10-12T19:00'), rec)).texto, 'ter 13/10 08:00');
  assert.strictEqual(relogio(proximoAtendimento(deBrasilia('2026-10-16T18:30'), rec)).texto, 'seg 19/10 08:00');   // sexta à noite → segunda
  // Na simulação: chega 06:30, descarrega 08:00, com o aviso.
  const ctx = { dur: [[0, 30], [30, 0]], dist: [[0, 20], [20, 0]], paradas: [{}, { cidade: 'CAMPINAS', uf: 'SP', servicoMin: 20 }],
    saidaMs: deBrasilia('2026-10-12T06:00'), regras: [], veiculo: { categoria: 'toco' }, recebimento: rec };
  const s = simular([1], ctx);
  assert.strictEqual(s.passos[0].esperaMin, 90);
  assert.match(s.passos[0].alertas[0].texto, /horário de recebimento/);
});

test('restrição que cobre todo o horário de recebimento: avisa o conflito, não adia para sempre', () => {
  const rec = { inicio: '08:00', fim: '18:00', dias: [1, 2, 3, 4, 5] };
  const regra = { ...ZMRC, efeito: 'esperar', inicio: '06:00', fim: '20:00' };
  const ctx = { dur: [[0, 30], [30, 0]], dist: [[0, 20], [20, 0]], paradas: [{}, { ...paradaSP, servicoMin: 20 }],
    saidaMs: deBrasilia('2026-10-12T07:00'), regras: [regra], veiculo: { categoria: 'toco' }, recebimento: rec };
  const s = simular([1], ctx);
  assert.strictEqual(s.conflitos, 1);
  assert.strictEqual(s.passos[0].chegada.slice(0, 3), 'seg');
  assert.ok(s.passos[0].alertas.some((a) => a.tipo === 'conflito'));
  assert.ok(s.passos[0].esperaMin < 24 * 60);
});
