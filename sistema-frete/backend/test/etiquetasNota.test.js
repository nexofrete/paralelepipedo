// Etiqueta de volume da NF-e (src/etiquetasNota.js): volumes escolhidos e ZPL 10 × 7 cm.
const test = require('node:test');
const assert = require('node:assert');
const e = require('../src/etiquetasNota');

const ex = { nome: 'SULPAR UTILIDADES E BAZAR LTDA', rua: 'RUA GENERAL OSORIO, 664', complemento: '', bairro: 'CENTRO', cidade: 'PELOTAS', uf: 'RS',
  cep: '96020-000', transportadora: 'TEMPO JUSTO TRANSPORTES LOGISTICA E ARMAZEM LTDA', volume: 1, total: 68, pedido: '216759', nota: '195975',
  remetente: 'NEXO INDUSTRIA LTDA', remetenteEndereco: 'RUA DAS FLORES, 10 - CENTRO - PORTO ALEGRE/RS', remetenteCep: '90010-000',
  pesoLiquido: '100,00 kg', pesoBruto: '105,00 kg' };

test('volumes: todos, faixa, lista e fora do total', () => {
  assert.deepStrictEqual(e.volumesDaFaixa('', 3), [1, 2, 3]);
  assert.deepStrictEqual(e.volumesDaFaixa('todos', 2), [1, 2]);
  assert.deepStrictEqual(e.volumesDaFaixa('1-3,10', 68), [1, 2, 3, 10]);
  assert.deepStrictEqual(e.volumesDaFaixa('5-2', 10), [2, 3, 4, 5]);
  assert.deepStrictEqual(e.volumesDaFaixa('70, 2', 68), [2]);
});

test('ZPL: 100 × 70 mm em 203 dpi (800 × 560 pontos), uma etiqueta por volume, com volume, pedido e nota', () => {
  const z = e.zpl([ex, { ...ex, volume: 2 }]);
  assert.strictEqual((z.match(/\^XA/g) || []).length, 2);
  assert.match(z, /\^PW800\^LL560/);
  for (const t of ['1 DE 68', '216759', '195975', 'REMETENTE:', 'NEXO INDUSTRIA LTDA', 'CEP: 90010-000', 'DESTINATARIO:', 'ENDERECO DE ENTREGA:',
    'RUA GENERAL OSORIO, 664 - CENTRO', 'PELOTAS - RS | CEP: 96020-000', 'PESO LIQUIDO', '100,00 KG', '105,00 KG']) assert.ok(z.includes(`^FD${t}^FS`), t);
  assert.match(z, /\^GB/);
  assert.match(e.zpl([ex], { dpi: 300 }), /\^PW1200\^LL840/);
});

test('ZPL: texto longo estreita a fonte para caber no bloco (não imprime por cima)', () => {
  const longo = { ...ex, bairro: 'JARDIM DAS FLORES DO NORTE', cidade: 'SAO JOSE DOS CAMPOS', transportadora: 'TRANSPORTADORA EXEMPLO DE NOME BEM COMPRIDO LTDA' };
  for (const m of e.zpl([longo]).matchAll(/\^A0N,(\d+),(\d+)\^FB(\d+),(\d+),\d+,L,0\^FD([^^]*)\^FS/g)) {
    const [, , w, larg, linhas, texto] = m;
    assert.ok(texto.length / Number(linhas) * 0.6 * Number(w) <= Number(larg) + 1, `não cabe: ${texto}`);
  }
});

test('ZPL sem acentos e sem caracteres de comando', () => {
  const z = e.zpl([{ ...ex, nome: 'JOÃO ^ SÃO ~ AÇÚCAR' }]);
  assert.match(z, /\^FDJOAO SAO ACUCAR\^FS/);
});

test('transportadora: XML, CT-e, registro e, por último, o redespacho da nota', () => {
  assert.strictEqual(e.transportadoraDe({ transportadora_nfe: 'B' }, { transportadora: 'A' }), 'A');
  assert.strictEqual(e.transportadoraDe({ transportadora_nfe: null, transportadora_cte: 'C', transportadora: 'D' }), 'C');
  assert.strictEqual(e.transportadoraDe({ redespacho_endereco: JSON.stringify({ nome: 'PICCOLI TRANSPORTES LTDA' }) }), 'REDESP. PICCOLI TRANSPORTES LTDA');
  assert.strictEqual(e.transportadoraDe({}), '');
});

test('HTML: quadros do padrão do ERP (remetente, pedido, NF-e, volume, destinatário, endereço, transportadora, pesos), texto escapado', () => {
  const h = e.html([{ ...ex, nome: 'A <B> & C' }]);
  for (const t of ['Remetente:', 'Pedido', 'NF-e', '1 de 68', 'Destinatário:', 'Endereço de entrega:', 'PELOTAS - RS | CEP: 96020-000', 'Peso Líquido', '105,00 kg']) assert.ok(h.includes(t), t);
  assert.ok(h.includes('A &lt;B&gt; &amp; C'));
  assert.ok(!h.includes('<img'), 'sem logo cadastrado não há imagem');
  assert.ok(e.html([{ ...ex, logo: 'data:image/png;base64,iVBORw0KGgo=' }]).includes('<img src="data:image/png'));
  assert.ok(!e.html([{ ...ex, logo: 'javascript:alert(1)' }]).includes('<img'));
});

test('XML: remetente (emitente), destinatário, volumes e pesos somados', () => {
  const xml = `<nfeProc><NFe><infNFe><emit><CNPJ>44555666000177</CNPJ><xNome>NOMUS DEMONSTRACAO</xNome><enderEmit><xLgr>RUA PASTEUR</xLgr><nro>463</nro><xBairro>BATEL</xBairro><xMun>CURITIBA</xMun><UF>PR</UF><CEP>80250080</CEP></enderEmit></emit>
    <dest><xNome>CLIENTE</xNome><enderDest><xLgr>RUA A</xLgr><nro>49</nro><xCpl>1601</xCpl><xMun>RIO DE JANEIRO</xMun><UF>RJ</UF><CEP>20765240</CEP></enderDest></dest>
    <transp><transporta><xNome>TRANSP X</xNome></transporta><vol><qVol>2</qVol><pesoL>60.000</pesoL><pesoB>63.000</pesoB></vol><vol><qVol>1</qVol><pesoL>40.000</pesoL><pesoB>42.000</pesoB></vol></transp></infNFe></NFe></nfeProc>`;
  const x = e.doXml(xml);
  assert.strictEqual(x.remetente, 'NOMUS DEMONSTRACAO');
  assert.strictEqual(x.remetenteEndereco, 'RUA PASTEUR, 463 - BATEL - CURITIBA/PR');
  assert.strictEqual(x.remetenteCep, '80250080');
  assert.strictEqual(x.volumes, 3);
  assert.strictEqual(x.pesoLiquido, 100);
  assert.strictEqual(x.pesoBruto, 105);
  assert.strictEqual(x.rua, 'RUA A, 49');
});
