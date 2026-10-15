// Boleto (FEBRABAN) e CNAB 240: dígitos, fator de vencimento, campo livre
// de cada banco, código de barras, remessa e leitura do retorno.
const test = require('node:test');
const assert = require('node:assert');
const bol = require('../src/boleto/boleto');
const cnab = require('../src/boleto/cnab240');

test('fator de vencimento: base 07/10/1997 e o recomeço em 22/02/2025', () => {
  assert.strictEqual(bol.fatorVencimento('2000-07-03'), 1000);
  assert.strictEqual(bol.fatorVencimento('2025-02-21'), 9999);
  assert.strictEqual(bol.fatorVencimento('2025-02-22'), 1000);
  assert.strictEqual(bol.fatorVencimento('2025-02-23'), 1001);
});

test('módulo 10 e conferência de linha digitável real', () => {
  assert.strictEqual(bol.modulo10('123412345'), 1);
  assert.strictEqual(bol.modulo10('12341234517512345678'), 5);
  assert.ok(bol.conferirLinha('34191.75124 34567.871230 41234.560005 5 87460000099999'));   // exemplo do Itaú
  assert.ok(!bol.conferirLinha('34191.75124 34567.871230 41234.560005 6 87460000099999'));  // DV geral trocado
  assert.ok(!bol.conferirLinha('34191.75125 34567.871230 41234.560005 5 87460000099999'));  // DV do 1º campo trocado
});

const CFG = {
  '001': { banco: '001', agencia: '1234', conta: '99999', convenio: '1234567', carteira: '17' },
  '341': { banco: '341', agencia: '1234', conta: '12345', carteira: '109' },
  '237': { banco: '237', agencia: '1234', conta: '1234567', carteira: '09' },
  '033': { banco: '033', agencia: '1234', conta: '13000123', convenio: '1234567', carteira: '101' },
  '104': { banco: '104', agencia: '1234', conta: '1234', convenio: '123456' },
  '756': { banco: '756', agencia: '3069', conta: '12345', convenio: '1234567', carteira: '1', modalidade: '01' },
};

test('cada banco: código de barras de 44, linha de 47 que confere, valor e vencimento no lugar', () => {
  for (const [codigo, cfg] of Object.entries(CFG)) {
    const b = bol.montar(cfg, { sequencial: 4321, vencimento: '2026-11-30', valor: 1234.56 });
    assert.match(b.codigoBarras, /^\d{44}$/, codigo);
    assert.strictEqual(b.codigoBarras.slice(0, 3), codigo);
    assert.strictEqual(b.codigoBarras[3], '9');
    assert.strictEqual(b.codigoBarras.slice(5, 9), String(bol.fatorVencimento('2026-11-30')));
    assert.strictEqual(b.codigoBarras.slice(9, 19), '0000123456');
    assert.ok(bol.conferirLinha(b.linhaDigitavel), `linha do banco ${codigo}`);
  }
});

test('campo livre: Banco do Brasil (convênio 7) e Bradesco', () => {
  const bb = bol.montar(CFG['001'], { sequencial: 4321, vencimento: '2026-11-30', valor: 10 });
  assert.strictEqual(bb.codigoBarras.slice(19), '000000' + '1234567' + '0000004321' + '17');
  const br = bol.montar(CFG['237'], { sequencial: 4321, vencimento: '2026-11-30', valor: 10 });
  assert.strictEqual(br.codigoBarras.slice(19), '1234' + '09' + '00000004321' + '1234567' + '0');
  assert.throws(() => bol.montar({ banco: '999' }, { sequencial: 1, vencimento: '2026-11-30', valor: 1 }), /ainda não tem boleto/);
});

test('código de barras I25: 44 dígitos viram 22 pares, início e fim', () => {
  const svg = bol.i25Svg('1'.repeat(44), { estreito: 1 });
  // largura: início 4 + 22 pares × (2 largos×3 + 3 estreitos)×2 = 22×18 + fim 5 = 405
  assert.match(svg, /viewBox="0 0 405 50"/);
});

const titulo = (mov) => ({ movimento: mov, nossoNumero: '12345678', documento: 'FAT15', vencimento: '2026-11-30', valor: 1234.56, emissao: '2026-10-15', usoEmpresa: 'FAT7',
  pagador: { doc: '11222333000181', nome: 'Cliente Ação Ltda', endereco: 'Rua das Flores, 10', bairro: 'Centro', cep: '13010-000', cidade: 'Campinas', uf: 'SP' } });

test('CNAB 240 remessa: 240 posições, segmentos P/Q/R, totais e campos no lugar', () => {
  const txt = cnab.remessa({ ...CFG['341'], banco_nome: 'Itaú', convenio: '', multa: 2, juros_mes: 1 }, { cnpj: '99888777000166', razao_social: 'Transportes São João' }, [titulo('01'), titulo('02')], { nsa: 12, agora: new Date('2026-10-15T15:00:00Z') });
  const l = txt.split('\r\n').filter(Boolean);
  assert.ok(l.every((x) => x.length === 240));
  assert.deepStrictEqual(l.map((x) => x[7] + (x[7] === '3' ? x[13] : '')), ['0', '1', '3P', '3Q', '3R', '3P', '3Q', '5', '9']);
  const p = l[2];
  assert.strictEqual(p.slice(15, 17), '01');                       // movimento: entrada
  assert.strictEqual(p.slice(37, 57).trim(), '12345678');          // nosso número
  assert.strictEqual(p.slice(77, 85), '30112026');                 // vencimento
  assert.strictEqual(p.slice(85, 100), '000000000123456');         // valor
  assert.strictEqual(p.slice(195, 220).trim(), 'FAT7');            // uso da empresa
  assert.strictEqual(l[5].slice(15, 17), '02');                    // pedido de baixa
  assert.strictEqual(l[3].slice(33, 73).trim(), 'CLIENTE ACAO LTDA');   // pagador sem acento
  assert.strictEqual(l[3].slice(128, 136), '13010000');
  assert.strictEqual(l[7].slice(17, 23), '000007');                // registros no lote: header + 5 + trailer
  assert.strictEqual(l[0].slice(157, 163), '000012');              // NSA
  assert.strictEqual(l[8].slice(23, 29), '000009');                // registros no arquivo
});

test('CNAB 240 retorno: liquidação (T+U) e rejeição', () => {
  const linha = (meio) => meio.padEnd(240, ' ');
  const header = linha(`34100000${' '.repeat(9)}2${'99888777000166'.padEnd(14)}`.padEnd(142, ' ') + '2');
  const t = (oc, nn, uso, motivo = '') => linha(`3410001300001T ${oc}${' '.repeat(20)}${nn.padEnd(20)}1${'FAT15'.padEnd(15)}30112026000000000123456${' '.repeat(9)}${uso.padEnd(25)}09${'2'}${'11222333000181'.padStart(15, '0')}${'CLIENTE'.padEnd(40)}${'0'.repeat(10)}000000000000350${motivo.padEnd(10)}`);
  const u = linha(`3410001300002U 06000000000000250${'0'.repeat(15)}${'0'.repeat(15)}${'0'.repeat(15)}000000000123706000000000123356${'0'.repeat(30)}0112202602122026`);
  const txt = [header, t('06', '12345678', 'FAT7'), u, t('03', '99999999', 'FAT9', 'A1'), linha('34199999')].join('\r\n');
  const r = cnab.lerRetorno(txt);
  assert.strictEqual(r.titulos.length, 2);
  const [pago, rej] = r.titulos;
  assert.deepStrictEqual([pago.ocorrencia, pago.nossoNumero, pago.usoEmpresa, pago.valorTitulo, pago.valorPago, pago.juros, pago.tarifa, pago.dataOcorrencia, pago.dataCredito],
    ['06', '12345678', 'FAT7', 1234.56, 1237.06, 2.5, 3.5, '2026-12-01', '2026-12-02']);
  assert.deepStrictEqual([rej.ocorrencia, rej.descricao, rej.motivos], ['03', 'Entrada rejeitada', 'A1']);
  assert.throws(() => cnab.lerRetorno(header.slice(0, 142) + '1' + header.slice(143)), /REMESSA/);
});
