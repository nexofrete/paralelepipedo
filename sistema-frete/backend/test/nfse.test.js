// NFS-e Padrão Nacional (frete municipal): DPS, cancelamento, leitura da NFS-e
// e o ciclo completo pelo simulador do modo demonstração.
const test = require('node:test');
const assert = require('node:assert');
const { montarDps, montarCancelamento, lerNfse, idDps, opSimpNac, dvChave } = require('../src/nfse/montarNfse');
const { assinar } = require('../src/cte/assinatura');
const { gerarCertificadoDemonstracao, lerPfx } = require('../src/cte/certificado');
const simulador = require('../src/nfse/simuladorNfse');

const emit = { cnpj: '11222333000181', codigo_municipio: '3509502', crt: '3', telefone: '(19) 3210-1000', email: 'fiscal@teste.com.br' };
const dados = {
  competencia: '2026-10-15',
  tomador: { doc: '44555666000199', nome: 'INDÚSTRIA & CIA <SA>', end: { cep: '13050000', xLgr: 'Rua A', nro: '10', xBairro: 'Centro', cMun: '3509502' } },
  servico: { descricao: 'Frete municipal', informacoes: 'NF 123' },
  valores: { vServ: 350.5, descontoIncond: 10 },
};

test('NFS-e: identificador da DPS tem 45 posições', () => {
  const id = idDps({ cMun: '3509502', doc: '11222333000181', serie: 1, numero: 42 });
  assert.strictEqual(id, 'DPS350950221122233300018100001000000000000042');
  assert.strictEqual(id.length, 45);
  assert.strictEqual(idDps({ cMun: '3509502', doc: '12345678909', serie: 1, numero: 1 }).slice(10, 25), '100012345678909');
});

test('NFS-e: regime do Simples Nacional a partir do CRT', () => {
  assert.strictEqual(opSimpNac('1'), '3');
  assert.strictEqual(opSimpNac('2'), '3');
  assert.strictEqual(opSimpNac('3'), '1');
  assert.strictEqual(opSimpNac('4'), '2');
});

test('NFS-e: DPS na ordem do leiaute, com texto escapado e valores com 2 casas', () => {
  const { xml, id } = montarDps(dados, emit, {}, { serie: 1, numero: 42, tpAmb: 2, dhEmi: '2026-10-15T10:00:00-03:00' });
  assert.match(xml, new RegExp(`<infDPS Id="${id}"><tpAmb>2</tpAmb><dhEmi>2026-10-15T10:00:00-03:00</dhEmi>`));
  assert.match(xml, /<prest><CNPJ>11222333000181<\/CNPJ><fone>1932101000<\/fone><email>fiscal@teste.com.br<\/email><regTrib><opSimpNac>1<\/opSimpNac><regEspTrib>0<\/regEspTrib><\/regTrib><\/prest>/);
  assert.match(xml, /<xNome>INDÚSTRIA &amp; CIA &lt;SA&gt;<\/xNome>/);
  assert.match(xml, /<cTribNac>160201<\/cTribNac>/);
  assert.match(xml, /<vServ>350.50<\/vServ><\/vServPrest><vDescCondIncond><vDescIncond>10.00<\/vDescIncond>/);
  assert.match(xml, /<tpRetISSQN>1<\/tpRetISSQN><\/tribMun><totTrib><indTotTrib>0<\/indTotTrib>/);
  assert.doesNotMatch(xml, /<pAliq>/);   // a alíquota vem do cadastro do município
});

test('NFS-e: alíquota vai na DPS quando configurado ou no Simples com ISS retido', () => {
  const comAliq = montarDps(dados, emit, { aliquota: 5, informar_aliquota: true }, { serie: 1, numero: 1, tpAmb: 2 }).xml;
  assert.match(comAliq, /<pAliq>5.00<\/pAliq>/);
  const sn = montarDps({ ...dados, valores: { vServ: 100, issRetido: true, pAliq: 2.5 } }, { ...emit, crt: '1' }, {}, { serie: 1, numero: 1, tpAmb: 2 }).xml;
  assert.match(sn, /<opSimpNac>3<\/opSimpNac><regApTribSN>1<\/regApTribSN>/);
  assert.match(sn, /<tpRetISSQN>2<\/tpRetISSQN><pAliq>2.50<\/pAliq>/);
});

test('NFS-e: recusa o que falta', () => {
  const op = { serie: 1, numero: 1, tpAmb: 2 };
  assert.throws(() => montarDps({ ...dados, tomador: { ...dados.tomador, doc: '' } }, emit, {}, op), /tomador/);
  assert.throws(() => montarDps({ ...dados, valores: { vServ: 0 } }, emit, {}, op), /valor/);
  assert.throws(() => montarDps(dados, { ...emit, codigo_municipio: '' }, {}, op), /IBGE/);
  assert.throws(() => montarDps(dados, emit, { cTribNac: '12' }, op), /tributação/);
});

test('NFS-e: pedido de cancelamento (evento 101101)', () => {
  const chave = '35095022211222333000181000000000000126101234567890';
  const { xml, id } = montarCancelamento({ chave, cnpj: '11222333000181', tpAmb: 2, cMotivo: 1, xMotivo: 'Valor do frete informado errado' });
  assert.strictEqual(id, `PRE${chave}101101`);
  assert.match(xml, /<e101101><xDesc>Cancelamento de NFS-e<\/xDesc><cMotivo>1<\/cMotivo><xMotivo>Valor do frete informado errado<\/xMotivo><\/e101101>/);
  assert.throws(() => montarCancelamento({ chave, cnpj: '1', tpAmb: 2, cMotivo: 1, xMotivo: 'curto' }), /15 letras/);
});

test('NFS-e: ciclo pelo simulador (assina, autoriza, lê o ISS, cancela)', () => {
  const g = gerarCertificadoDemonstracao({ razaoSocial: 'TESTE', cnpj: emit.cnpj });
  const cert = lerPfx(g.pfx, g.senha);
  const { xml } = montarDps({ ...dados, valores: { vServ: 1000, issRetido: true } }, emit, {}, { serie: 1, numero: (Date.now() % 1e9) + 1, tpAmb: 2 });
  const assinado = assinar(xml, 'infDPS', cert, { algoritmo: 'sha256' });
  assert.match(assinado, /rsa-sha256/);
  const r = simulador.enviarDps(assinado, { aliquota: 3 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(String(dvChave(r.chave.slice(0, 49))), r.chave[49]);
  const n = lerNfse(r.xmlNfse);
  assert.deepStrictEqual([n.chave, n.pAliq, n.vISS, n.vLiq], [r.chave, 3, 30, 970]);
  assert.strictEqual(simulador.enviarDps(assinado, {}).ok, false);   // duplicidade
  const adulterado = assinado.replace('<vServ>1000.00</vServ>', '<vServ>1.00</vServ>');
  assert.strictEqual(simulador.enviarDps(adulterado, {}).ok, false);
  const canc = montarCancelamento({ chave: r.chave, cnpj: emit.cnpj, tpAmb: 2, cMotivo: 2, xMotivo: 'Servico nao foi prestado ao cliente' });
  assert.strictEqual(simulador.enviarEvento(r.chave, assinar(canc.xml, 'infPedReg', cert, { algoritmo: 'sha256' })).ok, true);
});
