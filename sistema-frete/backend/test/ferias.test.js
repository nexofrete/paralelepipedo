// Férias (src/ferias.js): períodos aquisitivos, saldo, regras da CLT e avisos.
const test = require('node:test');
const assert = require('node:assert');
const f = require('../src/ferias');

test('períodos aquisitivos e concessivos desde a admissão', () => {
  const p = f.periodos('2024-03-10', '2026-11-23');
  assert.deepStrictEqual(p.map((x) => [x.inicio, x.fim, x.concessivo_fim, x.completo]), [
    ['2024-03-10', '2025-03-09', '2026-03-09', true], ['2025-03-10', '2026-03-09', '2027-03-09', true], ['2026-03-10', '2027-03-09', '2028-03-09', false]]);
});

test('saldo e situação do período: vencidas, vencendo, programadas, em aquisição', () => {
  const hoje = '2026-11-23';
  const [p1, p2, p3] = f.periodos('2024-03-10', hoje);
  assert.strictEqual(f.saldoPeriodo(p1, [], hoje).situacao, 'Vencidas');
  assert.strictEqual(f.saldoPeriodo(p2, [], hoje).situacao, 'A programar');
  assert.strictEqual(f.saldoPeriodo(p2, [{ aquisitivo_inicio: p2.inicio, dias: 20, abono_dias: 10, status: 'programada', fim: '2026-12-20' }], hoje).situacao, 'Programadas');
  assert.strictEqual(f.saldoPeriodo(p3, [], hoje).situacao, 'Em aquisição');
  const venc = f.periodos('2025-02-01', '2026-11-23')[0];
  assert.strictEqual(f.saldoPeriodo(venc, [], '2026-11-23').situacao, 'Vencendo');
});

test('regras da CLT: mínimo de 5 dias, até 3 períodos, um com 14, abono até 10 e saldo', () => {
  const funcionario = { admissao: '2024-03-10' };
  const periodo = f.periodos('2024-03-10', '2026-11-23')[1];
  const ok = f.validar({ funcionario, periodo, ferias: [], inicio: '2027-01-11', dias: 30, abono: 0, hoje: '2026-11-23' });
  assert.deepStrictEqual(ok.erros, []); assert.strictEqual(ok.fim, '2027-02-09'); assert.strictEqual(ok.retorno, '2027-02-10');
  assert.match(f.validar({ funcionario, periodo, ferias: [], inicio: '2027-01-11', dias: 4, abono: 0 }).erros.join(), /5 dias/);
  assert.match(f.validar({ funcionario, periodo, ferias: [], inicio: '2027-01-11', dias: 20, abono: 11 }).erros.join(), /abono/);
  const duas = [{ id: 1, aquisitivo_inicio: periodo.inicio, dias: 10, abono_dias: 0, status: 'programada', inicio: '2027-01-04', fim: '2027-01-13' },
    { id: 2, aquisitivo_inicio: periodo.inicio, dias: 10, abono_dias: 0, status: 'programada', inicio: '2027-03-01', fim: '2027-03-10' }];
  assert.match(f.validar({ funcionario, periodo, ferias: duas, inicio: '2027-05-03', dias: 10, abono: 0 }).erros.join(), /14 dias/);
  assert.match(f.validar({ funcionario, periodo, ferias: duas, inicio: '2027-05-03', dias: 11, abono: 0 }).erros.join(), /saldo/);
  assert.match(f.validar({ funcionario, periodo, ferias: [duas[0]], inicio: '2027-01-11', dias: 14, abono: 0 }).erros.join(), /Já há férias/);
});

test('início nos 2 dias antes do domingo ou de feriado dá aviso', () => {
  assert.match(f.avisoInicio('2026-11-27'), /sexta|sábado/);   // sexta
  assert.strictEqual(f.avisoInicio('2026-11-23'), null);         // segunda
  assert.match(f.avisoInicio('2026-12-23'), /feriado/);          // 23/12 → Natal em 25/12 (quarta)
  assert.strictEqual(f.pascoa(2026), '2026-04-05');
  assert.ok(f.feriados(2026).has('2026-04-03'));                  // Sexta-feira Santa
});
