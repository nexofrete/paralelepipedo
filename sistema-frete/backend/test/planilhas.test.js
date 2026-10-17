const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { lerArquivo, sugerir, mapear, converter, paraNumero, paraData, lerConfigExportacao } = require('../src/integracao/planilhas');

test('planilhas: CSV com ; e acentos (UTF-8 e ANSI) é lido com os cabeçalhos', () => {
  const csv = 'Nota Fiscal;Emissão;Cliente;Peso Bruto\r\n009001;10/10/2026;Ação Ltda;1.250,75\r\n';
  for (const buf of [Buffer.from(csv, 'utf8'), Buffer.from(csv, 'latin1')]) {
    const { cabecalhos, linhas } = lerArquivo(buf, 'x.csv');
    assert.deepStrictEqual(cabecalhos, ['Nota Fiscal', 'Emissão', 'Cliente', 'Peso Bruto']);
    assert.strictEqual(linhas[0]['Nota Fiscal'], '009001');           // zero à esquerda mantido
    assert.strictEqual(linhas[0].Cliente, 'Ação Ltda');
  }
});

test('planilhas: xlsx com colunas repetidas e linha vazia', () => {
  const ws = XLSX.utils.aoa_to_sheet([['NF', 'Valor', 'Valor'], [10, 5.5, 7], [], [11, 1, 2]]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'a');
  const { cabecalhos, linhas } = lerArquivo(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'x.xlsx');
  assert.deepStrictEqual(cabecalhos, ['NF', 'Valor', 'Valor (2)']);
  assert.strictEqual(linhas.length, 2);
});

test('planilhas: sugestão pelo nome da coluna', () => {
  const { colunas } = sugerir(['Nº Pedido', 'Nota Fiscal', 'Chave de Acesso', 'Razão Social', 'Município', 'UF', 'Peso Bruto', 'Qtde Volumes', 'Tipo Frete', 'Coluna estranha']);
  assert.strictEqual(colunas.numero_nf, 'Nota Fiscal');
  assert.strictEqual(colunas.chave_nfe, 'Chave de Acesso');
  assert.strictEqual(colunas.cliente, 'Razão Social');
  assert.strictEqual(colunas.cidade, 'Município');
  assert.strictEqual(colunas.peso_kg, 'Peso Bruto');
  assert.strictEqual(colunas.qtd_volumes, 'Qtde Volumes');
  assert.strictEqual(colunas.frete_cif_fob, 'Tipo Frete');
  assert.ok(!Object.values(colunas).includes('Coluna estranha'));
});

test('planilhas: conversões (número BR, data, CIF/FOB, sim/não)', () => {
  assert.strictEqual(paraNumero('1.234,56'), 1234.56);
  assert.strictEqual(paraNumero('R$ 12,5'), 12.5);
  assert.strictEqual(paraNumero('1.234'), 1234);
  assert.strictEqual(paraNumero('12.5'), 12.5);
  assert.strictEqual(paraData('5/3/26'), '2026-03-05');
  assert.strictEqual(paraData('2026-10-16T10:00:00'), '2026-10-16');
  assert.strictEqual(paraData('32/13/2026'), null);
  assert.strictEqual(converter('cif', 'C'), 'CIF');
  assert.strictEqual(converter('cif', 'Fob'), 'FOB');
  assert.strictEqual(converter('sim_nao', 'S'), true);
  assert.strictEqual(converter('sim_nao', 'N'), false);
  assert.strictEqual(converter('documento', '77.888.999/0001-55'), '77888999000155');
});

test('planilhas: mapear usa a NF como chave da linha e marca cancelados', () => {
  const linhas = [{ NF: '009001', Cancel: 'N', Peso: '10,5' }, { NF: '', Cancel: 'S' }, { NF: '42', Cancel: 'S', Peso: null }];
  const r = mapear(linhas, { colunas: { numero_nf: 'NF', pedido_cancelado: 'Cancel', peso_kg: 'Peso' } });
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].numero_pedido, '009001'); assert.strictEqual(r[0].peso_kg, 10.5); assert.strictEqual(r[0]._estatus_pedido, null);
  assert.strictEqual(r[1]._estatus_pedido, 'C');
});

test('planilhas: modelo de exportação aceita só colunas conhecidas', () => {
  const c = lerConfigExportacao({ recurso: 'faturas', colunas: [{ campo: 'numero', titulo: 'FAT' }, { campo: 'xpto' }, { campo: 'saldo' }] });
  assert.deepStrictEqual(c.colunas.map((x) => x.campo), ['numero', 'saldo']);
  assert.strictEqual(c.colunas[1].titulo, 'Saldo');
  assert.throws(() => lerConfigExportacao({ recurso: 'nada', colunas: [] }));
});
