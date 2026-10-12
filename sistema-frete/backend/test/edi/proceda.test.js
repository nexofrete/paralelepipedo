const test = require('node:test');
const assert = require('node:assert');
const edi = require('../../src/edi/arquivos');

const larguras = (texto) => [...new Set(texto.split('\r\n').filter(Boolean).map((l) => l.length))];
const quando = '2026-10-12T14:30:00';

test('NOTFIS: monta com linhas de 240 e lê de volta (acentos, decimais, CPF)', () => {
  const texto = edi.montarNotfis({
    remetente: 'INDUSTRIA X', destinatario: 'FAST-X', data: quando,
    embarcador: { cnpj: '44.555.666/0001-99', ie: '111222333444', razao: 'Indústria Remetente S/A', endereco: 'Rua São João, 100', cidade: 'Campinas', cep: '13000-000', uf: 'SP' },
    destinatarios: [
      { razao: 'Cliente Ação Ltda', cnpj: '77888999000155', cidade: 'Rio de Janeiro', uf: 'RJ', codigoMunicipio: '3304557', cep: '20000000',
        notas: [{ serie: '1', numero: 1234, emissao: '2026-10-10', volumes: 12, valor: 10000.5, peso: 520.55, cubagem: 1.25, condicaoFrete: 'C' }] },
      { razao: 'José da Silva', cnpj: '123.456.789-09', cidade: 'Niterói', uf: 'RJ', notas: [{ serie: '1', numero: 1235, emissao: '2026-10-11', volumes: 1, valor: 99.9, peso: 3 }] },
    ],
  });
  assert.deepStrictEqual(larguras(texto), [240]);
  const l = edi.lerNotfis(texto);
  assert.strictEqual(l.data, '2026-10-12'); assert.strictEqual(l.hora, '14:30');
  assert.match(l.documento, /^NOTFI1210143\d/);
  const [emb] = l.embarcadores;
  assert.strictEqual(emb.razao, 'INDUSTRIA REMETENTE S/A'); assert.strictEqual(emb.cnpj, '44555666000199');
  assert.strictEqual(emb.destinatarios.length, 2);
  const n = emb.destinatarios[0].notas[0];
  assert.deepStrictEqual([n.numero, n.serie, n.emissao, n.volumes, n.valor, n.peso, n.cubagem], [1234, '1', '2026-10-10', 12, 10000.5, 520.55, 1.25]);
  assert.strictEqual(emb.destinatarios[0].razao, 'CLIENTE ACAO LTDA');
  assert.strictEqual(emb.destinatarios[1].tipoIdentificacao, 2);
  assert.strictEqual(l.totais.valorNotas, 10100.4);
});

test('NOTFIS: acha a chave da NF-e numa linha extra do parceiro e tolera linhas cortadas', () => {
  const base = edi.montarNotfis({ embarcador: { cnpj: '44555666000199' }, destinatarios: [{ razao: 'C', notas: [{ numero: 1 }] }] });
  const linhas = base.trimEnd().split('\r\n').map((x) => x.trimEnd());
  const i = linhas.findIndex((x) => x.startsWith('313'));
  linhas.splice(i + 1, 0, '333' + '35261044555666000199550010000000011000000013');
  const l = edi.lerNotfis(linhas.join('\n'));
  assert.strictEqual(l.embarcadores[0].destinatarios[0].notas[0].chave, '35261044555666000199550010000000011000000013');
});

test('CONEMB: linhas de 680 (322 com 740), mais de 40 notas viram linha de continuação e voltam juntas', () => {
  const notas = Array.from({ length: 45 }, (_, i) => ({ serie: '1', numero: 5000 + i }));
  const texto = edi.montarConemb({ transportadora: { cnpj: '11222333000181', razao: 'Transportes Teste' }, conhecimentos: [
    { serie: '1', numero: '000123', emissao: '2026-10-11', peso: 520.5, valorFrete: 350.5, baseIcms: 350.5, aliquotaIcms: 12, valorIcms: 42.06,
      fretePeso: 300, freteValor: 50.5, cnpjEmissorNf: '44555666000199', notas, cfop: '6353' },
    { serie: '1', numero: 124, emissao: '2026-10-11', valorFrete: 100, cnpjEmissorNf: '44555666000199', notas: [{ serie: '1', numero: 9 }] },
  ] });
  assert.deepStrictEqual(larguras(texto).sort(), [680, 740]);
  assert.strictEqual(texto.split('\r\n').filter((x) => x.startsWith('322')).length, 3);
  const l = edi.lerConemb(texto);
  assert.strictEqual(l.conhecimentos.length, 2);
  const c = l.conhecimentos[0];
  assert.deepStrictEqual([c.numero, c.valorFrete, c.aliquotaIcms, c.valorIcms, c.peso, c.cfop, c.notas.length, c.notas[44].numero],
    [123, 350.5, 12, 42.06, 520.5, '6353', 45, 5044]);
  assert.strictEqual(l.totais.valorTotal, 450.5);
  assert.strictEqual(l.transportadora.razao, 'TRANSPORTES TESTE');
});

test('OCOREN: linhas de 120, código de entrega vira "entregue"', () => {
  const texto = edi.montarOcoren({ transportadora: { cnpj: '11222333000181', razao: 'T' }, ocorrencias: [
    { cnpjEmissorNf: '44555666000199', serie: '1', numero: 1234, codigo: 1, data: '2026-10-12', hora: '09:45' },
    { cnpjEmissorNf: '44555666000199', serie: '1', numero: 1235, codigo: 21, data: '2026-10-12', hora: '16:10', texto: 'Loja fechada, volta amanhã' },
  ] });
  assert.deepStrictEqual(larguras(texto), [120]);
  const l = edi.lerOcoren(texto);
  assert.deepStrictEqual(l.ocorrencias.map((o) => [o.numero, o.codigo, o.data, o.hora, o.entregue]), [[1234, 1, '2026-10-12', '09:45', true], [1235, 21, '2026-10-12', '16:10', false]]);
  assert.strictEqual(l.ocorrencias[0].texto, 'ENTREGA REALIZADA NORMALMENTE');
  assert.strictEqual(l.ocorrencias[1].texto, 'LOJA FECHADA, VOLTA AMANHA');
});

test('DOCCOB: linhas de 170, fatura com CT-e e notas', () => {
  const texto = edi.montarDoccob({ transportadora: { cnpj: '11222333000181', razao: 'T' }, cobrancas: [{
    serie: '1', numero: '72235', emissao: '2026-10-10', vencimento: '2026-10-25', valor: 450.5, icms: 54.06, banco: 'Banco do Brasil', agencia: 1234, agenciaDv: '5', conta: 98765, contaDv: '0',
    conhecimentos: [
      { serie: '1', numero: 123, valorFrete: 350.5, emissao: '2026-10-11', cnpjRemetente: '44555666000199', cnpjDestinatario: '77888999000155', cnpjEmissor: '11222333000181',
        notas: [{ serie: '1', numero: 1234, emissao: '2026-10-10', peso: 520.5, valor: 10000 }] },
      { serie: '1', numero: 124, valorFrete: 100, emissao: '2026-10-11', cnpjRemetente: '44555666000199' },
    ] }] });
  assert.deepStrictEqual(larguras(texto), [170]);
  const l = edi.lerDoccob(texto);
  const f = l.cobrancas[0];
  assert.deepStrictEqual([f.numero, f.vencimento, f.valor, f.icms, f.conhecimentos.length, f.conhecimentos[0].notas[0].numero, f.conhecimentos[0].notas[0].cnpjEmissor],
    ['72235', '2026-10-25', 450.5, 54.06, 2, 1234, '44555666000199']);
  assert.strictEqual(l.totais.valorTotal, 450.5);
});

test('reconhece o tipo do arquivo e avisa valor que não cabe no campo', () => {
  assert.strictEqual(edi.tipoDoArquivo(edi.montarOcoren({ ocorrencias: [{ numero: 1, codigo: 1 }] })), 'OCOREN');
  assert.strictEqual(edi.tipoDoArquivo('qualquer coisa'), null);
  assert.throws(() => edi.montarNotfis({ destinatarios: [{ notas: [{ numero: 1, peso: 123456 }] }] }), /não cabe no campo "peso"/);
});

test('3.1 — NOTFIS com 333 (CFOP), 314 (mercadorias) e 316 (redespacho) vai e volta', () => {
  const texto = edi.montarNotfis({ embarcador: { cnpj: '44555666000199' }, destinatarios: [{ razao: 'C', cnpj: '77888999000155', notas: [{
    numero: 77, serie: '1', emissao: '2026-10-10', cfop: '6102', mercadorias: [{ volumes: 3, especie: 'Caixas', mercadoria: 'Cadeira' }, { volumes: 1, especie: 'Fardo', mercadoria: 'Mesa' }],
    redespacho: { razao: 'Fast Logística', cnpj: '22333444000155', cidade: 'Guarulhos', uf: 'SP', cep: '07000-000' } }] }] });
  assert.deepStrictEqual(larguras(texto), [240]);
  const n = edi.lerNotfis(texto).embarcadores[0].destinatarios[0].notas[0];
  assert.strictEqual(n.cfop, 6102);
  assert.strictEqual(n.tipoIcms, 'S');
  assert.deepStrictEqual(n.mercadorias.map((m) => [m.volumes, m.mercadoria]), [[3, 'CADEIRA'], [1, 'MESA']]);
  assert.deepStrictEqual([n.redespacho.razao, n.redespacho.cidade, n.redespacho.uf], ['FAST LOGISTICA', 'GUARULHOS', 'SP']);
});

test('3.1 — CONEMB leva modelo, chave e protocolo do CT-e (322 com 740 posições)', () => {
  const chave = '35261011222333000181570010000001231000001234';
  const texto = edi.montarConemb({ transportadora: { cnpj: '11222333000181' }, conhecimentos: [{ serie: '1', numero: 123, valorFrete: 10, cfop: '6353', chaveCte: chave, protocoloCte: '135260000000001', notas: [{ serie: '1', numero: 5 }] }] });
  const l322 = texto.split('\r\n').find((x) => x.startsWith('322'));
  assert.strictEqual(l322.length, 740);
  assert.strictEqual(l322.slice(681, 725), chave);
  const c = edi.lerConemb(texto).conhecimentos[0];
  assert.deepStrictEqual([c.modelo, c.chaveCte, c.protocoloCte, c.cfop, c.tipoDescricao], ['57', chave, '135260000000001', '6353', 'Normal']);
});

test('3.1 — OCOREN com 343 (redespacho) e código de observação', () => {
  const texto = edi.montarOcoren({ ocorrencias: [{ cnpjEmissorNf: '44555666000199', serie: '1', numero: 9, codigo: 25, data: '2026-10-12', codigoObservacao: 1,
    redespacho: { cnpjContratante: '11222333000181', serieCte: '1', numeroCte: '123' } }] });
  assert.deepStrictEqual(larguras(texto), [120]);
  const o = edi.lerOcoren(texto).ocorrencias[0];
  assert.deepStrictEqual([o.descricao, o.observacao, o.redespacho.numeroCte, o.entregue], ['Mercadoria devolvida ao cliente de origem', 'Devolução / recusa total', '123', false]);
});
