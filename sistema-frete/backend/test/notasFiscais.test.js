// NF-e: os dados completos da nota a partir do XML, a denegação e o DANFE.
const test = require('node:test');
const assert = require('node:assert');
const { dadosDaNota } = require('../src/notasFiscais');
const { danfeHtml } = require('../src/danfe');

const chave = '35261144555666000199550010000730011000730017';
const xml = (cStat = '100', entrega = true) => `<nfeProc><NFe><infNFe Id="NFe${chave}"><ide><natOp>VENDA</natOp><serie>1</serie><nNF>73001</nNF><dhEmi>2026-11-05T09:10:00-03:00</dhEmi><dhSaiEnt>2026-11-05T14:30:00-03:00</dhSaiEnt><tpNF>1</tpNF></ide>
<emit><CNPJ>44555666000199</CNPJ><xNome>INDUSTRIA &amp; CIA</xNome><enderEmit><xMun>SAO PAULO</xMun><UF>SP</UF></enderEmit></emit>
<dest><CNPJ>66777888000199</CNPJ><xNome>LOJA</xNome><enderDest><xLgr>RUA A</xLgr><nro>1</nro><xBairro>CENTRO</xBairro><xMun>GUARULHOS</xMun><UF>SP</UF><CEP>07010000</CEP></enderDest></dest>
${entrega ? '<entrega><xNome>CD</xNome><xLgr>ROD DUTRA</xLgr><nro>KM 225</nro><xMun>GUARULHOS</xMun><UF>SP</UF></entrega>' : ''}
<det><prod><cProd>A</cProd><xProd>PARAFUSO &lt;10MM&gt;</xProd><CFOP>5102</CFOP><qCom>2</qCom><vUnCom>10</vUnCom><vProd>20.00</vProd></prod></det>
<total><ICMSTot><vProd>20.00</vProd><vNF>25.00</vNF></ICMSTot></total>
<transp><modFrete>0</modFrete><vol><qVol>2</qVol><pesoL>9.5</pesoL><pesoB>10</pesoB></vol><vol><qVol>1</qVol><pesoL>4</pesoL><pesoB>5</pesoB></vol></transp></infNFe></NFe>
<protNFe><infProt><nProt>135</nProt><cStat>${cStat}</cStat><xMotivo>x</xMotivo></infProt></protNFe></nfeProc>`;

test('lê série, emitente, valor dos produtos, pesos, saída e local de entrega', () => {
  const d = dadosDaNota(xml());
  assert.strictEqual(d.nf_serie, '1');
  assert.strictEqual(d.emitente_nome, 'INDUSTRIA & CIA');
  assert.strictEqual(d.emitente_cnpj, '44555666000199');
  assert.strictEqual(d.valor_produtos, 20);
  assert.strictEqual(d.peso_bruto, 15);
  assert.strictEqual(d.peso_liquido, 13.5);
  assert.strictEqual(d.data_saida, '2026-11-05 14:30:00');
  const e = JSON.parse(d.entrega_endereco);
  assert.strictEqual(e.logradouro, 'ROD DUTRA');
  assert.strictEqual(e.local_diferente, true);
  assert.strictEqual(d.denegada, false);
});

test('sem local de entrega, usa o endereço do destinatário; cStat 302 é denegada', () => {
  const d = dadosDaNota(xml('302', false));
  assert.strictEqual(JSON.parse(d.entrega_endereco).logradouro, 'RUA A');
  assert.strictEqual(d.denegada, true);
});

test('DANFE traz a chave, o código de barras e escapa o texto da nota', () => {
  const h = danfeHtml(xml());
  assert.ok(h.includes('3526 1144 5556'));
  assert.ok(h.includes('<svg'));
  assert.ok(h.includes('PARAFUSO &lt;10MM&gt;'));
  assert.ok(!h.includes('<10MM>'));
  assert.ok(danfeHtml(xml('302')).includes('USO DENEGADO'));
});
